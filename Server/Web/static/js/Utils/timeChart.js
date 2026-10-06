/**
 * @file timeChart.js
 *
 * @brief Graphiques temporels zoomables et navigation dans le temps.
 *
 * Fournit :
 *  - TimeNavigator : fenêtre de temps partagée par plusieurs graphiques (zoom, déplacement, mode direct, curseur d'historique) ;
 *  - TimeChart     : graphique Chart.js à axe horaire, déplaçable à la souris, affichant les évènements du match sous forme de lignes verticales déplaçables.
 */

// ============================================================================
//  Constantes
// ============================================================================

const MIN_SPAN       = 10 * 1000;        ///< @brief Fenêtre minimale affichée (ms).
const MAX_SPAN       = 4 * 3600 * 1000;  ///< @brief Fenêtre maximale affichée (ms).
const MARKER_HIT     = 8;                ///< @brief Distance de saisie d'une ligne d'évènement (px).
const PHASE_CODES    = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; ///< @brief Codes des évènements de phase de jeu.
const GOAL_CODE      = 17;               ///< @brief Code de l'évènement "But".

// ============================================================================
//  Fonctions utilitaires
// ============================================================================

/**
 * @brief Retourne la valeur d'une variable CSS du document.
 *
 * @param {string} name Nom de la variable (ex : "--brand-orange").
 *
 * @returns {string} Valeur de la variable.
 */
