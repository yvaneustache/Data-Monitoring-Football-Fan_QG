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
        this._setCurrent(data.history);
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
        this._setCurrent(data.points);
        this.setStatistics(data);
    }

    /**
     * @brief Affiche la moyenne, le minimum et le maximum ("—" si absents).
     *
     * @param {{average: number|null, minimum: number|null, maximum: number|null}} data Statistiques.
     */
    setStatistics(data)
    {
        this.root.querySelector(".average").textContent = this._format(data.average);
        this.root.querySelector(".minimum").textContent = this._format(data.minimum);
        this.root.querySelector(".maximum").textContent = this._format(data.maximum);
    }

    // ------------------------------------------------------------------------
    //  Fonctions internes
    // ------------------------------------------------------------------------

    _setCurrent(points)
    {
        if (points && points.length)
            this.root.querySelector(".current").textContent = this._format(points[points.length - 1][1]);
    }

    _format(value)
    {
        return value == null ? "—" : Number(value).toFixed(this.digits);
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
