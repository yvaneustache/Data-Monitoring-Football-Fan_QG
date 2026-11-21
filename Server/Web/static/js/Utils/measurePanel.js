/**
 * @file measurePanel.js
 *
 * @brief Bloc d'une donnée mesurée : indicateurs (actuel, moyenne, minimum, maximum) et graphique temporel.
 */

// ============================================================================
//  Import des bibliothèques
// ============================================================================

import { TimeChart, cssVar } from "./timeChart.js";

// ============================================================================
//  Bloc de donnée
// ============================================================================

/**
 * @class MeasurePanel
 *
 * @brief Relie un bloc HTML (cf. macro measurePanel) à ses données.
 */
export class MeasurePanel
{
    /**
     * @param {string} id      Identifiant du bloc HTML.
     * @param {object} options Options :
     *        - navigator {TimeNavigator} Fenêtre de temps partagée.
     *        - events    {MatchEvents}   Évènements du match.
     *        - label     {string}        Nom de la courbe (infobulle).
     *        - unit      {string}        Unité.
     *        - digits    {number}        Nombre de décimales affichées.
     *        - onReset   {Function}      Appelée au clic sur "Remettre à zéro".
     *        - min, max, suggestedMin, suggestedMax, step : bornes de l'axe vertical.
     */
    constructor(id, options)
    {
        this.root   = document.getElementById(id);
        this.digits = options.digits ?? 1;

        this.chart = new TimeChart(document.getElementById(`chart_${id}`), {
            navigator:    options.navigator,
            events:       options.events,
            unit:         options.unit,
            min:          options.min,
            max:          options.max,
            suggestedMin: options.suggestedMin,
            suggestedMax: options.suggestedMax,
            step:         options.step,
            datasets:     [{ key: "value", label: options.label, color: cssVar("--brand-orange") }],
        });

        this.root.querySelector("[data-reset]").addEventListener("click", () => options.onReset());
    }

    /**
     * @brief Charge l'historique complet et les statistiques.
     *
     * @param {{history: Array<[number, number]>, average: number|null, minimum: number|null, maximum: number|null}} data Données reçues.
     */
    load(data)
    {
        this.chart.setHistory("value", data.history);
        this.setStatistics(data);
    }

    /**
     * @brief Ajoute les points d'un nouvel envoi du capteur et met à jour les statistiques.
     *
     * @param {{points: Array<[number, number]>, average: number|null, minimum: number|null, maximum: number|null}} data Données reçues.
     */
    append(data)
    {
        this.chart.addPoints("value", data.points);
        this.setStatistics(data);
    }

    /**
     * @brief Affiche la valeur actuelle, la moyenne, le minimum et le maximum ("—" si absents, après une remise à zéro).
     *
     * @param {{current: number|null, average: number|null, minimum: number|null, maximum: number|null}} data Statistiques.
     */
    setStatistics(data)
    {
        this.root.querySelector(".current").textContent = this._format(data.current);
        this.root.querySelector(".average").textContent = this._format(data.average);
        this.root.querySelector(".minimum").textContent = this._format(data.minimum);
        this.root.querySelector(".maximum").textContent = this._format(data.maximum);
    }

    // ------------------------------------------------------------------------
    //  Fonctions internes
    // ------------------------------------------------------------------------

    _format(value)
    {
        return value == null ? "—" : Number(value).toFixed(this.digits);
    }
}

// ============================================================================
//  Calibration (curseurs offset et seuil, et cadenas)
// ============================================================================

/**
 * @class CalibrationControl
 *
 * @brief Relie les curseurs de calibration (offset et seuil) et leur cadenas (cf. macro measurePanel, paramètre calibration) au serveur.
 *
 * Pendant le glissement d'un curseur, la valeur est envoyée régulièrement (onChange avec final = false) : les courbes suivent en
 * direct. Au relâchement, elle est envoyée une dernière fois (final = true) et enregistrée par le serveur. Cadenas fermé, les
 * curseurs et les champs sont désactivés, et le serveur refuse tout changement.
 */