export function cssVar(name)
{
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * @brief Formate un timestamp en heure HH:MM:SS.
 *
 * @param {number} ms Timestamp en millisecondes.
 *
 * @returns {string} Heure formatée.
 */
export function formatTime(ms)
{
    return new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * @brief Formate une durée pour l'affichage de la fenêtre de temps.
 *
 * @param {number} ms Durée en millisecondes.
 *
 * @returns {string} Durée formatée (ex : "45 s", "5 min", "1 h 30").
 */
function _formatSpan(ms)
{
    const seconds = Math.round(ms / 1000);
    if (seconds < 60)
        return `${seconds} s`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return seconds % 60 ? `${minutes} min ${String(seconds % 60).padStart(2, "0")}` : `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    const rest  = minutes % 60;
    return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

/**
 * @brief Affiche l'état de connexion au serveur dans la barre de navigation.
 *
 * @param socket Socket SocketIO de la page.
 */
export function bindLiveIndicator(socket)
{
    const live  = document.getElementById("live");
    const label = document.getElementById("live-label");
    if (!live || !label)
        return ;

    live.classList.remove("hidden");

    const update = (connected) =>
    {
        live.classList.toggle("offline", !connected);
        label.textContent = connected ? "En direct" : "Déconnecté";
    };

    socket.on("connect", () => update(true));
    socket.on("disconnect", () => update(false));
    update(socket.connected);

    return ;
}

// ============================================================================
//  Navigation dans le temps
// ============================================================================

/**
 * @class TimeNavigator
 *
 * @brief Fenêtre de temps commune à plusieurs graphiques.
 *
 * En mode direct, la fenêtre suit l'heure courante. Toute action de zoom ou de
 * déplacement vers le passé quitte le mode direct, le bouton "Revenir au
 * direct" le rétablit.
 */
export class TimeNavigator
{
    /**
     * @param {number} defaultSpan Fenêtre affichée au chargement (ms).
     */
    constructor(defaultSpan = 5 * 60 * 1000)
    {
        this.span      = defaultSpan;
        this.end       = Date.now();
        this.live      = true;
        this.dataStart = null;
        this.dataEnd   = null;
        this.charts    = [];
        this.ui        = null;

        // En direct, la fenêtre avance avec l'heure courante
        setInterval(() =>
        {
            if (this.live)
                this._apply();
        }, 1000);
    }

    /**
     * @brief Enregistre un graphique piloté par cette fenêtre de temps.
     *
     * @param {TimeChart} chart Graphique à piloter.
     */
    register(chart)
    {
        this.charts.push(chart);
        chart.setView(this.min(), this.max());
    }

    /**
     * @brief Étend la plage des données connues (bornes du curseur d'historique).
     *
     * @param {number} start Plus ancien timestamp (ms).
     * @param {number} end   Plus récent timestamp (ms).
     */
    extendData(start, end)
    {
        if (start == null || end == null)
            return ;

        this.dataStart = this.dataStart == null ? start : Math.min(this.dataStart, start);
        this.dataEnd   = this.dataEnd == null ? end : Math.max(this.dataEnd, end);
        this._updateUi();
    }

    /** @returns {number} Début de la fenêtre affichée (ms). */
    min()
    {
        return this.max() - this.span;
    }

    /** @returns {number} Fin de la fenêtre affichée (ms). */
    max()
    {
        return this.live ? Date.now() : this.end;
    }

    /** @brief Zoome d'un facteur 2 autour du centre de la fenêtre (de l'instant présent en direct). */
    zoomIn()
    {
        this._zoom(0.5, this.live ? 1 : 0.5);
    }

    /** @brief Dézoome d'un facteur 2 autour du centre de la fenêtre (de l'instant présent en direct). */
    zoomOut()
    {
        this._zoom(2, this.live ? 1 : 0.5);
    }

    /**
     * @brief Zoome autour d'une position relative de la fenêtre.
     *
     * @param {number} factor Facteur appliqué à la largeur de la fenêtre.
     * @param {number} anchor Position du point fixe (0 = début, 1 = fin).
     */
    zoomAt(factor, anchor)
    {
        this._zoom(factor, anchor);
    }

    /** @brief Recule d'une demi-fenêtre. */
    panLeft()
    {
        this.panBy(-this.span / 2);
    }

    /** @brief Avance d'une demi-fenêtre. */
    panRight()
    {
        this.panBy(this.span / 2);
    }

    /**
     * @brief Décale la fenêtre dans le temps.
     *
     * @param {number} deltaMs Décalage en millisecondes (négatif = vers le passé).
     */
    panBy(deltaMs)
    {
        const end = this.max() + deltaMs;
        this.live = end >= Date.now();
        this.end  = Math.min(end, Date.now());
        this._apply();
    }

    /**
     * @brief Centre la fenêtre sur un instant.
     *
     * @param {number} t Timestamp (ms).
     */
    centerOn(t)
    {
        const end = t + this.span / 2;
        this.live = end >= Date.now();
        this.end  = Math.min(end, Date.now());
        this._apply();
    }

    /** @brief Revient au direct. */
    goLive()
    {
        this.live = true;
        this._apply();
    }

    /**
     * @brief Relie la fenêtre de temps aux contrôles d'un bandeau de navigation.
     *
     * Le bandeau contient des boutons [data-nav="left|right|in|out|live"], un
     * élément [data-nav-range] et un curseur input[data-nav-slider].
     *
     * @param {HTMLElement} root Élément contenant les contrôles.
     */
    bindToolbar(root)
    {
        this.ui = {
            range:  root.querySelector("[data-nav-range]"),
            live:   root.querySelector("[data-nav='live']"),
            slider: root.querySelector("[data-nav-slider]"),
        };

        root.querySelector("[data-nav='left']").addEventListener("click", () => this.panLeft());
        root.querySelector("[data-nav='right']").addEventListener("click", () => this.panRight());
        root.querySelector("[data-nav='in']").addEventListener("click", () => this.zoomIn());
        root.querySelector("[data-nav='out']").addEventListener("click", () => this.zoomOut());
        this.ui.live.addEventListener("click", () => this.goLive());

        this.ui.slider.addEventListener("input", () =>
        {
            const start = this._historyStart();
            const end   = Date.now();
            const t     = start + (Number(this.ui.slider.value) / 1000) * Math.max(0, end - start - this.span);
            this.end  = t + this.span;
            this.live = this.end >= end - 1000;
            this._apply();
        });

        this._updateUi();
    }

    // ------------------------------------------------------------------------
    //  Fonctions internes
    // ------------------------------------------------------------------------

    _zoom(factor, anchor)
    {
        const min   = this.min();
        const pivot = min + anchor * this.span;
        const span  = Math.min(MAX_SPAN, Math.max(MIN_SPAN, this.span * factor));
        const end   = pivot + (1 - anchor) * span;

        this.span = span;
        if (!this.live || end < Date.now() - 1000)
        {
            this.live = false;
            this.end  = Math.min(end, Date.now());
        }
        this._apply();
    }

    _historyStart()
    {
        return this.dataStart == null ? Date.now() - this.span : Math.min(this.dataStart, Date.now() - this.span);
    }

    _apply()
    {
        const min = this.min();
        const max = this.max();

        for (const chart of this.charts)
            chart.setView(min, max);

        this._updateUi();
    }

    _updateUi()
    {
        if (!this.ui)
            return ;

        const min = this.min();
        const max = this.max();

        this.ui.range.textContent = `${formatTime(min)} – ${formatTime(max)} · ${_formatSpan(this.span)}`;
        this.ui.live.textContent  = this.live ? "En direct" : "Revenir au direct";
        this.ui.live.classList.toggle("is-live", this.live);

        const start = this._historyStart();
        const total = Math.max(0, Date.now() - start - this.span);
        this.ui.slider.value = total > 0 ? Math.round(((min - start) / total) * 1000) : 1000;
    }
}

// ============================================================================
//  Graphique temporel
// ============================================================================

/**
 * @class TimeChart
 *
 * @brief Graphique Chart.js à axe horaire piloté par un TimeNavigator.
 */
export class TimeChart
{
    /**
     * @param {HTMLCanvasElement} canvas  Canvas du graphique.
     * @param {object}            options Options :
     *        - navigator    {TimeNavigator} Fenêtre de temps partagée.
     *        - events       {MatchEvents}   Évènements du match à afficher (optionnel).
     *        - unit         {string}        Unité de l'axe vertical.
     *        - min, max     {number}        Bornes fixes de l'axe vertical (optionnel).
     *        - suggestedMin, suggestedMax {number} Bornes indicatives, étendues si besoin (optionnel).
     *        - step         {number}        Pas des graduations verticales (optionnel).
     *        - datasets     {Array<{key: string, label: string, color: string}>} Courbes.
     */
    constructor(canvas, options)
    {
        this.canvas    = canvas;
        this.navigator = options.navigator;
        this.events    = options.events || null;
        this.datasets  = new Map();
        this.drag      = null;

        const textColor = cssVar("--graph-text");
        const gridColor = cssVar("--graph-grid");
        const axisColor = cssVar("--graph-axis");

        this.chart = new Chart(canvas.getContext("2d"), {
            type: "line",
            data: { datasets: [] },
            options: {
                responsive:          true,
                maintainAspectRatio: false,
                animation:           false,
                parsing:             false,
                normalized:          true,
                interaction:         { mode: "nearest", axis: "x", intersect: false },
                layout:              { padding: { top: 4, right: 8 } },
                scales: {
                    x: {
                        type:  "linear",
                        title: { display: true, text: this.events ? "Heure et minute de jeu" : "Heure", color: textColor, font: { family: cssVar("--font-body"), size: 12, weight: "600" } },
                        ticks: { color: textColor, maxTicksLimit: 8, maxRotation: 0, callback: (value) => this._tickLabel(value) },
                        grid:  { color: gridColor },
                        border: { color: axisColor },
                    },
                    y: {
                        min:          options.min,
                        max:          options.max,
                        suggestedMin: options.suggestedMin,
                        suggestedMax: options.suggestedMax,
                        title: { display: true, text: options.unit, color: textColor, font: { family: cssVar("--font-body"), size: 12, weight: "600" } },
                        ticks: { color: textColor, stepSize: options.step },
                        grid:  { color: gridColor },
                        border: { color: axisColor },
                    },
                },
                plugins: {
                    legend:  { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => items.length ? this._timeLabel(items[0].parsed.x) : "",
                            label: (item) => `${item.dataset.label} : ${item.parsed.y} ${options.unit}`,
                        },
                    },
                },
            },
            plugins: [this._eventPlugin()],
        });

        for (const dataset of options.datasets || [])
            this.addDataset(dataset.key, dataset.label, dataset.color);

        this._bindPointer();
        this.navigator.register(this);
        if (this.events)
            this.events.register(this);
    }

    /**
     * @brief Ajoute une courbe.
     *
     * @param {string} key   Identifiant de la courbe.
     * @param {string} label Nom affiché dans l'infobulle.
     * @param {string} color Couleur de la courbe.
     */
    addDataset(key, label, color)
    {
        if (this.datasets.has(key))
            return ;

        const dataset = {
            label:           label,
            data:            [],
            borderColor:     color,
            backgroundColor: color + "22",
            borderWidth:     2.5,
            pointRadius:     0,
            pointHitRadius:  6,
            tension:         0.25,
            fill:            this.datasets.size === 0 && !this.multi,
        };

        this.datasets.set(key, dataset);
        this.chart.data.datasets.push(dataset);
        this.chart.update("none");
    }

    /**
     * @brief Passe le graphique en mode multi-courbes (pas de remplissage sous les courbes).
     */
    setMulti()
    {
        this.multi = true;
        for (const dataset of this.datasets.values())
            dataset.fill = false;
    }

    /**
     * @brief Remplace l'historique d'une courbe.
     *
     * @param {string} key    Identifiant de la courbe.
     * @param {Array<[number, number]>} points Points [timestamp ms, valeur].
     */
    setHistory(key, points)
    {
        const dataset = this.datasets.get(key);
        if (!dataset)
            return ;

        dataset.data = (points || []).map(([x, y]) => ({ x, y }));
        this._extendNavigator(points);
        this.chart.update("none");
    }

    /**
     * @brief Ajoute des points à une courbe.
     *
     * @param {string} key    Identifiant de la courbe.
     * @param {Array<[number, number]>} points Points [timestamp ms, valeur].
     */
    addPoints(key, points)
    {
        const dataset = this.datasets.get(key);
        if (!dataset || !points || points.length === 0)
            return ;

        for (const [x, y] of points)
            dataset.data.push({ x, y });

        // Limite mémoire : 4 h d'historique
        const limit = Date.now() - MAX_SPAN;
        while (dataset.data.length && dataset.data[0].x < limit)
            dataset.data.shift();

        this._extendNavigator(points);
        this.chart.update("none");
    }

    /**
     * @brief Affiche ou masque une courbe.
     *
     * @param {string}  key     Identifiant de la courbe.
     * @param {boolean} visible Visibilité.
     */
    setVisible(key, visible)
    {
        const dataset = this.datasets.get(key);
        if (!dataset)
            return ;

        dataset.hidden = !visible;
        this.chart.update("none");
    }

    /**
     * @brief Applique la fenêtre de temps affichée.
     *
     * @param {number} min Début (ms).
     * @param {number} max Fin (ms).
     */
    setView(min, max)
    {
        this.chart.options.scales.x.min = min;
        this.chart.options.scales.x.max = max;
        this.chart.update("none");
    }

    /** @brief Redessine le graphique (évènements modifiés). */
    refresh()
    {
        this.chart.update("none");
    }

    // ------------------------------------------------------------------------
    //  Fonctions internes
    // ------------------------------------------------------------------------

    /**
     * @brief Graduation de l'axe horizontal : heure, et minute de jeu en dessous.
     */
    _tickLabel(value)
    {
        const minute = this.events ? this.events.matchMinute(value) : null;
        return minute ? [formatTime(value), minute] : formatTime(value);
    }

    /**
     * @brief Heure et minute de jeu sur une ligne (infobulle).
     */
    _timeLabel(value)
    {
        const minute = this.events ? this.events.matchMinute(value) : null;
        return minute ? `${formatTime(value)} · ${minute}` : formatTime(value);
    }

    _extendNavigator(points)
    {
        if (points && points.length)
            this.navigator.extendData(points[0][0], points[points.length - 1][0]);
    }

    /**
     * @brief Plugin Chart.js dessinant les évènements du match en lignes verticales étiquetées.
     */
    _eventPlugin()
    {
        return {
            id: "matchEvents",
            afterDatasetsDraw: (chart) =>
            {
                if (!this.events)
                    return ;

                const { ctx, chartArea } = chart;
                const scale = chart.scales.x;

                for (const event of this.events.list)
                {
                    const t = this.drag && this.drag.type === "marker" && this.drag.id === event.id ? this.drag.t : event.t;
                    if (t < scale.min || t > scale.max)
                        continue;

                    const x     = scale.getPixelForValue(t);
                    const style = this.events.style(event);

                    ctx.save();

                    // Ligne verticale
                    ctx.strokeStyle = style.color;
                    ctx.lineWidth   = style.width;
                    ctx.setLineDash(style.dashed ? [6, 4] : []);
                    ctx.beginPath();
                    ctx.moveTo(x, chartArea.top);
                    ctx.lineTo(x, chartArea.bottom);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // Étiquette verticale, lue de bas en haut
                    ctx.font = `600 12px ${cssVar("--font-body")}`;
                    const width = ctx.measureText(style.short).width + 14;
                    ctx.translate(x + 3, chartArea.top + 6 + width);
                    ctx.rotate(-Math.PI / 2);
                    ctx.fillStyle = style.color;
                    ctx.beginPath();
                    ctx.roundRect(0, 0, width, 20, 6);
                    ctx.fill();
                    ctx.fillStyle    = style.textColor;
                    ctx.textBaseline = "middle";
                    ctx.fillText(style.short, 7, 10.5);

                    ctx.restore();

                    // Heure affichée pendant le déplacement
                    if (this.drag && this.drag.type === "marker" && this.drag.id === event.id)
                    {
                        const label = formatTime(t);
                        ctx.save();
                        ctx.font = `600 12px ${cssVar("--font-body")}`;
                        const w = ctx.measureText(label).width + 12;
                        ctx.fillStyle = "#1B1615";
                        ctx.beginPath();
                        ctx.roundRect(x - w / 2, chartArea.bottom - 26, w, 20, 6);
                        ctx.fill();
                        ctx.fillStyle    = "#FFFFFF";
                        ctx.textBaseline = "middle";
                        ctx.fillText(label, x - w / 2 + 6, chartArea.bottom - 15.5);
                        ctx.restore();
                    }
                }
            },
        };
    }

    /**
     * @brief Retourne l'évènement dont la ligne est sous le pointeur.
     */
    _markerAt(x)
    {
        if (!this.events)
            return null;

        const scale = this.chart.scales.x;
        let best = null;
        let bestDistance = MARKER_HIT;

        for (const event of this.events.list)
        {
            if (event.t < scale.min || event.t > scale.max)
                continue;

            const distance = Math.abs(scale.getPixelForValue(event.t) - x);
            if (distance <= bestDistance)
            {
                best = event;
                bestDistance = distance;
            }
        }

        return best;
    }

    /**
     * @brief Gestion de la souris : glisser pour se déplacer dans le temps, glisser une ligne d'évènement pour la déplacer, Ctrl + molette pour zoomer.
     */
    _bindPointer()
    {
        const canvas = this.canvas;
        canvas.style.touchAction = "pan-y";

        const localX = (e) => e.clientX - canvas.getBoundingClientRect().left;

        canvas.addEventListener("pointerdown", (e) =>
        {
            const x    = localX(e);
            const area = this.chart.chartArea;
            if (x < area.left || x > area.right)
                return ;

            canvas.setPointerCapture(e.pointerId);

            const marker = this._markerAt(x);
            if (marker)
                this.drag = { type: "marker", id: marker.id, t: marker.t };
            else
                this.drag = { type: "pan", x: e.clientX };

            canvas.style.cursor = marker ? "ew-resize" : "grabbing";
        });

        canvas.addEventListener("pointermove", (e) =>
        {
            const scale = this.chart.scales.x;

            if (!this.drag)
            {
                canvas.style.cursor = this._markerAt(localX(e)) ? "ew-resize" : "grab";
                return ;
            }

            if (this.drag.type === "pan")
            {
                const width = this.chart.chartArea.right - this.chart.chartArea.left;
                const delta = ((e.clientX - this.drag.x) / width) * (scale.max - scale.min);
                this.drag.x = e.clientX;
                this.navigator.panBy(-delta);
            }
            else
            {
                const x = Math.min(this.chart.chartArea.right, Math.max(this.chart.chartArea.left, localX(e)));
                this.drag.t = Math.round(scale.getValueForPixel(x) / 1000) * 1000;
                this.chart.update("none");
            }
        });

        const end = () =>
        {
            if (this.drag && this.drag.type === "marker")
                this.events.move(this.drag.id, this.drag.t);

            this.drag = null;
            canvas.style.cursor = "grab";
            this.chart.update("none");
        };

        canvas.addEventListener("pointerup", end);
        canvas.addEventListener("pointercancel", end);

        // Ctrl + molette : zoom autour du pointeur
        canvas.addEventListener("wheel", (e) =>
        {
            if (!e.ctrlKey)
                return ;

            e.preventDefault();
            const area   = this.chart.chartArea;
            const anchor = Math.min(1, Math.max(0, (localX(e) - area.left) / (area.right - area.left)));
            this.navigator.zoomAt(e.deltaY < 0 ? 0.8 : 1.25, anchor);
        }, { passive: false });
    }
}

export { PHASE_CODES, GOAL_CODE };
