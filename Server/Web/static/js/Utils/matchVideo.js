/**
 * @file matchVideo.js
 *
 * @brief Vidéo du match dans le rejeu : lecteur qui joue quelques secondes de la vidéo à partir de l'heure
 *        d'un évènement, avec un curseur vidéo déplaçable sur les courbes. La vidéo est synchronisée avec les courbes
 *        par le coup d'envoi : l'instant du coup d'envoi dans la vidéo (réglé dans le lecteur, enregistré dans
 *        videos.json) correspond à l'évènement « Coup d'envoi ». Des évènements « Recalage vidéo » (temps de la vidéo à
 *        un instant du match) corrigent la synchronisation à partir de leur instant (vidéo coupée, mi-temps…).
 *
 *        La vidéo peut être affichée dans la page (agrandissable) ou dans une autre fenêtre (/video-window), pilotée
 *        par le rejeu au travers d'un BroadcastChannel (cf. RemotePlayer et videoWindow.js).
 */

// ============================================================================
//  Import des bibliothèques
// ============================================================================

import { SYNC_CODE, matchTime } from "./matchEvents.js";

// ============================================================================
//  Constantes
// ============================================================================

const CLIP_BEFORE   = 10;  ///< @brief Durée jouée avant l'heure d'un évènement (s).
const CLIP_AFTER    = 10;  ///< @brief Durée jouée après l'heure d'un évènement (s).
const KICKOFF_CODE  = 1;   ///< @brief Code de l'évènement « Coup d'envoi ».

// ============================================================================
//  Vidéo dans une autre fenêtre
// ============================================================================

/**
 * @class RemotePlayer
 *
 * @brief Vidéo d'une autre fenêtre, avec l'interface d'un élément <video> utilisée par MatchVideo
 *        (currentTime, duration, readyState, play(), pause(), src ; évènements timeupdate, seeked, loadedmetadata).
 */
class RemotePlayer extends EventTarget
{
    /**
     * @param {string}   channelName Nom du canal partagé avec la fenêtre de la vidéo.
     * @param {Function} onClosed    Appelée quand la fenêtre de la vidéo est fermée.
     */
    constructor(channelName, onClosed)
    {
        super();
        this.channel  = new BroadcastChannel(channelName);
        this.state    = { currentTime: 0, duration: NaN, readyState: 0, paused: true };
        this.source   = "";
        this.onClosed = onClosed;

        this.channel.onmessage = ({ data }) =>
        {
            if (data.type === "state")
            {
                this.state = data.state;
                this.dispatchEvent(new Event(data.event || "timeupdate"));
            }
            else if (data.type === "ready")
                this._send({ type: "load", src: this.source, time: this.state.currentTime });
            else if (data.type === "closed")
                this.onClosed();
        };
    }

    get currentTime() { return this.state.currentTime; }
    set currentTime(value) { this.state.currentTime = value; this._send({ type: "seek", time: value }); }
    get duration() { return this.state.duration; }
    get readyState() { return this.state.readyState; }
    get paused() { return this.state.paused; }
    get src() { return this.source; }
    set src(value) { this.source = value; this._send({ type: "load", src: value, time: 0 }); }

    play() { this._send({ type: "play" }); return Promise.resolve(); }
    pause() { this._send({ type: "pause" }); }
    caption(text) { this._send({ type: "caption", text: text }); }

    /** @brief Ferme le canal (retour de la vidéo dans la page). */
    dispose()
    {
        this._send({ type: "close" });
        this.channel.close();
    }

    _send(message)
    {
        this.channel.postMessage(message);
    }
}

// ============================================================================
//  Lecteur vidéo
// ============================================================================

