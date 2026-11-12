/**
 * @file matchEvents.js
 *
 * @brief Évènements du match affichés sur les graphiques et colonne de saisie.
 *
 * MatchEvents : évènements du match en cours (table "event"), avec ajout à une heure
 * donnée, déplacement et suppression. Les modifications sont partagées en temps réel
 * avec toutes les pages ouvertes.
 *
 * ReplayEvents : mêmes fonctions pour un match rejoué (archive ZIP chargée sur le
 * serveur). Les modifications ne concernent que le rejeu, pas le match en cours.
 */

// ============================================================================
//  Import des bibliothèques
// ============================================================================

import { cssVar, formatTime, PHASE_CODES, GOAL_CODE } from "./timeChart.js";
import { teamAbbreviation } from "./teams.js";

// ============================================================================
//  Constantes
// ============================================================================

const PERIOD_STARTS = { 1: 0, 3: 45, 5: 90, 7: 105 };   ///< @brief Coups d'envoi des périodes et minute de départ.
const PERIOD_ENDS   = { 1: 45, 3: 90, 5: 105, 7: 120 }; ///< @brief Minute de fin réglementaire de chaque période.
const STOP_CODE     = 34;                              ///< @brief Code de l'évènement "Arrêt du jeu" (chrono arrêté).
const RESTART_CODE  = 35;                              ///< @brief Code de l'évènement "Reprise du jeu" (chrono relancé).
export const FREE_CODE = 99;                           ///< @brief Code d'un évènement libre : son nom est le texte saisi.
export const SYNC_CODE = 98;                           ///< @brief Code d'un recalage vidéo (rejeu) : son texte est le temps de la vidéo.
const TEXT_CODES    = [FREE_CODE, SYNC_CODE];          ///< @brief Évènements dont le texte est saisi dans la liste.
const SYNC_COLOR    = "#B39DDB";                       ///< @brief Couleur des recalages vidéo.

/** @brief Actions proposées à l'ajout, par équipe : le but, puis des évènements libres nommés (actions de jeu). */
const ACTIONS = ["But", "Contre-attaque", "Défense", "Attaque", "Tir"];

/** @brief Types d'évènements proposés dans le filtre d'affichage (ordre d'affichage). */
const EVENT_TYPES = [
    { key: "phases",   label: "Phases de jeu" },
    { key: "goals",    label: "Buts" },
    { key: "stops",    label: "Arrêts de jeu" },
    { key: "free",     label: "Évènements libres" },
    { key: "sync",     label: "Recalages vidéo" },
    { key: "others",   label: "Autres" },
];
const FREE_COLOR    = "#26A69A";                       ///< @brief Couleur des évènements libres sans équipe (turquoise).
const FREE_HOME     = "#F57C00";                       ///< @brief Couleur d'un évènement libre de l'équipe à domicile.
const FREE_AWAY     = "#90A4AE";                       ///< @brief Couleur d'un évènement libre de l'équipe adverse.

/** @brief Libellés courts affichés sur les lignes d'évènements. */
const SHORT_LABELS = {
    1:  "Coup d'envoi",
    2:  "Mi-temps",
    3:  "Reprise",
    4:  "Fin 2e MT",
    12: "Fin du match",
};

// ============================================================================
//  Chrono du match
// ============================================================================

/**
 * @brief État du chrono du match à un instant donné, d'après les évènements de phase de jeu.
 *
 * Temps écoulé depuis le coup d'envoi de la période en cours, sans les arrêts de jeu
 * (entre "Arrêt du jeu" et "Reprise du jeu"). Même calcul que le serveur (matchClock()).
 *
 * @param {Array<{code: number, t: number}>} events Évènements du match, triés par date.
 * @param {number}                           t      Timestamp (ms).
 *
 * @returns {{state: number|string|null, base: number, elapsed: number, stopped: boolean, since: number|null}}
 *          Période en cours (code du coup d'envoi, "Mi-temps", "Pause" ou null), minute de départ,
 *          temps joué dans la période (ms), chrono arrêté et heure de l'arrêt.
 */
export function matchClock(events, t)
{
    let reference = null;
    let base      = 0;
    let state     = null;
    let paused    = 0;
    let stopStart = null;

    for (const event of events)
    {
        if (event.t > t)
            break;

        if (event.code in PERIOD_STARTS)
        {
            reference = event.t;
            base      = PERIOD_STARTS[event.code];
            state     = event.code;
            paused    = 0;
            stopStart = null;
        }
        else if (event.code === STOP_CODE && typeof state === "number" && stopStart == null)
            stopStart = event.t;
        else if (event.code === RESTART_CODE && stopStart != null)
        {
            paused   += event.t - stopStart;
            stopStart = null;
        }
        else if (event.code === 2 || event.code === 6)
        {
            state     = event.code === 2 ? "Mi-temps" : "Pause";
            stopStart = null;
        }
        else if ([4, 8, 9, 10, 12].includes(event.code))
        {
            state     = null;
            stopStart = null;
        }
    }

    const elapsed = typeof state === "number" && reference != null ? (stopStart ?? t) - reference - paused : 0;

    return { state: state, base: base, elapsed: elapsed, stopped: stopStart != null, since: stopStart };
}



/**
 * @brief Minute de jeu à un instant donné, d'après les évènements de phase de jeu.
 *
 * Temps joué depuis le coup d'envoi (0'), depuis la reprise à partir de 45',
 * puis depuis les coups d'envoi des prolongations à partir de 90' et 105',
 * sans les arrêts de jeu (la minute est figée pendant un arrêt).
 * Le temps additionnel s'affiche "45+2'". Entre deux périodes : "Mi-temps" ou "Pause".
 *
 * @param {Array<{code: number, t: number}>} events Évènements du match, triés par date.
 * @param {number}                           t      Timestamp (ms).
 *
 * @returns {string|null} Minute de jeu, null avant le coup d'envoi ou après la fin du match.
 */
export function matchMinute(events, t)
{
    const clock = matchClock(events, t);

    if (typeof clock.state === "string")
        return clock.state;
    if (clock.state == null)
        return null;

    const minute = clock.base + Math.floor(clock.elapsed / 60000);
    const end    = PERIOD_ENDS[clock.state];

    return minute >= end ? `${end}+${minute - end}'` : `${minute}'`;
}

