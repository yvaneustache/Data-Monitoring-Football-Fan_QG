/**
 * @file heartRateBand.js
 *
 * @brief Bande de couleurs de la fréquence cardiaque sous la courbe du rejeu : une ligne par supporter,
 *        une case par minute (ou par période plus longue si la fenêtre est large) colorée selon la zone
 *        d'effort du maximum de la période. Alignée sur la zone de tracé de la courbe et redessinée avec elle
 *        (navigation, zoom, moyenne glissante, seuillage, courbes masquées, évènements).
 */

// ============================================================================
//  Import des bibliothèques
// ============================================================================

import { formatTime } from "./timeChart.js";
import { heartRateZone } from "../Dashboard/heartRateBoard.js";

// ============================================================================
//  Constantes
// ============================================================================

const ROW_HEIGHT = 18;                          ///< @brief Hauteur d'une ligne (px).
const ROW_GAP    = 4;                           ///< @brief Espace entre deux lignes (px).
const MIN_CELL   = 3;                           ///< @brief Largeur minimale d'une case (px).
const BUCKETS    = [1, 2, 5, 10, 15, 30, 60];   ///< @brief Durées possibles d'une case (minutes).
const EMPTY      = "rgba(128, 128, 128, 0.15)"; ///< @brief Couleur d'une case sans mesure.

// ============================================================================
//  Bande de couleurs
// ============================================================================

export class HeartRateBand
{
    /**
     * @param {HTMLCanvasElement} canvas Canevas de la bande.
     * @param {MatchEvents}       events Évènements du match (lignes verticales, minute de jeu).
     */
    constructor(canvas, events)
    {
        this.canvas = canvas;
        this.events = events;
        this.cells  = []; ///< @brief Cases dessinées, pour la bulle d'information.
        this.offsets = {}; ///< @brief Décalage à ajouter par courbe (nom) : référence en mode variations, pour garder les zones en bpm réels.

        this.tooltip = document.createElement("div");
        this.tooltip.className = "hr-tooltip";
        this.tooltip.hidden = true;
        document.body.appendChild(this.tooltip);

        canvas.addEventListener("pointermove", (e) => this._hover(e));
        canvas.addEventListener("pointerleave", () => { this.tooltip.hidden = true; });
    }

    /**
     * @brief Dessine la bande d'après la courbe de fréquence cardiaque (données affichées et fenêtre de temps).
     *
     * @param {TimeChart} timeChart Courbe de la fréquence cardiaque.
     */
    draw(timeChart)
    {
        // Premier dessin pendant la construction de la courbe : rien à aligner encore
        const chart = timeChart.chart;
        if (!chart)
            return ;

        const area     = chart.chartArea;
        const scale    = chart.scales.x;
        const datasets = chart.data.datasets.filter((dataset, index) => chart.isDatasetVisible(index));
        if (!area)
            return ;

        // Taille du canevas : largeur de la courbe, une ligne par supporter affiché
        const width  = chart.width;
        const height = Math.max(1, datasets.length) * (ROW_HEIGHT + ROW_GAP);
        const ratio  = window.devicePixelRatio || 1;
        this.canvas.style.width  = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.canvas.width  = Math.round(width * ratio);
        this.canvas.height = Math.round(height * ratio);

        const ctx = this.canvas.getContext("2d");
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        this.cells = [];

        // Durée d'une case : la plus courte qui garde des cases d'au moins MIN_CELL px
        const span    = scale.max - scale.min;
        const minutes = BUCKETS.find((m) => (area.right - area.left) / (span / (m * 60000)) >= MIN_CELL) || BUCKETS[BUCKETS.length - 1];
        const bucket  = minutes * 60000;
        const first   = Math.floor(scale.min / bucket) * bucket;

        const textColor = getComputedStyle(document.documentElement).getPropertyValue("--text-muted") || "#9E9690";

        datasets.forEach((dataset, row) =>
        {
            const top = row * (ROW_HEIGHT + ROW_GAP);

            // Maximum par case (en bpm réels)
            const offset = this.offsets[dataset.label] || 0;
            const maxima = new Map();
            for (const point of dataset.data)
            {
                if (point.x < first || point.x > scale.max || point.y == null)
                    continue;
                const key = Math.floor(point.x / bucket) * bucket;
                if (!maxima.has(key) || point.y + offset > maxima.get(key))
                    maxima.set(key, point.y + offset);
            }

            for (let t = first; t < scale.max; t += bucket)
            {
                const left  = Math.max(area.left, scale.getPixelForValue(t));
                const right = Math.min(area.right, scale.getPixelForValue(t + bucket));
                if (right <= left)
                    continue;

                const bpm  = maxima.get(t);
                const zone = bpm != null ? heartRateZone(bpm) : null;
                ctx.fillStyle = zone ? zone.color : EMPTY;
                ctx.fillRect(left, top, Math.max(1, right - left - (minutes === 1 && right - left > 4 ? 1 : 0)), ROW_HEIGHT);

                this.cells.push({ left: left, right: right, top: top, name: dataset.label, t: t, bucket: bucket, bpm: bpm, zone: zone });
            }

            // Nom du supporter dans la marge de gauche
            ctx.fillStyle    = dataset.borderColor;
            ctx.font         = "600 12px Barlow, sans-serif";
            ctx.textAlign    = "right";
            ctx.textBaseline = "middle";
            ctx.fillText(dataset.label, area.left - 8, top + ROW_HEIGHT / 2, area.left - 12);
        });

        if (!datasets.length)
        {
            ctx.fillStyle = textColor;
            ctx.font      = "13px Barlow, sans-serif";
            ctx.fillText("Aucune courbe affichée", area.left, ROW_HEIGHT / 2 + 4);
        }

        // Évènements du match : lignes verticales (sauf si masqués)
        if (this.events && this.events.visible !== false)
        {
            for (const event of this.events.list.filter((e) => !this.events.isShown || this.events.isShown(e)))
            {
                if (event.t < scale.min || event.t > scale.max)
                    continue;
                const x = scale.getPixelForValue(event.t);
                ctx.fillStyle = this.events.style(event).color;
                ctx.fillRect(Math.round(x) - 1, 0, 2, height);
            }
        }
    }

    // ------------------------------------------------------------------------
    //  Fonctions internes
    // ------------------------------------------------------------------------

    /** @brief Bulle d'information de la case survolée. */
    _hover(e)
    {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const cell = this.cells.find((c) => x >= c.left && x < c.right && y >= c.top && y < c.top + ROW_HEIGHT);
        if (!cell)
        {
            this.tooltip.hidden = true;
            return ;
        }

        const label  = (t) => this.events ? this.events.timeLabel(t) : formatTime(t);
        const period = cell.bucket > 60000 ? `${label(cell.t)}–${label(cell.t + cell.bucket)}` : label(cell.t);
        const value  = cell.bpm != null ? `max ${Math.round(cell.bpm)} bpm (${cell.zone.name.toLowerCase()})` : "pas de mesure";

        this.tooltip.textContent = `${cell.name} · ${period} · ${value}`;
        this.tooltip.hidden = false;
        this.tooltip.style.left = `${Math.min(window.innerWidth - this.tooltip.offsetWidth - 8, e.clientX + 12)}px`;
        this.tooltip.style.top  = `${e.clientY - 36}px`;
    }
}