export class MatchVideo
{
    /**
     * @param {HTMLElement} root     Lecteur flottant (cf. replay.html).
     * @param {MatchEvents} events   Évènements du match (coup d'envoi, minute de jeu).
     * @param {Object}      settings Réglages des vidéos : {nom: {kickoff: secondes}}.
     * @param {string}      channel  Nom du canal de la fenêtre séparée (propre au rejeu).
     */
    constructor(root, events, settings, channel)
    {
        this.root     = root;
        this.events   = events;
        this.settings = settings || {};
        this.stopAt   = null;
        this.cursor   = null; ///< @brief Instant du match affiché par la vidéo (ms), null si la vidéo n'est pas synchronisée.
        this.charts   = [];   ///< @brief Courbes qui affichent le curseur vidéo.
        this.pending  = false;

        // Affichage du curseur vidéo sur les courbes (mémorisé dans le navigateur)
        this.showCursor = true;
        try { this.showCursor = localStorage.getItem("showVideoCursor") !== "false"; } catch (e) { /* stockage indisponible */ }

        this.video    = root.querySelector("video");
        this.player   = this.video; ///< @brief Vidéo pilotée : celle de la page, ou celle d'une autre fenêtre (RemotePlayer).
        this.channel  = channel;
        this.popup    = null;
        this.select   = root.querySelector("[data-video-file]");
        this.kickoff  = root.querySelector("[data-video-kickoff]");
        this.caption  = root.querySelector("[data-video-caption]");
        this.clock    = root.querySelector("[data-video-clock]");
        this.status   = root.querySelector("[data-video-status]");

        this.closeButton = root.querySelector("[data-video-close]");
        this.closeButton.addEventListener("click", () => this.isOpen ? this.close() : this.open());
        this._setBlanked(root.classList.contains("is-blanked"));
        root.querySelector("[data-video-size]").addEventListener("click", () => this._toggleSize());
        this.cursorToggle = root.querySelector("[data-video-cursor]");
        this.cursorToggle.addEventListener("click", () => this._setShowCursor(!this.showCursor));
        this._setShowCursor(this.showCursor);
        root.querySelector("[data-video-popout]").addEventListener("click", () => this.popup ? this._dockBack() : this._popOut());
        root.querySelector("[data-video-focus]").addEventListener("click", () => this.popup && !this.popup.closed && this.popup.focus());
        this.select.addEventListener("change", () => this._loadSettings());
        this.kickoff.addEventListener("change", () => this._saveKickoff());

        this.kickoff.addEventListener("change", () => this._updateCursor());
        this._bindPlayer(this.video);

        // Fenêtre de la vidéo fermée avec la page du rejeu
        window.addEventListener("beforeunload", () => { if (this.popup && !this.popup.closed) this.popup.close(); });

        this._loadSettings();
    }

    /** @brief Lecteur affiché (ni masqué, ni fermé en noir). */
    get isOpen()
    {
        return !this.root.hidden && !this.root.classList.contains("is-blanked");
    }

    /** @brief Affiche le lecteur. */
    open()
    {
        this.root.hidden = false;
        this._setBlanked(false);
        this._updateCursor();
    }

    /** @brief Colonne de la vidéo remplacée (ou non) par un bloc noir de même taille. */
    _setBlanked(blanked)
    {
        this.root.classList.toggle("is-blanked", blanked);
        this.closeButton.textContent = blanked ? "›" : "×";
        this.closeButton.title = blanked ? "Rouvrir la vidéo" : "Fermer la vidéo";
        this.closeButton.setAttribute("aria-label", this.closeButton.title);
    }

    /** @brief Ferme le lecteur et arrête la vidéo. */
    close()
    {
        if (this.popup)
            this._dockBack();
        this.player.pause();
        this.stopAt = null;
        // Colonne gardée en noir : les courbes conservent leur taille et leur place
        this._setBlanked(true);
        this._updateCursor();
    }

    /**
     * @brief Enregistre une courbe qui affiche le curseur vidéo.
     *
     * @param {TimeChart} chart Courbe.
     */
    register(chart)
    {
        this.charts.push(chart);
    }

    /**
     * @brief Déplace le curseur vidéo (glissé dans une courbe) : la vidéo se positionne à cet instant du match.
     *
     * @param {number} t Instant du match (ms).
     */
    seekTo(t)
    {
        const position = this._videoTime(t);
        if (position == null)
            return ;

        this.stopAt = null;
        if (this.showCursor)
            this.cursor = t;
        this.player.currentTime = Math.max(0, Math.min(this.player.duration || position, position));
        this._refresh();
    }

    /**
     * @brief Instant de la vidéo (s) correspondant à un instant du match (ms), par le coup d'envoi.
     *
     * @returns {number|null} Secondes, null si la vidéo n'est pas synchronisée (pas de coup d'envoi).
     */
    _videoTime(t)
    {
        const anchors = this._anchors();
        if (!anchors.length)
            return null;

        // Dernier point de synchronisation avant l'instant (le premier si l'instant le précède)
        const anchor = anchors.filter((a) => a.t <= t).pop() || anchors[0];

        return anchor.video + (t - anchor.t) / 1000;
    }

    /**
     * @brief Instant du match (ms) correspondant à un instant de la vidéo (s) : inverse de _videoTime().
     *
     * @returns {number|null} Timestamp, null si la vidéo n'est pas synchronisée.
     */
    _matchTime(seconds)
    {
        const anchors = this._anchors();
        if (!anchors.length)
            return null;

        const anchor = anchors.filter((a) => a.video <= seconds).pop() || anchors[0];

        return anchor.t + (seconds - anchor.video) * 1000;
    }