/**
 * @brief Temps de jeu en minutes et secondes à un instant donné : "23:14", "45+2:05" dans le temps additionnel.
 *        Entre deux périodes : "Mi-temps" ou "Pause".
 *
 * @param {Array<{code: number, t: number}>} events Évènements du match, triés par date.
 * @param {number}                           t      Timestamp (ms).
 *
 * @returns {string|null} Temps de jeu, null avant le coup d'envoi ou après la fin du match.
 */
export function matchTime(events, t)
{
    const clock = matchClock(events, t);

    if (typeof clock.state === "string")
        return clock.state;
    if (clock.state == null)
        return null;

    const seconds = Math.max(0, Math.floor(clock.elapsed / 1000));
    const minute  = clock.base + Math.floor(seconds / 60);
    const second  = String(seconds % 60).padStart(2, "0");
    const end     = PERIOD_ENDS[clock.state];

    return minute >= end ? `${end}+${minute - end}:${second}` : `${minute}:${second}`;
}

/** @brief Évènements de fin de période : leur temps affiché est la dernière seconde jouée. */
export const END_CODES = [2, 4, 6, 8, 12];

/**
 * @brief Temps affiché pour un instant : temps de jeu en minutes:secondes ("23:14", "45+2:05", "Mi-temps"),
 *        avant le coup d'envoi le temps qui le sépare ("-5:30"), après la fin du match le temps écoulé depuis
 *        ("Fin +1:20"), et l'heure seulement s'il n'y a pas de coup d'envoi.
 *
 * @param {Array<{code: number, t: number}>} events Évènements du match, triés par date.
 * @param {number}                           t      Timestamp (ms).
 *
 * @returns {string}
 */
export function timeLabel(events, t)
{
    const time = matchTime(events, t);
    if (time)
        return time;

    const kickoff = events.find((e) => e.code === 1);
    if (!kickoff)
        return formatTime(t);
    if (t < kickoff.t)
        return `-${_minutesSeconds(kickoff.t - t)}`;

    const end = [...events].reverse().find((e) => e.code === 12 && e.t <= t);
    return end ? `Fin +${_minutesSeconds(t - end.t)}` : formatTime(t);
}

/**
 * @brief Instant correspondant à un temps saisi (inverse de timeLabel()) : "23:14" (période d'après la minute),
 *        "45+2:05" (temps additionnel de la période qui finit à 45'), "-5:30" (avant le coup d'envoi).
 *        Les arrêts de jeu sont pris en compte.
 *
 * @param {Array<{code: number, t: number}>} events Évènements du match, triés par date.
 * @param {string}                           text   Temps saisi.
 *
 * @returns {number|null} Timestamp (ms), null si la saisie est invalide ou la période absente.
 */
