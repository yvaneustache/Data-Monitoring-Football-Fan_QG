/**
 * @file heartRateBoard.js
 *
 * @brief Rythme cardiaque des supporters sur le Dashboard, sous deux formes à comparer :
 *
 * - option A, en direct : une carte par supporter (bpm, cœur battant au rythme mesuré,
 *   zone d'effort, courbe des 5 dernières minutes, jauge) ;
 * - option B, sur les 3 dernières heures (défilement de la droite vers la gauche) : une ligne par supporter,
 *   une case par minute colorée selon la zone d'effort (maximum de la minute), heures et minutes de match en dessous.
 */

// ============================================================================
//  Import des bibliothèques
// ============================================================================

import { matchTime, timeLabel } from "../Utils/matchEvents.js";
import { teamAbbreviation } from "../Utils/teams.js";
import { formatTime, GOAL_CODE } from "../Utils/timeChart.js";

// ============================================================================
//  Constantes
// ============================================================================

/** @brief Zones d'effort : borne haute (bpm, exclue), nom et couleur. */
const ZONES = [
    { max: 100,      name: "Repos",   color: "#5A8F6A" },
    { max: 130,      name: "Modéré",  color: "#C9A227" },
    { max: 160,      name: "Intense", color: "#EA670B" },
    { max: Infinity, name: "Maximal", color: "#D32F2F" },
];

/** @brief Libellés courts des évènements sur la frise (les autres gardent leur nom). */
const EVENT_LABELS = { 1: "Coup d'envoi", 2: "MT", 3: "Reprise", 4: "Fin", 5: "Prol.", 6: "Pause", 7: "Reprise", 8: "Fin", 12: "Fin du match", 34: "Arrêt", 35: "Reprise du jeu" };

const SPARK_SPAN    = 5 * 60 * 1000;  ///< @brief Durée de la courbe des cartes (ms).
const SPARK_RANGE   = [50, 200];      ///< @brief Plage verticale de la courbe et de la jauge (bpm).
const DEFAULT_SPAN  = 3 * 3600 * 1000; ///< @brief Durée de la frise (ms) : fenêtre glissante des 3 dernières heures.
const HISTORY_SPAN  = 4 * 3600 * 1000;///< @brief Historique conservé par supporter (ms).

/**
 * @brief Zone d'effort d'une fréquence cardiaque.
 *
 * @param {number} bpm Fréquence cardiaque.
 *
 * @returns {{max: number, name: string, color: string}} Zone.
 */
export function heartRateZone(bpm)
{
    return ZONES.find((zone) => bpm < zone.max);
}

// ============================================================================
//  Tableau du rythme cardiaque
// ============================================================================

/**
 * @class HeartRateBoard
 *
 * @brief Cartes en direct (option A) et frise du match (option B) du rythme cardiaque des supporters.
 */
export class HeartRateBoard
{
    /**
     * @param {HTMLElement} cardsRoot    Conteneur des cartes (option A).
     * @param {HTMLElement} timelineRoot Conteneur de la frise (option B).
     */
    constructor(cardsRoot, timelineRoot)
    {
        this.cardsRoot    = cardsRoot;
        this.timelineRoot = timelineRoot;
        this.supporters   = new Map(); ///< @brief id → { id, name, color, history, current, card }.
        this.events       = [];
        this.pending      = false;

        // Bulle d'information de la frise, affichée dès le survol d'une case (sans le délai des infobulles du navigateur)
        this.tooltip = document.createElement("div");
        this.tooltip.className = "hr-tooltip";
        this.tooltip.hidden = true;
        document.body.appendChild(this.tooltip);

        timelineRoot.addEventListener("pointermove", (e) =>
        {
            const cell = e.target.closest("[data-tip]");
            if (!cell)
            {
                this.tooltip.hidden = true;
                return ;
            }
            this.tooltip.textContent = cell.dataset.tip;
            this.tooltip.hidden = false;
            const width = this.tooltip.offsetWidth;
            this.tooltip.style.left = `${Math.min(window.innerWidth - width - 8, e.clientX + 12)}px`;
            this.tooltip.style.top  = `${e.clientY - 36}px`;
        });
        timelineRoot.addEventListener("pointerleave", () => { this.tooltip.hidden = true; });

        // Bouton de vue de la frise : compacte (3 h sur la largeur, sans espace) ou détaillée (cases séparées, défilement)
        this.viewToggle = document.querySelector("[data-hr-view]");
        let compact = false;
        try { compact = localStorage.getItem("hrTimelineView") === "compact"; } catch (e) { /* stockage indisponible */ }
        this._setCompact(compact);
        if (this.viewToggle)
            this.viewToggle.addEventListener("click", () => this._setCompact(!timelineRoot.classList.contains("is-compact")));

        // La frise avance avec le temps, même sans nouvelle mesure
        setInterval(() => this._renderTimeline(), 30 * 1000);
    }