    /**
     * @brief Points de synchronisation, triés par instant : coup d'envoi (instant saisi dans le lecteur) et
     *        recalages vidéo (temps de la vidéo saisi dans l'évènement).
     *
     * @returns {Array<{t: number, video: number}>}
     */
    _anchors()
    {
        const anchors = [];

        const kickoffEvent = this.events.list.find((e) => e.code === KICKOFF_CODE);
        const kickoff      = this._parseTime(this.kickoff.value);
        if (kickoffEvent && kickoff != null)
            anchors.push({ t: kickoffEvent.t, video: kickoff });

        for (const event of this.events.list)
        {
            const video = event.code === SYNC_CODE ? this._parseTime(event.name) : null;
            if (video != null)
                anchors.push({ t: event.t, video: video });
        }

        return anchors.sort((a, b) => a.t - b.t);
    }

    /**
     * @brief Temps de la vidéo ("m:ss") à un instant du match, proposé pour un nouveau recalage :
     *        position de la vidéo si le lecteur est ouvert, sinon d'après la synchronisation actuelle.
     */
    videoTimeAt(t)
    {
        if (this.isOpen && this.player.readyState > 0)
            return this._formatDuration(this.player.currentTime);

        const seconds = this._videoTime(t);
        return seconds != null ? this._formatDuration(seconds) : "";
    }

    /** @brief Instant du match (ms) affiché par la vidéo ; le curseur n'est montré que lecteur ouvert. */
    _updateCursor()
    {
        const visible = this.showCursor && this.isOpen && this.player.readyState > 0;

        this.cursor = visible ? this._matchTime(this.player.currentTime) : null;
        this._refresh();

        // Temps de jeu de l'image affichée par la vidéo (minute et seconde du match)
        const t    = this.isOpen && this.player.readyState > 0 ? this._matchTime(this.player.currentTime) : null;
        const time = t != null ? matchTime(this.events.list, t) : null;
        this.clock.textContent = time ? `Temps de jeu ${time}` : "";
    }

    /** @brief Affiche ou masque le curseur vidéo sur les courbes. */
    _setShowCursor(show)
    {
        this.showCursor = show;
        try { localStorage.setItem("showVideoCursor", show ? "true" : "false"); } catch (e) { /* stockage indisponible */ }
        this.cursorToggle.setAttribute("aria-pressed", show ? "true" : "false");
        this.cursorToggle.title = show ? "Masquer le curseur vidéo sur les courbes" : "Afficher le curseur vidéo sur les courbes";
        this._updateCursor();
    }

    /** @brief Redessine les courbes (une fois par image). */
    _refresh()
    {
        if (this.pending)
            return ;

        this.pending = true;
        requestAnimationFrame(() =>
        {
            this.pending = false;
            for (const chart of this.charts)
                chart.refresh();
        });
    }

    /**
     * @brief Joue la vidéo autour de l'heure d'un évènement : CLIP_BEFORE secondes avant, CLIP_AFTER secondes après.
     *
     * @param {number} id Identifiant de l'évènement.
     */
    playEvent(id)
    {
        const event = this.events.list.find((e) => e.id === id);
        if (!event)
            return ;

        this.open();

        // Évènement et son temps de jeu (minute et seconde du match)
        const style = this.events.style(event);
        const time  = matchTime(this.events.list, event.t);
        this.caption.textContent = `${style.short}${time ? ` · ${time}` : ""}`;
        if (this.popup)
            this.player.caption(this.caption.textContent);

        if (!this.select.value)
            return this._message("Aucune vidéo dans le dossier des vidéos (Resources/Video).");

        const moment = this._videoTime(event.t);
        if (moment == null)
            return this._message("Vidéo non synchronisée : ajoutez le « Coup d'envoi » et saisissez son instant dans la vidéo (ex. 7:39), ou ajoutez un « Recalage vidéo ».");
        if (moment < 0 || (this.player.duration && moment > this.player.duration))
            return this._message(`Cet instant (${this._formatDuration(moment)}) est hors de la vidéo.`);

        // Début de la capsule au plus tôt au début de la vidéo
        const start = Math.max(0, moment - CLIP_BEFORE);

        this._message("");
        this.stopAt = moment + CLIP_AFTER;
        this.player.currentTime = start;
        this.player.play().catch(() => this._message("Lecture bloquée par le navigateur : cliquez sur ▶ dans la vidéo."));
    }

    // ------------------------------------------------------------------------
    //  Fonctions internes
    // ------------------------------------------------------------------------