export function parseTimeLabel(events, text)
{
    const match = /^\s*(-)?\s*(\d+)(?:\s*\+\s*(\d+))?\s*[:']\s*(\d{1,2})\s*$/.exec(text || "");
    if (!match || Number(match[4]) > 59)
        return null;

    const [, negative, first, extra, sec] = match;
    const seconds = Number(sec);

    // Avant le coup d'envoi
    if (negative)
    {
        const kickoff = events.find((e) => e.code === 1);
        return kickoff ? kickoff.t - (Number(first) * 60 + seconds) * 1000 : null;
    }

    // Période : celle qui finit à la minute donnée (temps additionnel), sinon celle qui contient la minute
    let code;
    let target;
    if (extra != null)
    {
        code   = Object.keys(PERIOD_ENDS).map(Number).find((c) => PERIOD_ENDS[c] === Number(first));
        target = (Number(first) + Number(extra)) * 60 + seconds;
    }
    else
    {
        code   = Object.keys(PERIOD_STARTS).map(Number).find((c) => Number(first) >= PERIOD_STARTS[c] && Number(first) < PERIOD_ENDS[c]);
        target = Number(first) * 60 + seconds;
    }

    const start = code != null ? events.find((e) => e.code === code) : null;
    if (!start)
        return null;

    // Plus petit instant où le chrono de la période atteint le temps voulu (arrêts de jeu compris)
    const goal = (target - PERIOD_STARTS[code] * 60) * 1000;
    let low  = start.t;
    let high = start.t + 4 * 3600 * 1000;
    while (high - low > 500)
    {
        const middle = (low + high) / 2;
        const clock  = matchClock(events, middle);
        if (clock.state !== code || clock.elapsed >= goal)
            high = middle;
        else
            low = middle;
    }

    return Math.round(high / 1000) * 1000;
}

/** @brief Durée en "m:ss". */
function _minutesSeconds(ms)
{
    const total = Math.floor(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// ============================================================================
//  Évènements du match en cours
// ============================================================================

/**
 * @class MatchEvents
 *
 * @brief Liste des évènements du match en cours, synchronisée avec le serveur.
 */
export class MatchEvents
{
    /**
     * @param          socket    Socket SocketIO de la page (null pour un rejeu, cf. ReplayEvents).
     * @param {TimeNavigator} navigator Fenêtre de temps (pour centrer les courbes sur un évènement).
     * @param {HTMLElement}   sidebar   Colonne des évènements (chrono, boutons d'ajout, champ heure, liste).
     */
    constructor(socket, navigator, sidebar)
    {
        this.socket    = socket;
        this.navigator = navigator;
        this.sidebar   = sidebar;
        this.list      = [];
        this.charts    = [];

        // Colonne fermée : remplacée par un bloc noir de même taille (les courbes ne bougent pas)
        const blank = sidebar.querySelector("[data-side-blank]");
        blank?.addEventListener("click", () =>
        {
            const closed = sidebar.classList.toggle("is-blanked");
            blank.setAttribute("aria-pressed", String(closed));
            blank.textContent = closed ? "‹" : "×";
            blank.title = closed ? "Rouvrir la colonne des évènements" : "Fermer la colonne des évènements";
            blank.setAttribute("aria-label", blank.title);
        });

        // Barre de navigation : temps de jeu au lieu de l'heure
        navigator.timeLabel = (t) => this.timeLabel(t);
        this.domicile  = null;
        this.exterieur = null;

        this.timeInput   = sidebar.querySelector("[data-event-time]");
        this.typesRoot   = sidebar.querySelector("[data-event-types]");
        this.listRoot    = sidebar.querySelector("[data-event-list]");
        this.emptyLabel  = sidebar.querySelector("[data-event-empty]");
        this.timeEdited  = false;
        this.focusFree   = false; ///< @brief Champ du prochain évènement libre reçu à activer (après un ajout).
        this.onEventClick = null; ///< @brief Appelée avec l'identifiant d'un évènement cliqué (rejeu : vidéo).
        this.videoTimeAt  = null; ///< @brief Rejeu : temps de la vidéo ("m:ss") proposé pour un recalage à un instant du match.

        // Annulation (Ctrl+Z) des modifications faites dans la page : ajout, déplacement, renommage, suppression
        this.history    = [];  ///< @brief Opérations inverses, la plus récente en dernier.
        this.undoing    = false;
        this.pendingAdd = [];  ///< @brief Ajouts envoyés, en attente de leur identifiant : { label, readdOf (id remplacé) }.
        this.toast      = document.createElement("div");
        this.toast.className = "undo-toast";
        this.toast.hidden = true;
        this.toast.setAttribute("role", "status");
        document.body.appendChild(this.toast);

        document.addEventListener("keydown", (e) =>
        {
            if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z")
                return ;

            // Dans un champ de saisie, Ctrl+Z annule la frappe (comportement du navigateur)
            const tag = document.activeElement ? document.activeElement.tagName : "";
            if (["INPUT", "TEXTAREA", "SELECT"].includes(tag))
                return ;

            e.preventDefault();
            this.undo();
        });

        // Affichage des évènements sur les courbes (mémorisé dans le navigateur)
        this.visible = true;
        try { this.visible = localStorage.getItem("showMatchEvents") !== "false"; } catch (e) { /* stockage indisponible */ }
        this.hiddenTypes = new Set();
        try { this.hiddenTypes = new Set(JSON.parse(localStorage.getItem("hiddenEventTypes") || "[]")); } catch (e) { /* stockage indisponible */ }
        this.filtersRoot = sidebar.querySelector("[data-event-filters]");

        // Équipes masquées (buts et évènements libres attribués à une équipe)
        this.hiddenTeams = new Set();
        try { this.hiddenTeams = new Set(JSON.parse(localStorage.getItem("hiddenEventTeams") || "[]")); } catch (e) { /* stockage indisponible */ }

        // Évènements masqués un par un (identifiants propres au match en direct ou au rejeu : mémorisés par page)
        this.hiddenKey = `hiddenEvents:${window.location.pathname}`;
        this.hiddenIds = new Set();
        try { this.hiddenIds = new Set(JSON.parse(localStorage.getItem(this.hiddenKey) || "[]")); } catch (e) { /* stockage indisponible */ }
        this.visibilityToggle = sidebar.querySelector("[data-events-visibility]");
        if (this.visibilityToggle)
            this.visibilityToggle.addEventListener("click", () => this.setVisible(!this.visible));
        this._renderVisibility();

        // Chrono du match : minute de jeu et bouton arrêt / reprise du jeu
        this.clockRoot   = sidebar.querySelector("[data-match-clock]");
        this.clockMinute = sidebar.querySelector("[data-clock-minute]");
        this.clockStatus = sidebar.querySelector("[data-clock-status]");
        this.clockToggle = sidebar.querySelector("[data-clock-toggle]");
        this.clockToggle.addEventListener("click", () =>
        {
            const t = this._inputTime() ?? this._now();
            this.add(this.clock(t).stopped ? RESTART_CODE : STOP_CODE, null);
        });

        // Heure de l'évènement : suit l'heure courante tant qu'elle n'est pas modifiée
        this.timeInput.value = formatTime(this._now());
        this.timeInput.addEventListener("input", () => { this.timeEdited = true; });
        setInterval(() =>
        {
            if (!this.timeEdited && document.activeElement !== this.timeInput)
                this.timeInput.value = formatTime(this._now());
            this._renderClock();
        }, 1000);

        if (socket)
        {
            socket.on("getMatchEventsResponse", (data) => this._receive(data));
            socket.on("matchEventsChanged", () => socket.emit("getMatchEvents"));
            socket.on("connect", () => socket.emit("getMatchEvents"));
            socket.emit("getMatchEvents");
        }
    }

    /**
     * @brief Enregistre un graphique à redessiner quand les évènements changent.
     *
     * @param {TimeChart} chart Graphique.
     */
    register(chart)
    {
        this.charts.push(chart);
    }

    /**
     * @brief Style d'affichage d'un évènement sur les graphiques.
     *
     * @param {{code: number, team: number|string|null, name: string}} event Évènement.
     *
     * @returns {{color: string, textColor: string, width: number, dashed: boolean, short: string}} Style.
     */
    style(event)
    {
        if (event.code === SYNC_CODE)
        {
            return {
                color:     SYNC_COLOR,
                textColor: "#1B1615",
                width:     2,
                dashed:    true,
                short:     `Vidéo ${event.name || "?"}`,
            };
        }

        if (event.code === FREE_CODE)
        {
            // Action d'une équipe : couleur de l'équipe et abréviation devant le nom
            const side = this.teamSide(event);
            const team = side ? this[side] : null;
            const name = event.name || "Évènement";
            return {
                color:     side === "domicile" ? FREE_HOME : (side === "exterieur" ? FREE_AWAY : FREE_COLOR),
                textColor: side === "domicile" ? "#FFFFFF" : "#1B1615",
                width:     2,
                dashed:    false,
                plain:     true, // étiquette sans fond sur les courbes
                short:     side ? `${teamAbbreviation(team && team.team)} · ${name}` : name,
            };
        }

        if (event.code === GOAL_CODE)
        {
            const home = this.domicile && event.team === this.domicile.id;
            const team = home ? this.domicile : this.exterieur;

            // Rejeu sans match.json : l'équipe n'est connue que par son nom
            const label = team && team.team ? team.team : (typeof event.team === "string" ? event.team : (home ? "domicile" : "extérieur"));

            return {
                color:     home ? cssVar("--brand-orange") : "#6B665F",
                textColor: home ? "#1B1615" : "#FFFFFF",
                width:     3,
                dashed:    false,
                short:     `But ${label}`,
            };
        }

        if (PHASE_CODES.includes(event.code))
        {
            return {
                color:     cssVar("--graph-zone"),
                textColor: cssVar("--graph-background"),
                width:     2,
                dashed:    true,
                short:     SHORT_LABELS[event.code] || event.name,
            };
        }

        return {
            color:     "#8A847C",
            textColor: "#FFFFFF",
            width:     1.5,
            dashed:    false,
            short:     event.name,
        };
    }

    /**
     * @brief État du chrono du match à un instant donné (cf. matchClock()).
     *
     * @param {number} t Timestamp (ms).
     */
    clock(t)
    {
        return matchClock(this.list, t);
    }

    /**
     * @brief Minute de jeu à un instant donné (cf. matchMinute()).
     *
     * @param {number} t Timestamp (ms).
     */
    matchMinute(t)
    {
        return matchMinute(this.list, t);
    }

    /**
     * @brief Équipe d'un évènement (identifiant, ou nom pour un rejeu sans match.json).
     *
     * @returns {"domicile"|"exterieur"|null}
     */
    teamSide(event)
    {
        if (event.team == null)
            return null;

        for (const side of ["domicile", "exterieur"])
        {
            const team = this[side];
            if (team && (event.team === team.id || event.team === team.team))
                return side;
        }

        return null;
    }

    /**
     * @brief Change l'équipe d'un évènement libre (action du domicile, de l'adversaire, ou aucune).
     *
     * @param {number}             id   Identifiant de l'évènement.
     * @param {number|string|null} team Équipe (identifiant) ou null.
     */
    setTeam(id, team)
    {
        const event = this.list.find((e) => e.id === id);
        if (!event || event.team === team)
            return ;

        this._remember({ type: "team", id: id, team: event.team, label: `équipe de « ${event.name || "évènement"} »` });
        event.team = team;
        this._render();
        this._send("setMatchEventTeam", { id: id, team: team });
    }

    /**
     * @brief Type d'un évènement pour le filtre d'affichage.
     *
     * @returns {string} Clé du type (cf. EVENT_TYPES).
     */
    eventType(event)
    {
        if (event.code === GOAL_CODE)
            return "goals";
        if (event.code === STOP_CODE || event.code === RESTART_CODE)
            return "stops";
        if (event.code === FREE_CODE)
            return "free";
        if (event.code === SYNC_CODE)
            return "sync";
        if (event.code in PERIOD_STARTS || END_CODES.includes(event.code) || PHASE_CODES.includes(event.code))
            return "phases";
        return "others";
    }

    /**
     * @brief L'évènement est-il affiché sur les courbes ? (bouton Masquer et filtre par type)
     */
    isShown(event)
    {
        return this.visible && !this.hiddenTypes.has(this.eventType(event)) && !this.hiddenIds.has(event.id) && !this._teamHidden(event);
    }

    /** @brief L'équipe de l'évènement est-elle masquée par le filtre ? */
    _teamHidden(event)
    {
        const side = event.code === GOAL_CODE || event.code === FREE_CODE ? this.teamSide(event) : null;
        return side != null && this.hiddenTeams.has(side);
    }

    /**
     * @brief Affiche ou masque les évènements d'une équipe sur les courbes.
     *
     * @param {"domicile"|"exterieur"} side  Équipe.
     * @param {boolean}                shown Affichée.
     */
    setTeamShown(side, shown)
    {
        if (shown)
            this.hiddenTeams.delete(side);
        else
            this.hiddenTeams.add(side);
        try { localStorage.setItem("hiddenEventTeams", JSON.stringify([...this.hiddenTeams])); } catch (e) { /* stockage indisponible */ }

        this._render();
    }

    /**
     * @brief Affiche ou masque un évènement sur les courbes.
     *
     * @param {number}  id    Identifiant de l'évènement.
     * @param {boolean} shown Affiché.
     */
    setEventShown(id, shown)
    {
        if (shown)
            this.hiddenIds.delete(id);
        else
            this.hiddenIds.add(id);
        try { localStorage.setItem(this.hiddenKey, JSON.stringify([...this.hiddenIds])); } catch (e) { /* stockage indisponible */ }

        this._render();
    }

    /**
     * @brief Affiche ou masque un type d'évènements sur les courbes.
     *
     * @param {string}  key   Type (cf. EVENT_TYPES).
     * @param {boolean} shown Affiché.
     */
    setTypeShown(key, shown)
    {
        if (shown)
            this.hiddenTypes.delete(key);
        else
            this.hiddenTypes.add(key);
        try { localStorage.setItem("hiddenEventTypes", JSON.stringify([...this.hiddenTypes])); } catch (e) { /* stockage indisponible */ }

        this._render();
    }

    /**
     * @brief Affiche ou masque les évènements sur les courbes.
     *
     * @param {boolean} visible Évènements affichés.
     */
    setVisible(visible)
    {
        this.visible = visible;
        try { localStorage.setItem("showMatchEvents", visible ? "true" : "false"); } catch (e) { /* stockage indisponible */ }
        this._renderVisibility();

        for (const chart of this.charts)
            chart.refresh();
    }

    /**
     * @brief Temps de jeu en minutes et secondes à un instant donné (cf. matchTime()).
     *
     * @param {number} t Timestamp (ms).
     */
    gameTime(t)
    {
        return matchTime(this.list, t);
    }

    /**
     * @brief Temps affiché pour un instant (cf. timeLabel()) : temps de jeu, ou temps avant le coup d'envoi.
     *
     * @param {number} t Timestamp (ms).
     */
    timeLabel(t)
    {
        return timeLabel(this.list, t);
    }

    /**
     * @brief Annule la dernière modification des évènements faite dans la page (Ctrl+Z).
     */
    undo()
    {
        const entry = this.history.pop();
        if (!entry)
            return this._notify("Rien à annuler");

        this.undoing = true;
        try
        {
            if (entry.type === "delete")
                this.remove(entry.id);
            else if (entry.type === "move")
                this.move(entry.id, entry.t);
            else if (entry.type === "team")
                this.setTeam(entry.id, entry.team);
            else if (entry.type === "rename")
            {
                this.rename(entry.id, entry.name);
                this._render();
            }
            else if (entry.type === "add")
            {
                const event = entry.event;
                this.pendingAdd.push({ readdOf: event.id });
                this._send("addMatchEvent", { code: event.code, t: event.t, team: event.team, name: TEXT_CODES.includes(event.code) ? event.name : undefined });
            }
        }
        finally
        {
            this.undoing = false;
        }

        this._notify(`Annulé : ${entry.label}`);
    }

    /**
     * @brief Renomme un évènement libre.
     *
     * @param {number} id   Identifiant de l'évènement.
     * @param {string} name Texte saisi.
     */
    rename(id, name)
    {
        const event = this.list.find((e) => e.id === id);
        if (!event || event.name === name)
            return ;

        this._remember({ type: "rename", id: id, name: event.name, label: `renommage de « ${name || "évènement"} »` });
        event.name = name;
        for (const chart of this.charts)
            chart.refresh();
        this._send("renameMatchEvent", { id: id, name: name });
    }

    /**
     * @brief Demande le nouveau nom d'un évènement libre (double-clic sur sa ligne dans une courbe).
     *
     * @param {number} id Identifiant de l'évènement.
     */
    promptRename(id)
    {
        const event = this.list.find((e) => e.id === id);
        if (!event || !TEXT_CODES.includes(event.code))
            return ;

        const question = event.code === SYNC_CODE ? `Temps de la vidéo à ${this.timeLabel(event.t)} (m:ss ou h:mm:ss) :` : `Nom de l'évènement de ${this.timeLabel(event.t)} :`;
        const name = window.prompt(question, event.name);
        if (name === null)
            return ;

        this.rename(id, name.trim());
        this._render();
    }

    /**
     * @brief Ajoute un évènement libre à un instant donné (double-clic dans une courbe), puis active son nom.
     *
     * @param {number} t Timestamp (ms).
     */
    addFreeAt(t)
    {
        this.focusFree = true;
        this.pendingAdd.push({ label: "ajout d'un évènement libre" });
        this._send("addMatchEvent", { code: FREE_CODE, t: Math.round(t / 1000) * 1000, team: null, name: "" });
    }

    /**
     * @brief Ajoute un évènement à l'heure saisie.
     *
     * @param {number}      code Code de l'évènement.
     * @param {number|null} team   Identifiant de l'équipe (buts, actions).
     * @param {string}      preset Nom d'un évènement libre déjà nommé (action de jeu), optionnel.
     */
    add(code, team, preset)
    {
        const t = this._inputTime();
        if (t == null)
        {
            this.timeInput.setCustomValidity("Heure invalide");
            this.timeInput.reportValidity();
            return ;
        }

        this.timeInput.setCustomValidity("");
        this.focusFree = TEXT_CODES.includes(code) && !preset;

        // Recalage vidéo : temps de la vidéo proposé d'après la synchronisation actuelle
        const name = code === SYNC_CODE ? (this.videoTimeAt ? this.videoTimeAt(t) : "") : (code === FREE_CODE ? (preset || "") : undefined);
        this.pendingAdd.push({ label: "ajout d'un évènement" });
        this._send("addMatchEvent", { code: code, t: t, team: team, name: name });

        // Retour à l'heure courante après l'ajout
        this.timeEdited = false;
        this.timeInput.value = formatTime(this._now());
    }

    /**
     * @brief Déplace un évènement dans le temps.
     *
     * @param {number} id Identifiant de l'évènement.
     * @param {number} t  Nouveau timestamp (ms).
     */
    move(id, t)
    {
        const event = this.list.find((e) => e.id === id);
        if (!event || event.t === t)
            return ;

        this._remember({ type: "move", id: id, t: event.t, label: `déplacement de « ${this.style(event).short} »` });
        event.t = t;
        this.list.sort((a, b) => a.t - b.t);
        this._render();
        this._send("moveMatchEvent", { id: id, t: t });
    }

    /**
     * @brief Supprime un évènement.
     *
     * @param {number} id Identifiant de l'évènement.
     */
    remove(id)
    {
        const event = this.list.find((e) => e.id === id);
        if (event)
            this._remember({ type: "add", event: { ...event }, label: `suppression de « ${this.style(event).short} »` });

        this.list = this.list.filter((e) => e.id !== id);
        this._render();
        this._send("deleteMatchEvent", id);
    }

    // ------------------------------------------------------------------------
    //  Fonctions internes
    // ------------------------------------------------------------------------

    /** @brief Mémorise l'opération inverse d'une modification (sauf pendant une annulation). */
    _remember(entry)
    {
        if (this.undoing)
            return ;

        this.history.push(entry);
        if (this.history.length > 100)
            this.history.shift();
    }

    /** @brief Message bref en bas de l'écran (annulation). */
    _notify(text)
    {
        this.toast.textContent = text;
        this.toast.hidden = false;
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => { this.toast.hidden = true; }, 2500);
    }

    /**
     * @brief Instant présent : l'heure courante (en direct).
     *
     * @returns {number} Timestamp (ms).
     */
    _now()
    {
        return Date.now();
    }

    /**
     * @brief Transmet une modification au serveur (SocketIO).
     *
     * @param {string} action  Nom de l'évènement SocketIO (addMatchEvent, moveMatchEvent, deleteMatchEvent).
     * @param          payload Données de la modification.
     */
    _send(action, payload)
    {
        this.socket.emit(action, payload);
    }

    /**
     * @brief Convertit l'heure saisie (HH:MM:SS, aujourd'hui) en timestamp.
     *
     * @returns {number|null} Timestamp en ms, null si la saisie est invalide.
     */
    _inputTime()
    {
        const parts = this.timeInput.value.split(":").map(Number);
        if (parts.length < 2 || parts.some((p) => Number.isNaN(p)))
            return null;

        const date = new Date();
        date.setHours(parts[0], parts[1], parts[2] || 0, 0);

        // Une heure future est ramenée à la veille (match commencé avant minuit)
        if (date.getTime() > Date.now() + 60 * 1000)
            date.setDate(date.getDate() - 1);

        return date.getTime();
    }

    _receive(data)
    {
        const known = new Set(this.list.map((e) => e.id));

        this.domicile  = data.domicile;
        this.exterieur = data.exterieur;
        this.list      = data.events.sort((a, b) => a.t - b.t);

        // Évènements ajoutés depuis cette page : leur suppression devient annulable ; un évènement recréé par
        // une annulation remplace l'ancien dans l'historique
        if (known.size || this.pendingAdd.length)
        {
            for (const event of this.list.filter((e) => !known.has(e.id)).sort((a, b) => b.id - a.id))
            {
                const pending = this.pendingAdd.shift();
                if (!pending)
                    break;

                if (pending.readdOf != null)
                    this.history.forEach((entry) => { if (entry.id === pending.readdOf) entry.id = event.id; if (entry.event && entry.event.id === pending.readdOf) entry.event.id = event.id; });
                else
                    this._remember({ type: "delete", id: event.id, label: pending.label });
            }
        }

        this._renderTypes();
        this._render();
        this._renderClock();

        // Bornes de la barre de navigation en temps de jeu
        if (this.navigator && this.navigator._updateUi)
            this.navigator._updateUi();
    }

    /**
     * @brief Affiche la minute de jeu (à l'instant présent) et l'état du bouton arrêt / reprise du jeu.
     */
    _renderClock()
    {
        const now     = this._now();
        const clock   = this.clock(now);
        const running = typeof clock.state === "number";

        this.clockMinute.textContent = this.gameTime(now) || "—";
        this.clockRoot.classList.toggle("is-stopped", clock.stopped);

        if (clock.stopped)
        {
            const seconds = Math.max(0, Math.floor((now - clock.since) / 1000));
            this.clockStatus.textContent = `Jeu arrêté depuis ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
        }
        else
            this.clockStatus.textContent = running ? "Chrono en cours" : "";

        // Le bouton agit à l'heure saisie : arrêt si le chrono tourne à cette heure, reprise s'il est arrêté
        const at = this.clock(this._inputTime() ?? now);
        this.clockToggle.textContent = at.stopped ? "Reprise du jeu" : "Arrêt de jeu";
        this.clockToggle.disabled    = typeof at.state !== "number";
    }

    _renderTypes()
    {
        // Buts et actions de jeu : bloc « Actions », un bouton par équipe (cf. plus bas)
        const types = [
            { code: 1,         team: null,                                   label: "Coup d'envoi" },
            { code: 2,         team: null,                                   label: "Mi-temps" },
            { code: 3,         team: null,                                   label: "Reprise" },
            { code: 12,        team: null,                                   label: "Fin du match" },
            { code: STOP_CODE,    team: null,                                label: "Arrêt de jeu" },
            { code: RESTART_CODE, team: null,                                label: "Reprise du jeu" },
            { code: FREE_CODE, team: null,                                   label: "Évènement libre" },
            ...(this.videoTimeAt ? [{ code: SYNC_CODE, team: null, label: "Recalage vidéo" }] : []),
        ];

        this.typesRoot.replaceChildren();
        for (const type of types)
        {
            const style  = this.style({ code: type.code, team: type.team, name: type.label });
            const button = document.createElement("button");
            button.type = "button";
            button.className = "event-type";

            const swatch = document.createElement("span");
            swatch.className = "swatch";
            swatch.style.backgroundColor = style.color;

            const label = document.createElement("span");
            label.textContent = type.label;

            button.append(swatch, label);
            button.addEventListener("click", () => this.add(type.code, type.team));
            this.typesRoot.appendChild(button);
        }

        // Actions de jeu : une ligne par action, un bouton par équipe
        const actions = document.createElement("div");
        actions.className = "event-actions";
        const title = document.createElement("p");
        title.className = "event-actions-title";
        title.textContent = "Actions";
        actions.appendChild(title);

        for (const action of ACTIONS)
        {
            const row = document.createElement("div");
            row.className = "event-action";

            const label = document.createElement("span");
            label.className = "event-action-label";
            label.textContent = action;
            row.appendChild(label);

            for (const side of ["domicile", "exterieur"])
            {
                const team   = this[side];
                const button = document.createElement("button");
                button.type = "button";
                button.className = `event-action-team is-${side}`;
                button.textContent = teamAbbreviation(team && team.team);
                button.title = `${action} : ${team && team.team ? team.team : side}`;
                button.disabled = !team;
                const teamId = team ? (team.id ?? team.team) : null;
                button.addEventListener("click", () => action === "But" ? this.add(GOAL_CODE, teamId) : this.add(FREE_CODE, teamId, action));
                row.appendChild(button);
            }
            actions.appendChild(row);
        }
        this.typesRoot.appendChild(actions);
    }

    /** @brief Pastilles du filtre par type : seulement les types présents dans le match. */
    _renderFilters()
    {
        if (!this.filtersRoot)
            return ;

        const present = new Set(this.list.map((e) => this.eventType(e)));
        this.filtersRoot.replaceChildren();
        for (const type of EVENT_TYPES.filter((t) => present.has(t.key)))
        {
            const count  = this.list.filter((e) => this.eventType(e) === type.key).length;
            const shown  = !this.hiddenTypes.has(type.key);
            const button = document.createElement("button");
            button.type = "button";
            button.className = "event-filter";
            button.setAttribute("aria-pressed", shown ? "true" : "false");
            button.title = shown ? `Masquer les ${type.label.toLowerCase()} sur les courbes` : `Afficher les ${type.label.toLowerCase()} sur les courbes`;
            button.textContent = `${type.label} (${count})`;
            button.addEventListener("click", () => this.setTypeShown(type.key, !shown));
            this.filtersRoot.appendChild(button);
        }

        // Équipes : buts et évènements libres attribués à une équipe
        let teams = 0;
        for (const side of ["domicile", "exterieur"])
        {
            const count = this.list.filter((e) => (e.code === GOAL_CODE || e.code === FREE_CODE) && this.teamSide(e) === side).length;
            if (!count)
                continue;

            teams++;
            const team   = this[side];
            const name   = team && team.team ? team.team : (side === "domicile" ? "Domicile" : "Extérieur");
            const shown  = !this.hiddenTeams.has(side);
            const button = document.createElement("button");
            button.type = "button";
            button.className = `event-filter is-team is-${side}`;
            button.setAttribute("aria-pressed", shown ? "true" : "false");
            button.title = `${shown ? "Masquer" : "Afficher"} les buts et actions de ${name} sur les courbes`;
            button.textContent = `${teamAbbreviation(team && team.team)} (${count})`;
            button.addEventListener("click", () => this.setTeamShown(side, !shown));
            this.filtersRoot.appendChild(button);
        }

        this.filtersRoot.hidden = present.size < 2 && teams === 0;
    }

    /** @brief Libellé du bouton d'affichage des évènements sur les courbes. */
    _renderVisibility()
    {
        if (!this.visibilityToggle)
            return ;

        this.visibilityToggle.textContent = this.visible ? "Masquer" : "Afficher";
        this.visibilityToggle.setAttribute("aria-pressed", this.visible ? "true" : "false");
        this.sidebar.classList.toggle("events-hidden", !this.visible);
    }

    _render()
    {
        // Position de défilement de la page et de la colonne : la reconstruction de la liste raccourcit un instant
        // la page, ce qui ferait remonter l'affichage (filtres, œil, renommage…) ; elle est rétablie à la fin
        const pageY    = window.scrollY;
        const columnY  = this.sidebar.scrollTop;
        const restore  = () =>
        {
            if (window.scrollY !== pageY)
                window.scrollTo(window.scrollX, pageY);
            if (this.sidebar.scrollTop !== columnY)
                this.sidebar.scrollTop = columnY;
        };

        // Saisie en cours (nom d'un évènement libre, temps d'un évènement) : conservée après le rafraîchissement de la liste
        const active  = document.activeElement && document.activeElement.dataset ? document.activeElement : null;
        const editing = active && active.dataset.freeEvent ? { id: Number(active.dataset.freeEvent), value: active.value, start: active.selectionStart } : null;
        const timing  = active && active.dataset.timeEvent ? { id: Number(active.dataset.timeEvent), value: active.value, start: active.selectionStart } : null;

        this.listRoot.replaceChildren();
        this.emptyLabel.classList.toggle("hidden", this.list.length > 0);
        this._renderFilters();

        for (const event of this.list)
        {
            const style = this.style(event);
            const item  = document.createElement("li");
            item.className = "event-item";
            item.classList.toggle("is-filtered", this.hiddenTypes.has(this.eventType(event)) || this.hiddenIds.has(event.id) || this._teamHidden(event));

            // Œil : affichage de cet évènement sur les courbes
            const shown = !this.hiddenIds.has(event.id);
            const eye = document.createElement("button");
            eye.type = "button";
            eye.className = "event-eye";
            eye.setAttribute("aria-pressed", shown ? "true" : "false");
            eye.title = shown ? "Masquer cet évènement sur les courbes" : "Afficher cet évènement sur les courbes";
            eye.setAttribute("aria-label", eye.title);
            eye.innerHTML = shown
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
            eye.addEventListener("click", () => this.setEventShown(event.id, !shown));

            const focus = document.createElement("button");
            focus.type = "button";
            focus.className = "event-focus";
            focus.setAttribute("aria-label", `Centrer les courbes sur ${event.name || "l'évènement"} à ${this.timeLabel(event.t)}`);

            const swatch = document.createElement("span");
            swatch.className = "swatch";
            swatch.style.backgroundColor = style.color;

            // Temps de l'évènement (temps de jeu ; pour une fin de période, la dernière seconde jouée), modifiable :
            // l'évènement est déplacé à l'instant saisi. Un début de période (coup d'envoi, reprise) définit le
            // temps de jeu : le temps saisi le décale d'autant ("0:30" : 30 s plus tard, "-0:10" : 10 s plus tôt)
            const offset  = END_CODES.includes(event.code) ? 1000 : 0;
            const others  = this.list.filter((e) => e.id !== event.id);
            const label   = timeLabel(this.list, event.t - offset);
            const toTime  = (text) =>
            {
                if (!(event.code in PERIOD_STARTS))
                    return parseTimeLabel(others, text);

                const match = /^\s*(-)?\s*(\d+)\s*[:']\s*(\d{1,2})\s*$/.exec(text || "");
                if (!match || Number(match[3]) > 59)
                    return null;
                const seconds = (match[1] ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
                return event.t + (seconds - PERIOD_STARTS[event.code] * 60) * 1000;
            };
            const time   = document.createElement("input");
            time.type = "text";
            time.className = "event-time-input";
            time.value = timing && timing.id === event.id ? timing.value : label;
            time.dataset.timeEvent = event.id;
            time.title = "Temps de jeu (m:ss, 45+2:05, -1:00 avant le coup d'envoi) : modifiez-le pour déplacer l'évènement";
            time.setAttribute("aria-label", `Temps de ${event.name || "l'évènement"}`);
            time.addEventListener("change", () =>
            {
                const t = toTime(time.value);
                time.classList.toggle("is-invalid", t == null);
                if (t != null)
                    this.move(event.id, t + offset);
            });
            time.addEventListener("keydown", (e) => { if (e.key === "Enter") time.blur(); if (e.key === "Escape") { time.value = label; time.blur(); } });

            const name = document.createElement("span");
            name.className = "event-name";
            name.textContent = event.code === GOAL_CODE || SHORT_LABELS[event.code] ? style.short : event.name;
            name.title = event.name;

            focus.addEventListener("click", () => this.navigator.centerOn(event.t));

            // Évènement libre : nom saisi dans la liste (enregistré en quittant le champ ou avec Entrée)
            let input = null;
            if (TEXT_CODES.includes(event.code))
            {
                const sync = event.code === SYNC_CODE;
                focus.classList.add("is-free");

                input = document.createElement("input");
                input.type = "text";
                input.className = "event-name-input";
                input.placeholder = sync ? "Temps de la vidéo (m:ss)" : "Nom de l'évènement";
                if (sync)
                {
                    input.classList.add("is-sync");
                    input.inputMode = "numeric";
                }
                input.maxLength = 200;
                input.value = editing && editing.id === event.id ? editing.value : event.name;
                input.dataset.freeEvent = event.id;
                input.setAttribute("aria-label", `Nom de l'évènement de ${this.timeLabel(event.t)}`);
                input.addEventListener("change", () => this.rename(event.id, input.value.trim()));
                input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
                input.title = sync ? "Recalage vidéo : temps de la vidéo à cet instant du match ; la vidéo est synchronisée à partir de cet évènement" : "Cliquer pour renommer (aussi : double-clic sur la ligne de l'évènement dans une courbe)";
            }
            else
                focus.append(name);

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "event-remove";
            remove.setAttribute("aria-label", `Supprimer ${event.name || "l'évènement"} à ${this.timeLabel(event.t)}`);
            remove.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            remove.addEventListener("click", () => this.remove(event.id));

            // Rejeu : lecture de la vidéo à partir de l'évènement
            let play = null;
            if (this.onEventClick)
            {
                play = document.createElement("button");
                play.type = "button";
                play.className = "event-play";
                play.setAttribute("aria-label", `Voir la vidéo de ${event.name || "l'évènement"} à ${this.timeLabel(event.t)}`);
                play.title = "Voir la vidéo : 10 s avant et 10 s après l'évènement";
                play.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"></path></svg>';
                play.addEventListener("click", () => this.onEventClick(event.id));
            }

            // Pastille et temps, puis nom (bouton qui centre les courbes, ou champ d'un évènement libre)
            if (input)
                focus.replaceChildren();
            // Évènement libre : équipe de l'action (aucune → domicile → adversaire)
            let teamButton = null;
            if (event.code === FREE_CODE || event.code === GOAL_CODE)
            {
                const side = this.teamSide(event);
                const team = side ? this[side] : null;
                teamButton = document.createElement("button");
                teamButton.type = "button";
                teamButton.className = `event-team${side ? ` is-${side}` : ""}`;
                teamButton.textContent = side ? teamAbbreviation(team && team.team) : "—";
                teamButton.title = side ? `Action de ${team && team.team ? team.team : side} : cliquer pour changer d'équipe` : "Action d'une équipe : cliquer pour l'attribuer";
                teamButton.setAttribute("aria-label", teamButton.title);
                teamButton.addEventListener("click", () =>
                {
                    // But : toujours une équipe (domicile ↔ adversaire) ; action : aucune → domicile → adversaire
                    const next = event.code === GOAL_CODE
                        ? (side === "domicile" ? this.exterieur : this.domicile)
                        : (side == null ? this.domicile : (side === "domicile" ? this.exterieur : null));
                    this.setTeam(event.id, next ? (next.id ?? next.team) : null);
                });
            }

            item.append(...[swatch, time, input ? null : focus, input, teamButton, eye, play, remove].filter(Boolean));
            if (timing && timing.id === event.id)
            {
                time.focus();
                time.setSelectionRange(timing.start, timing.start);
            }
            this.listRoot.appendChild(item);

            if (input && editing && editing.id === event.id)
            {
                input.focus();
                input.setSelectionRange(editing.start, editing.start);
            }
        }

        // Évènement libre qui vient d'être ajouté : champ activé pour saisir son nom
        if (this.focusFree)
        {
            const empty = [...this.listRoot.querySelectorAll("[data-free-event]")].filter((input) => !input.value).pop();
            if (empty)
            {
                this.focusFree = false;
                empty.focus();
            }
        }

        for (const chart of this.charts)
            chart.refresh();

        restore();
        requestAnimationFrame(restore);
    }
}

// ============================================================================
//  Évènements d'un match rejoué
// ============================================================================

/**
 * @class ReplayEvents
 *
 * @brief Évènements d'un match rejoué : ajout, déplacement et suppression enregistrés
 *        dans le rejeu sur le serveur (pas dans le match en cours).
 *
 * L'instant présent est la fin de la fenêtre affichée : la minute de jeu du chrono et
 * l'heure proposée pour un nouvel évènement suivent la navigation dans le match.
 */
export class ReplayEvents extends MatchEvents
{
    /**
     * @param {string}        replayId  Identifiant du rejeu.
     * @param {TimeNavigator} navigator Fenêtre de temps du rejeu.
     * @param {HTMLElement}   sidebar   Colonne des évènements.
     * @param {{start: number, domicile: Object|null, exterieur: Object|null, events: Array}} data Données du rejeu.
     */
    constructor(replayId, navigator, sidebar, data)
    {
        super(null, navigator, sidebar);

        this.replayId = replayId;
        this.start    = data.start;

        this._receive(data);
    }

    _now()
    {
        return this.navigator.max();
    }

    /**
     * @brief Enregistre une modification dans le rejeu, puis affiche les évènements renvoyés par le serveur.
     */
    _send(action, payload)
    {
        fetch(`/replay/${this.replayId}/events`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ action: action, payload: payload }),
        })
            .then((response) => response.json())
            .then((data) => this._receive(data))
            .catch((error) => console.error("[Replay] Modification des évènements impossible", error));
    }

    /**
     * @brief Convertit l'heure saisie (HH:MM:SS) en timestamp, le jour du match rejoué.
     *
     * Une heure antérieure de plus de 12 h au début du match est placée le lendemain (match à cheval sur minuit).
     */
    _inputTime()
    {
        const parts = this.timeInput.value.split(":").map(Number);
        if (parts.length < 2 || parts.some((p) => Number.isNaN(p)))
            return null;

        const date = new Date(this.start);
        date.setHours(parts[0], parts[1], parts[2] || 0, 0);

        if (date.getTime() < this.start - 12 * 3600 * 1000)
            date.setDate(date.getDate() + 1);

        return date.getTime();
    }
}