    /** @returns {number} Nombre de supporters affichés. */
    get count()
    {
        return this.supporters.size;
    }

    /**
     * @brief Ajoute un supporter s'il n'est pas encore affiché.
     *
     * @param {{id: number, name: string, color: string}} data Supporter.
     */
    addSupporter(data)
    {
        if (this.supporters.has(data.id))
            return ;

        const supporter = { id: data.id, name: data.name, color: data.color, history: [], current: null, card: this._createCard(data) };
        this.supporters.set(data.id, supporter);

        // Cartes triées par identifiant
        const next = [...this.supporters.values()].filter((s) => s.id > data.id).sort((a, b) => a.id - b.id)[0];
        this.cardsRoot.insertBefore(supporter.card.root, next ? next.card.root : null);

        this._schedule();
    }

    /**
     * @brief Retire un supporter (déconnexion).
     *
     * @param {number} id Identifiant du supporter.
     */
    removeSupporter(id)
    {
        const supporter = this.supporters.get(id);
        if (!supporter)
            return ;

        supporter.card.root.remove();
        this.supporters.delete(id);
        this._schedule();
    }

    /**
     * @brief Remplace l'historique d'un supporter.
     *
     * @param {number}                  id      Identifiant du supporter.
     * @param {Array<[number, number]>} history Mesures [timestamp ms, bpm].
     * @param {number|null|undefined}   current Valeur actuelle du serveur (null après une remise à zéro), à défaut la dernière mesure.
     */
    setHistory(id, history, current)
    {
        const supporter = this.supporters.get(id);
        if (!supporter)
            return ;

        supporter.history = (history || []).slice();
        supporter.current = current !== undefined ? current : this._lastValue(supporter.history);
        this._schedule();
    }

    /**
     * @brief Change la valeur actuelle d'un supporter (null après une remise à zéro : « — »), sans toucher à l'historique.
     *
     * @param {number}      id    Identifiant du supporter.
     * @param {number|null} value Valeur actuelle.
     */
    setCurrent(id, value)
    {
        const supporter = this.supporters.get(id);
        if (!supporter)
            return ;

        supporter.current = value;
        this._schedule();
    }

    /**
     * @brief Ajoute de nouvelles mesures à un supporter.
     *
     * @param {number}                  id      Identifiant du supporter.
     * @param {Array<[number, number]>} points  Mesures [timestamp ms, bpm].
     * @param {number|null|undefined}   current Valeur actuelle du serveur, à défaut la dernière mesure.
     */
    addPoints(id, points, current)
    {
        const supporter = this.supporters.get(id);
        if (!supporter)
            return ;

        if (current !== undefined)
            supporter.current = current;
        if (!points || !points.length)
        {
            this._schedule();
            return ;
        }
        if (current === undefined)
            supporter.current = points[points.length - 1][1];

        supporter.history.push(...points);

        const limit = Date.now() - HISTORY_SPAN;
        while (supporter.history.length && supporter.history[0][0] < limit)
            supporter.history.shift();

        this._schedule();
    }