export class CalibrationControl
{
    /**
     * @param {HTMLElement} root    Bloc [data-calibration].
     * @param {object}      options Options :
     *        - onChange {Function} Appelée avec (champ "offset" ou "threshold", valeur, final) à chaque réglage.
     *        - onLock   {Function} Appelée avec le nouvel état du verrou au clic sur le cadenas.
     */
    constructor(root, options)
    {
        this.options = options;
        this.digits  = Number(root.dataset.digits ?? 1);    // décimales des réglages (1 pour dB et °C, 2 pour m/s²)
        this.lock    = root.querySelector("[data-offset-lock]");
        this.locked  = this.lock.getAttribute("aria-pressed") === "true";
        this.fields  = {};

        for (const slider of root.querySelectorAll("[data-slider]"))
        {
            const name   = slider.dataset.slider;
            const number = root.querySelector(`[data-number="${name}"]`);
            const field  = { slider: slider, number: number, min: Number(slider.min), max: Number(slider.max), dragging: false, timer: null, pending: null };
            this.fields[name] = field;

            // Glissement : envoi régulier (au plus toutes les 100 ms), puis envoi final au relâchement
            slider.addEventListener("input", () =>
            {
                field.dragging = true;
                number.value = Number(slider.value).toFixed(this.digits);
                this._send(name, Number(slider.value));
            });
            slider.addEventListener("change", () =>
            {
                field.dragging = false;
                this._flush(field);
                options.onChange(name, this._clamp(field, Number(slider.value)), true);
            });

            // Saisie d'une valeur : validée à la sortie du champ ou avec Entrée
            number.addEventListener("change", () =>
            {
                const value = this._clamp(field, Number(number.value));
                slider.value = value;
                number.value = value.toFixed(this.digits);
                this._flush(field);
                options.onChange(name, value, true);
            });
        }

        this.lock.addEventListener("click", () => options.onLock(!this.locked));
    }

    /**
     * @brief Affiche l'état reçu du serveur (offset, seuil et verrou) ; un curseur n'est pas déplacé pendant que l'on le glisse.
     *
     * @param {{offset: number, threshold: number, locked: boolean}} state État.
     */
    set(state)
    {
        for (const [name, field] of Object.entries(this.fields))
        {
            if (state[name] !== undefined && !field.dragging && document.activeElement !== field.number)
            {
                field.slider.value = state[name];
                field.number.value = Number(state[name]).toFixed(this.digits);
            }
        }

        this.locked = Boolean(state.locked);
        for (const field of Object.values(this.fields))
        {
            field.slider.disabled = this.locked;
            field.number.disabled = this.locked;
        }
        this.lock.setAttribute("aria-pressed", this.locked ? "true" : "false");
        const label = this.locked ? "Déverrouiller le réglage" : "Verrouiller le réglage";
        this.lock.title = label;
        this.lock.setAttribute("aria-label", label);
    }

    /** @brief Limite une valeur à l'étendue du curseur, arrondie aux décimales de la mesure. */
    _clamp(field, value)
    {
        const scale = 10 ** this.digits;

        return Number.isFinite(value) ? Math.round(Math.max(field.min, Math.min(field.max, value)) * scale) / scale : field.min;
    }

    /** @brief Envoi non final, au plus toutes les 100 ms (le dernier réglage est toujours envoyé). */
    _send(name, value)
    {
        const field = this.fields[name];
        field.pending = value;
        if (field.timer)
            return ;

        this.options.onChange(name, this._clamp(field, value), false);
        field.pending = null;
        field.timer = setTimeout(() =>
        {
            field.timer = null;
            if (field.pending !== null)
                this._send(name, field.pending);
        }, 100);
    }

    /** @brief Annule l'envoi différé d'un curseur (l'envoi final suit). */
    _flush(field)
    {
        clearTimeout(field.timer);
        field.timer   = null;
        field.pending = null;
    }
}

// ============================================================================
//  Message temporaire
// ============================================================================

/**
 * @brief Affiche un message en bas de l'écran pendant quelques secondes.
 *
 * @param {string} text Message.
 */
export function showToast(text)
{
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.textContent = text;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 5000);

    return ;
}