    /** @brief Écoute la vidéo pilotée : curseur sur les courbes et arrêt à la fin de l'extrait. */
    _bindPlayer(player)
    {
        for (const name of ["timeupdate", "seeked", "loadedmetadata"])
            player.addEventListener(name, () => this._updateCursor());

        player.addEventListener("timeupdate", () =>
        {
            if (player === this.player && this.stopAt != null && player.currentTime >= this.stopAt)
            {
                player.pause();
                this.stopAt = null;
            }
        });
    }

    /** @brief Vignette agrandie ou normale. */
    _toggleSize()
    {
        const large = this.root.classList.toggle("is-large");
        const button = this.root.querySelector("[data-video-size]");
        button.setAttribute("aria-pressed", large ? "true" : "false");
        button.title = large ? "Réduire la vidéo" : "Agrandir la vidéo";
        this._refreshLayout();
    }

    /** @brief Vidéo dans une autre fenêtre : la page n'affiche plus que les réglages ; le rejeu la pilote. */
    _popOut()
    {
        const popup = window.open(`/video-window?channel=${encodeURIComponent(this.channel)}`, `matchVideo-${this.channel}`, "width=1100,height=680");
        if (!popup)
            return this._message("Fenêtre bloquée par le navigateur : autorisez les fenêtres pop-up pour ce site.");

        const time = this.video.currentTime;
        this.video.pause();

        this.popup  = popup;
        this.player = new RemotePlayer(this.channel, () => this._dockBack());
        this.player.source = this.video.src ? new URL(this.video.src).pathname : "";
        this.player.state.currentTime = time;
        this._bindPlayer(this.player);

        this.root.classList.add("is-remote");
        this.root.querySelector("[data-video-popout]").title = "Revenir à la vidéo dans la page";
        this._message("");
        this._refreshLayout();
    }

    /** @brief Retour de la vidéo dans la page, à l'instant où elle était dans l'autre fenêtre. */
    _dockBack()
    {
        if (!this.popup)
            return ;

        const time = this.player.currentTime;
        this.player.dispose();
        if (!this.popup.closed)
            this.popup.close();

        this.popup  = null;
        this.player = this.video;
        this.stopAt = null;
        if (time)
            this.video.currentTime = time;

        this.root.classList.remove("is-remote");
        this.root.querySelector("[data-video-popout]").title = "Afficher la vidéo dans une autre fenêtre";
        this._updateCursor();
        this._refreshLayout();
    }

    /** @brief Courbes redimensionnées après un changement de taille de la vignette. */
    _refreshLayout()
    {
        requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    }

    /** @brief Charge la vidéo choisie et son instant de coup d'envoi. */
    _loadSettings()
    {
        const name = this.select.value;
        if (!name)
            return ;

        const url = `/video/${encodeURIComponent(name)}`;
        if (!this.player.src.endsWith(url))
            this.player.src = url;

        const kickoff = this.settings[name] ? this.settings[name].kickoff : null;
        this.kickoff.value = kickoff != null ? this._formatDuration(kickoff) : "";
    }

    /** @brief Enregistre l'instant du coup d'envoi saisi pour la vidéo choisie (videos.json). */
    _saveKickoff()
    {
        const name    = this.select.value;
        const kickoff = this._parseTime(this.kickoff.value);
        this.kickoff.classList.toggle("is-invalid", this.kickoff.value !== "" && kickoff == null);
        if (!name || (this.kickoff.value !== "" && kickoff == null))
            return ;

        this.settings[name] = { kickoff: kickoff };
        fetch("/video/settings", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ name: name, kickoff: kickoff }),
        })
            .then((response) => response.json())
            .then((result) => this._message(result.error ? `Réglage non enregistré : ${result.error}` : "Coup d'envoi enregistré pour cette vidéo."))
            .catch(() => this._message("Réglage non enregistré (serveur injoignable)."));
    }

    /**
     * @brief Convertit "m:ss", "h:mm:ss" ou un nombre de secondes en secondes.
     *
     * @returns {number|null} Secondes, null si la saisie est invalide ou vide.
     */
    _parseTime(text)
    {
        const value = (text || "").trim().replace(",", ".");
        if (!value)
            return null;

        const parts = value.split(":").map(Number);
        if (parts.some((p) => Number.isNaN(p) || p < 0) || parts.length > 3)
            return null;

        return parts.reduce((total, part) => total * 60 + part, 0);
    }

    /** @brief Durée en "m:ss" (ou "h:mm:ss"). */
    _formatDuration(seconds)
    {
        const total = Math.max(0, Math.round(seconds));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = String(total % 60).padStart(2, "0");

        return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
    }

    _message(text)
    {
        this.status.textContent = text;
    }
}