    /**
     * @brief Évènements du match : bornes de la frise (coup d'envoi, fin du match) et minutes de jeu.
     *
     * @param {Array<{code: number, t: number, name: string, team: number|null}>} events Évènements triés par date.
     * @param {{domicile: Object|null, exterieur: Object|null}}                    teams  Équipes du match (buts).
     */
    setEvents(events, teams = {})
    {
        this.events = events || [];
        this.teams  = teams;
        this._schedule();
    }

    /**
     * @brief Libellé court et couleur d'un évènement sur la frise (buts aux couleurs de l'équipe).
     *
     * @returns {{label: string, color: string}}
     */
    _eventStyle(event)
    {
        if (event.code === GOAL_CODE)
        {
            const home = this.teams && this.teams.domicile && event.team === this.teams.domicile.id;
            const team = home ? this.teams.domicile : (this.teams ? this.teams.exterieur : null);
            return { label: `But ${team && team.team ? team.team : (home ? "domicile" : "extérieur")}`, color: home ? "#EA670B" : "#8A847C" };
        }

        // Évènement libre : couleur de l'équipe de l'action (turquoise sans équipe)
        if (event.code === 99)
        {
            const home = this.teams && this.teams.domicile && event.team != null && event.team === this.teams.domicile.id;
            const away = this.teams && this.teams.exterieur && event.team != null && event.team === this.teams.exterieur.id;
            const team = home ? this.teams.domicile : (away ? this.teams.exterieur : null);
            return { label: team ? `${teamAbbreviation(team.team)} · ${event.name || "Évènement"}` : (event.name || "Évènement"), color: home ? "#F57C00" : (away ? "#90A4AE" : "#26A69A") };
        }

        return { label: EVENT_LABELS[event.code] || event.name || "Évènement", color: "#F5F5F5" };
    }

    // ------------------------------------------------------------------------
    //  Fonctions internes
    // ------------------------------------------------------------------------

    /** @returns {number|null} Dernière valeur d'un historique, null s'il est vide. */
    _lastValue(history)
    {
        return history.length ? history[history.length - 1][1] : null;
    }

    /**
     * @brief Change la vue de la frise : compacte (3 h sur la largeur, sans espace) ou détaillée (cases séparées, défilement horizontal).
     *
     * @param {boolean} compact Vue compacte.
     */
    _setCompact(compact)
    {
        this.timelineRoot.classList.toggle("is-compact", compact);
        if (this.viewToggle)
        {
            this.viewToggle.textContent = compact ? "Vue détaillée" : "Vue compacte";
            this.viewToggle.setAttribute("aria-pressed", compact ? "true" : "false");
        }
        try { localStorage.setItem("hrTimelineView", compact ? "compact" : "detailed"); } catch (e) { /* stockage indisponible */ }

        // Vue détaillée : calée sur le présent
        if (!compact)
            this.timelineRoot.scrollLeft = this.timelineRoot.scrollWidth;
    }

    /** @brief Regroupe les mises à jour d'une même image. */
    _schedule()
    {
        if (this.pending)
            return ;

        this.pending = true;
        requestAnimationFrame(() =>
        {
            this.pending = false;
            for (const supporter of this.supporters.values())
                this._renderCard(supporter);
            this._renderTimeline();
        });
    }

