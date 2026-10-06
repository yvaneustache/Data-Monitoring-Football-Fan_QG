/**
 * @file matchEvents.js
 *
 * @brief Évènements du match affichés sur les graphiques et colonne de saisie.
 *
 * Lit les évènements du match en cours (table "event"), permet d'en ajouter à
 * une heure donnée, de les déplacer et de les supprimer. Les modifications sont
 * partagées en temps réel avec toutes les pages ouvertes.
 */

// ============================================================================
//  Import des bibliothèques
// ============================================================================

import { cssVar, formatTime, PHASE_CODES, GOAL_CODE } from "./timeChart.js";

// ============================================================================
//  Constantes
// ============================================================================

/** @brief Libellés courts affichés sur les lignes d'évènements. */
const SHORT_LABELS = {
    1:  "Coup d'envoi",
    2:  "Mi-temps",
    3:  "Reprise",
    4:  "Fin 2e MT",
    12: "Fin du match",
};

// ============================================================================
//  Évènements du match
// ============================================================================

/**
 * @class MatchEvents
 *
 * @brief Liste des évènements du match, synchronisée avec le serveur.
 */
export class MatchEvents
{
    /**
     * @param          socket    Socket SocketIO de la page.
     * @param {TimeNavigator} navigator Fenêtre de temps (pour centrer les courbes sur un évènement).
     * @param {HTMLElement}   sidebar   Colonne des évènements (boutons d'ajout, champ heure, liste).
     */
    constructor(socket, navigator, sidebar)
    {
        this.socket    = socket;
        this.navigator = navigator;
        this.sidebar   = sidebar;
        this.list      = [];
        this.charts    = [];
        this.domicile  = null;
        this.exterieur = null;

        this.timeInput   = sidebar.querySelector("[data-event-time]");
        this.typesRoot   = sidebar.querySelector("[data-event-types]");
        this.listRoot    = sidebar.querySelector("[data-event-list]");
        this.emptyLabel  = sidebar.querySelector("[data-event-empty]");
        this.timeEdited  = false;

        // Heure de l'évènement : suit l'heure courante tant qu'elle n'est pas modifiée
        this.timeInput.value = formatTime(Date.now());
        this.timeInput.addEventListener("input", () => { this.timeEdited = true; });
        setInterval(() =>
        {
            if (!this.timeEdited && document.activeElement !== this.timeInput)
                this.timeInput.value = formatTime(Date.now());
        }, 1000);

        socket.on("getMatchEventsResponse", (data) => this._receive(data));
        socket.on("matchEventsChanged", () => socket.emit("getMatchEvents"));
        socket.on("connect", () => socket.emit("getMatchEvents"));
        socket.emit("getMatchEvents");
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
     * @param {{code: number, team: number|null, name: string}} event Évènement.
     *
     * @returns {{color: string, textColor: string, width: number, dashed: boolean, short: string}} Style.
     */
    style(event)
    {
        if (event.code === GOAL_CODE)
        {
            const home = this.domicile && event.team === this.domicile.id;
            const team = home ? this.domicile : this.exterieur;
            return {
                color:     home ? cssVar("--brand-orange") : "#6B665F",
                textColor: home ? "#1B1615" : "#FFFFFF",
                width:     3,
                dashed:    false,
                short:     `But ${team && team.team ? team.team : (home ? "domicile" : "extérieur")}`,
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
     * @brief Minute de jeu à un instant donné, d'après les évènements de phase de jeu.
     *
     * Temps écoulé depuis le coup d'envoi (0'), depuis la reprise à partir de 45',
     * puis depuis les coups d'envoi des prolongations à partir de 90' et 105'.
     * Le temps additionnel s'affiche "45+2'". Entre deux périodes : "Mi-temps" ou "Pause".
     *
     * @param {number} t Timestamp (ms).
     *
     * @returns {string|null} Minute de jeu, null avant le coup d'envoi ou après la fin du match.
     */
    matchMinute(t)
    {
        const starts = { 1: 0, 3: 45, 5: 90, 7: 105 };
        const ends   = { 1: 45, 3: 90, 5: 105, 7: 120 };
        let reference = null;
        let base      = 0;
        let state     = null;

        for (const event of this.list)
        {
            if (event.t > t)
                break;

            if (event.code in starts)
            {
                reference = event.t;
                base      = starts[event.code];
                state     = event.code;
            }
            else if (event.code === 2 || event.code === 6)
                state = event.code === 2 ? "Mi-temps" : "Pause";
            else if ([4, 8, 9, 10, 12].includes(event.code))
                state = null;
        }

        if (typeof state === "string")
            return state;
        if (state == null || reference == null)
            return null;

        const minute = base + Math.floor((t - reference) / 60000);
        const end    = ends[state];

        return minute >= end ? `${end}+${minute - end}'` : `${minute}'`;
    }

    /**
     * @brief Ajoute un évènement à l'heure saisie.
     *
     * @param {number}      code Code de l'évènement.
     * @param {number|null} team Identifiant de l'équipe (buts).
     */
    add(code, team)
    {
        const t = this._inputTime();
        if (t == null)
        {
            this.timeInput.setCustomValidity("Heure invalide");
            this.timeInput.reportValidity();
            return ;
        }

        this.timeInput.setCustomValidity("");
        this.socket.emit("addMatchEvent", { code: code, t: t, team: team });

        // Retour à l'heure courante après l'ajout
        this.timeEdited = false;
        this.timeInput.value = formatTime(Date.now());
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

        event.t = t;
        this.list.sort((a, b) => a.t - b.t);
        this._render();
        this.socket.emit("moveMatchEvent", { id: id, t: t });
    }

    /**
     * @brief Supprime un évènement.
     *
     * @param {number} id Identifiant de l'évènement.
     */
    remove(id)
    {
        this.list = this.list.filter((e) => e.id !== id);
        this._render();
        this.socket.emit("deleteMatchEvent", id);
    }

    // ------------------------------------------------------------------------
    //  Fonctions internes
    // ------------------------------------------------------------------------

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
        this.domicile  = data.domicile;
        this.exterieur = data.exterieur;
        this.list      = data.events.sort((a, b) => a.t - b.t);

        this._renderTypes();
        this._render();
    }

    _renderTypes()
    {
        const home = this.domicile && this.domicile.team ? this.domicile.team : "domicile";
        const away = this.exterieur && this.exterieur.team ? this.exterieur.team : "extérieur";

        const types = [
            { code: 1,         team: null,                                   label: "Coup d'envoi" },
            { code: GOAL_CODE, team: this.domicile ? this.domicile.id : null,  label: `But ${home}` },
            { code: GOAL_CODE, team: this.exterieur ? this.exterieur.id : null, label: `But ${away}` },
            { code: 2,         team: null,                                   label: "Mi-temps" },
            { code: 3,         team: null,                                   label: "Reprise" },
            { code: 12,        team: null,                                   label: "Fin du match" },
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
    }

    _render()
    {
        this.listRoot.replaceChildren();
        this.emptyLabel.classList.toggle("hidden", this.list.length > 0);

        for (const event of this.list)
        {
            const style = this.style(event);
            const item  = document.createElement("li");
            item.className = "event-item";

            const focus = document.createElement("button");
            focus.type = "button";
            focus.className = "event-focus";
            focus.setAttribute("aria-label", `Centrer les courbes sur ${event.name} à ${formatTime(event.t)}`);

            const swatch = document.createElement("span");
            swatch.className = "swatch";
            swatch.style.backgroundColor = style.color;

            const time = document.createElement("span");
            time.className = "event-time";
            time.textContent = formatTime(event.t);

            // Minute de jeu ; pour une fin de période, la dernière minute jouée
            const minute = document.createElement("span");
            minute.className = "event-minute";
            minute.textContent = this.matchMinute([2, 4, 6, 8, 12].includes(event.code) ? event.t - 1 : event.t) || "";

            const name = document.createElement("span");
            name.className = "event-name";
            name.textContent = event.code === GOAL_CODE || SHORT_LABELS[event.code] ? style.short : event.name;
            name.title = event.name;

            focus.append(swatch, time, minute, name);
            focus.addEventListener("click", () => this.navigator.centerOn(event.t));

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "event-remove";
            remove.setAttribute("aria-label", `Supprimer ${event.name} à ${formatTime(event.t)}`);
            remove.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            remove.addEventListener("click", () => this.remove(event.id));

            item.append(focus, remove);
            this.listRoot.appendChild(item);
        }

        for (const chart of this.charts)
            chart.refresh();
    }
}