    _createCard(data)
    {
        const root = document.createElement("a");
        root.className = "hr-card";
        root.href = `/supporter/${data.id}`;
        root.innerHTML =
            '<div class="hr-card-head">' +
                '<span class="hr-avatar"></span>' +
                '<div class="hr-who"><p class="hr-name"></p><p class="hr-zone"></p></div>' +
            '</div>' +
            '<div class="hr-bpm-row">' +
                '<p class="hr-bpm"><span class="hr-value">—</span><small>bpm</small></p>' +
                '<svg class="hr-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.4 1.1 4.3 2.5.9-1.4 2.2-2.5 4.3-2.5 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"></path></svg>' +
            '</div>' +
            '<svg class="hr-spark" viewBox="0 0 200 50" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke-width="2" vector-effect="non-scaling-stroke"></polyline></svg>' +
            '<div class="hr-gauge"><span></span></div>';

        const avatar = root.querySelector(".hr-avatar");
        avatar.style.backgroundColor = data.color;
        avatar.textContent = (data.name || "?").charAt(0).toUpperCase();
        root.querySelector(".hr-name").textContent = data.name;
        root.querySelector(".hr-spark polyline").setAttribute("stroke", data.color);

        return {
            root:  root,
            zone:  root.querySelector(".hr-zone"),
            heart: root.querySelector(".hr-heart"),
            value: root.querySelector(".hr-value"),
            spark: root.querySelector(".hr-spark polyline"),
            gauge: root.querySelector(".hr-gauge span"),
        };
    }

    /**
     * @brief Option A : valeur actuelle, zone, battement et jauge (« — » après une remise à zéro),
     *        courbe des 5 dernières minutes (historique, conservé par la remise à zéro).
     */
    _renderCard(supporter)
    {
        const card = supporter.card;
        const last = supporter.history[supporter.history.length - 1];
        const bpm  = supporter.current;
        const [low, high] = SPARK_RANGE;

        if (bpm == null)
        {
            card.value.textContent = "—";
            card.zone.textContent  = "En attente";
            card.zone.style.color  = "";
            card.heart.style.animationPlayState = "paused";
            card.gauge.style.width = "0";
        }
        else
        {
            const zone = heartRateZone(bpm);

            card.value.textContent = Math.round(bpm);
            card.zone.textContent  = `● ${zone.name}`;
            card.zone.style.color  = zone.color;

            // Cœur qui bat au rythme mesuré
            card.heart.style.animationDuration  = `${(60 / Math.max(30, bpm)).toFixed(3)}s`;
            card.heart.style.animationPlayState = "running";

            card.gauge.style.width = `${Math.min(100, Math.max(0, ((bpm - low) / (high - low)) * 100))}%`;
            card.gauge.style.backgroundColor = zone.color;
        }

        if (!last)
        {
            card.spark.setAttribute("points", "");
            return ;
        }

        const end    = last[0];
        const points = supporter.history.filter(([t]) => t >= end - SPARK_SPAN);
        card.spark.setAttribute("points", points.map(([t, v]) =>
        {
            const x = 200 - ((end - t) / SPARK_SPAN) * 200;
            const y = 50 - ((Math.min(high, Math.max(low, v)) - low) / (high - low)) * 50;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" "));
    }

    /**
     * @brief Option B : une ligne par supporter, une case par minute (maximum de la minute), sur les 3 dernières heures.
     */
    _renderTimeline()
    {
        // Fenêtre glissante des 3 dernières heures, calée sur les minutes de l'horloge :
        // la frise défile de la droite (maintenant) vers la gauche
        const end     = Math.floor(Date.now() / 60000) * 60000 + 60000;
        const start   = end - DEFAULT_SPAN;
        const minutes = DEFAULT_SPAN / 60000;

        // Défilement horizontal conservé ; calé sur le présent (bord droit) si la frise y était déjà
        const root      = this.timelineRoot;
        const atEnd     = root.scrollLeft + root.clientWidth >= root.scrollWidth - 4;
        const scrollLeft = root.scrollLeft;

        root.replaceChildren();

        const supporters = [...this.supporters.values()].sort((a, b) => a.id - b.id);

        // Évènements du match dans la fenêtre : case de la minute de chaque évènement
        const eventCells = new Map(); ///< @brief index de case → évènements.
        for (const event of this.events)
        {
            const index = Math.floor((event.t - start) / 60000);
            if (index >= 0 && index < minutes)
                eventCells.set(index, [...(eventCells.get(index) || []), event]);
        }

        if (supporters.length)
        {
            const row = document.createElement("div");
            row.className = "hr-events";

            const name = document.createElement("span");
            name.className = "hr-row-name";
            name.textContent = "Évènements";

            const cells = document.createElement("div");
            cells.className = "hr-cells";
            for (let i = 0; i < minutes; i++)
            {
                const cell   = document.createElement("i");
                const events = eventCells.get(i);
                if (events)
                {
                    const style = this._eventStyle(events[events.length - 1]);
                    const flag  = document.createElement("span");
                    flag.textContent = events.map((event) => this._eventStyle(event).label).join(" · ");
                    flag.style.borderColor = style.color;
                    if (i > minutes - 12)
                        flag.classList.add("is-right");
                    cell.appendChild(flag);
                    cell.dataset.tip = events.map((event) => `${this._timeLabel(event.t)} · ${event.code === GOAL_CODE ? this._eventStyle(event).label : event.name}`).join("\n");
                }
                cells.appendChild(cell);
            }

            row.append(name, cells);
            this.timelineRoot.appendChild(row);
        }

        for (const supporter of supporters)
        {
            // Maximum par minute (null : pas de mesure)
            const maxima = new Array(minutes).fill(null);
            for (const [t, v] of supporter.history)
            {
                const index = Math.floor((t - start) / 60000);
                if (index >= 0 && index < minutes && (maxima[index] === null || v > maxima[index]))
                    maxima[index] = v;
            }

            const row = document.createElement("div");
            row.className = "hr-row";

            const name = document.createElement("span");
            name.className = "hr-row-name";
            name.textContent = supporter.name;

            const cells = document.createElement("div");
            cells.className = "hr-cells";
            for (let i = 0; i < minutes; i++)
            {
                const cell = document.createElement("i");
                const t = start + i * 60000;
                const label = this._timeLabel(t);
                if (maxima[i] !== null)
                {
                    const bpm  = maxima[i];
                    const zone = heartRateZone(bpm);
                    cell.style.backgroundColor = zone.color;
                    cell.dataset.tip = `${supporter.name} · ${label} · max ${Math.round(bpm)} bpm (${zone.name.toLowerCase()})`;
                }
                else
                    cell.dataset.tip = `${supporter.name} · ${label} · pas de mesure`;

                // Minute d'un évènement : trait vertical sur la case
                if (eventCells.has(i))
                    cell.classList.add("has-event");
                cells.appendChild(cell);
            }

            row.append(name, cells);
            this.timelineRoot.appendChild(row);
        }

        // Graduation calée sur les cases : heure toutes les 15 minutes de l'horloge, minute de match en dessous
        if (supporters.length)
        {
            const axis = document.createElement("div");
            axis.className = "hr-axis";

            const name = document.createElement("span");
            name.className = "hr-row-name";
            const cells = document.createElement("div");
            cells.className = "hr-cells";

            for (let i = 0; i < minutes; i++)
            {
                const t    = start + i * 60000;
                const cell = document.createElement("i");
                // Pas de repère dans les 3 dernières cases : il dépasserait du bord droit
                if (new Date(t).getMinutes() % 15 === 0 && i < minutes - 3)
                {
                    const tick = document.createElement("span");
                    const hour = document.createElement("b");
                    hour.textContent = formatTime(t).slice(0, 5);
                    tick.appendChild(hour);

                    const minute = matchTime(this.events, t);
                    if (minute)
                    {
                        const game = document.createElement("small");
                        game.textContent = minute === "Mi-temps" ? "MT" : minute;
                        tick.appendChild(game);
                    }
                    cell.appendChild(tick);
                }
                cells.appendChild(cell);
            }

            axis.append(name, cells);
            this.timelineRoot.appendChild(axis);
        }

        root.scrollLeft = atEnd ? root.scrollWidth : scrollLeft;
    }

    /** @brief Repère de temps : temps de jeu en minutes:secondes (avant le coup d'envoi : temps qui l'en sépare). */
    _timeLabel(t)
    {
        return timeLabel(this.events, t);
    }
}
