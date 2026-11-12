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
const RECENT_SPAN    = 15 * 1000;        ///< @brief Durée du voile gris en fin de courbe (ms) : mesures pas encore reçues (envoi toutes les 15 s).
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
     * @param {{end?: number, liveLabels?: [string, string]}} options
     *        end        : fin des données d'un match rejoué, qui remplace l'heure courante (pas de direct) ;
     *        liveLabels : textes du bouton de retour à la fin (à la fin, ailleurs).
     */
    constructor(defaultSpan = 5 * 60 * 1000, options = {})
    {
        this.fixedEnd   = options.end ?? null;
        this.liveLabels = options.liveLabels || ["En direct", "Revenir au direct"];
        this.span      = defaultSpan;
        this.end       = this._now();
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
        return this.live ? this._now() : this.end;
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
        this.live = end >= this._now();
        this.end  = Math.min(end, this._now());
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
        this.live = end >= this._now();
        this.end  = Math.min(end, this._now());
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
            const end   = this._now();
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

    /**
     * @brief Instant présent : l'heure courante, ou la fin du match rejoué.
     *
     * @returns {number} Timestamp (ms).
     */
    _now()
    {
        return this.fixedEnd ?? Date.now();
    }

    _zoom(factor, anchor)
    {
        const min   = this.min();
        const pivot = min + anchor * this.span;
        const span  = Math.min(MAX_SPAN, Math.max(MIN_SPAN, this.span * factor));
        const end   = pivot + (1 - anchor) * span;

        this.span = span;
        if (!this.live || end < this._now() - 1000)
        {
            this.live = false;
            this.end  = Math.min(end, this._now());
        }
        this._apply();
    }

    _historyStart()
    {
        return this.dataStart == null ? this._now() - this.span : Math.min(this.dataStart, this._now() - this.span);
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

        // Bornes de la fenêtre : temps de jeu (cf. MatchEvents.timeLabel), à défaut l'heure
        const label = this.timeLabel || formatTime;
        this.ui.range.textContent = `${label(min)} – ${label(max)} · ${_formatSpan(this.span)}`;
        this.ui.live.textContent  = this.live ? this.liveLabels[0] : this.liveLabels[1];
        this.ui.live.classList.toggle("is-live", this.live);

        const start = this._historyStart();
        const total = Math.max(0, this._now() - start - this.span);
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
     *        - onRender {Function} Appelée après chaque dessin du graphique, avec la courbe (optionnel).
     *        - playhead {MatchVideo} Curseur vidéo déplaçable : propriété cursor (ms) et seekTo(t) (optionnel, rejeu).
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
                        title: { display: true, text: this.events ? "Heure et temps de jeu (min:s)" : "Heure", color: textColor, font: { family: cssVar("--font-body"), size: 12, weight: "600" } },
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
                            label: (item) => `${item.dataset.label} : ${this.unit.startsWith("Δ") && item.parsed.y > 0 ? "+" : ""}${item.parsed.y} ${this.unit}`,
                        },
                    },
                },
            },
            plugins: [this._recentPlugin(), this._zeroPlugin(), this._eventPlugin(), this._playheadPlugin(), { id: "onRender", afterRender: () => { if (options.onRender) options.onRender(this); } }],
        });

        for (const dataset of options.datasets || [])
            this.addDataset(dataset.key, dataset.label, dataset.color);

        this._bindPointer();
        this.navigator.register(this);
        this.unit     = options.unit;
        this.zeroLine = false;
        this.playhead = options.playhead || null;
        if (this.playhead)
            this.playhead.register(this);

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
     * @brief Fige les bornes actuelles de l'axe vertical : l'échelle ne suit plus les données
     *        (ex : courbes lissées du rejeu, à comparer à l'échelle des mesures brutes).
     */
    lockYAxis()
    {
        // Bornes d'origine (fixes ou automatiques), pour revenir à l'échelle automatique (cf. resetYAxis())
        if (!this.initialY)
            this.initialY = { min: this.chart.options.scales.y.min, max: this.chart.options.scales.y.max };

        const y = this.chart.scales.y;
        this.chart.options.scales.y.min = y.min;
        this.chart.options.scales.y.max = y.max;
        this.chart.update("none");
    }

    /**
     * @brief Change l'unité affichée (titre de l'axe vertical et infobulle).
     *
     * @param {string} unit Unité.
     */
    setUnit(unit)
    {
        this.unit = unit;
        this.chart.options.scales.y.title.text = unit;
        this.chart.update("none");
    }

    /**
     * @brief Couleur des courbes selon la valeur : chaque segment prend la couleur donnée par la fonction
     *        (null pour revenir à la couleur de chaque courbe).
     *
     * @param {Function|null} colorOf Valeur → couleur CSS.
     */
    setValueColor(colorOf)
    {
        for (const dataset of this.datasets.values())
            dataset.segment = colorOf ? { borderColor: (ctx) => colorOf((ctx.p0.parsed.y + ctx.p1.parsed.y) / 2) } : undefined;
        this.chart.update("none");
    }

    /**
     * @brief Affiche ou masque la ligne du zéro (variations).
     *
     * @param {boolean} visible Ligne affichée.
     */
    setZeroLine(visible)
    {
        this.zeroLine = visible;
        this.chart.update("none");
    }

    /**
     * @brief Bornes affichées de l'axe vertical.
     *
     * @returns {{min: number, max: number}}
     */
    getYRange()
    {
        return { min: this.chart.scales.y.min, max: this.chart.scales.y.max };
    }

    /**
     * @brief Fixe les bornes de l'axe vertical (choix de l'utilisateur).
     *
     * @param {number} min Borne basse.
     * @param {number} max Borne haute (supérieure à min).
     */
    setYRange(min, max)
    {
        if (!this.initialY)
            this.initialY = { min: this.chart.options.scales.y.min, max: this.chart.options.scales.y.max };

        this.chart.options.scales.y.min = min;
        this.chart.options.scales.y.max = max;
        this.chart.update("none");
    }

    /**
     * @brief Revient à l'échelle automatique (d'après les données affichées), puis la fige.
     */
    resetYAxis()
    {
        if (this.initialY)
        {
            this.chart.options.scales.y.min = this.initialY.min;
            this.chart.options.scales.y.max = this.initialY.max;
        }
        this.chart.update("none");
        this.lockYAxis();
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
     * @brief Graduation de l'axe horizontal : heure, et temps de jeu en minutes:secondes en dessous ("23:14", "45+2:05").
     */
    _tickLabel(value)
    {
        const time = this.events ? (this.events.gameTime ? this.events.gameTime(value) : this.events.matchMinute(value)) : null;
        return time ? [formatTime(value), time] : formatTime(value);
    }

    /**
     * @brief Temps de jeu (infobulle), à défaut l'heure.
     */
    _timeLabel(value)
    {
        return this.events && this.events.timeLabel ? this.events.timeLabel(value) : formatTime(value);
    }

    _extendNavigator(points)
    {
        if (points && points.length)
            this.navigator.extendData(points[0][0], points[points.length - 1][0]);
    }

    /**
     * @brief Plugin Chart.js dessinant les évènements du match en lignes verticales étiquetées.
     */
    /**
     * @brief Plugin Chart.js : voile gris sur les 15 dernières secondes, en direct seulement (les capteurs envoient
     *        leurs mesures toutes les 15 s : cette période n'est pas encore reçue).
     */
    _recentPlugin()
    {
        return {
            id: "recentVeil",
            beforeDatasetsDraw: (chart) =>
            {
                // Rejeu d'un match : pas de voile
                if (this.navigator.fixedEnd != null)
                    return ;

                const { ctx, chartArea } = chart;
                const scale = chart.scales.x;
                const now   = Date.now();
                const left  = Math.max(chartArea.left, scale.getPixelForValue(now - RECENT_SPAN));
                const right = Math.min(chartArea.right, scale.getPixelForValue(now));
                if (right <= left)
                    return ;

                ctx.save();
                ctx.fillStyle = "rgba(128, 128, 128, 0.18)";
                ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
                ctx.restore();
            },
        };
    }

    /**
     * @brief Plugin Chart.js : curseur vidéo (instant affiché par la vidéo du match), déplaçable à la souris.
     */
    _playheadPlugin()
    {
        return {
            id: "videoPlayhead",
            afterDatasetsDraw: (chart) =>
            {
                const t = this.drag && this.drag.type === "playhead" ? this.drag.t : (this.playhead ? this.playhead.cursor : null);
                const scale = chart.scales.x;
                if (t == null || t < scale.min || t > scale.max)
                    return ;

                const { ctx, chartArea } = chart;
                const x     = scale.getPixelForValue(t);
                const color = "#4FC3F7";

                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth   = 2;
                ctx.beginPath();
                ctx.moveTo(x, chartArea.top);
                ctx.lineTo(x, chartArea.bottom);
                ctx.stroke();

                // Poignée en bas de la courbe : « ▶ Vidéo mm:ss » (temps de jeu du match, à défaut l'heure)
                const time  = this.events && this.events.gameTime ? this.events.gameTime(t) : null;
                const label = `▶ Vidéo ${time || (this.events && this.events.timeLabel ? this.events.timeLabel(t) : formatTime(t))}`;
                ctx.font = `600 12px ${cssVar("--font-body")}`;
                const width = ctx.measureText(label).width + 14;
                const left  = Math.min(chartArea.right - width, Math.max(chartArea.left, x - width / 2));
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.roundRect(left, chartArea.bottom - 24, width, 20, 6);
                ctx.fill();
                ctx.fillStyle    = "#1B1615";
                ctx.textBaseline = "middle";
                ctx.fillText(label, left + 7, chartArea.bottom - 13.5);
                ctx.restore();
            },
        };
    }

    /** @brief Plugin Chart.js : ligne du zéro (mode variations). */
    _zeroPlugin()
    {
        return {
            id: "zeroLine",
            beforeDatasetsDraw: (chart) =>
            {
                const y = chart.scales.y;
                if (!this.zeroLine || y.min > 0 || y.max < 0)
                    return ;

                const { ctx, chartArea } = chart;
                const pixel = y.getPixelForValue(0);
                ctx.save();
                ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
                ctx.lineWidth   = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(chartArea.left, pixel);
                ctx.lineTo(chartArea.right, pixel);
                ctx.stroke();
                ctx.restore();
            },
        };
    }

    /** @brief Le pointeur est-il sur le curseur vidéo ? */
    _playheadAt(x)
    {
        if (!this.playhead || this.playhead.cursor == null)
            return false;

        return Math.abs(this.chart.scales.x.getPixelForValue(this.playhead.cursor) - x) <= MARKER_HIT;
    }

    _eventPlugin()
    {
        return {
            id: "matchEvents",
            afterDatasetsDraw: (chart) =>
            {
                // Évènements masqués (bouton de la colonne des évènements)
                if (!this.events || this.events.visible === false)
                    return ;

                const { ctx, chartArea } = chart;
                const scale = chart.scales.x;

                for (const event of this.events.list.filter((e) => !this.events.isShown || this.events.isShown(e)))
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
                    // Étiquette sur fond coloré, ou texte seul dans la couleur de l'évènement (évènements libres)
                    if (!style.plain)
                    {
                        ctx.fillStyle = style.color;
                        ctx.beginPath();
                        ctx.roundRect(0, 0, width, 20, 6);
                        ctx.fill();
                    }
                    ctx.fillStyle    = style.plain ? style.color : style.textColor;
                    ctx.font         = `${style.plain ? 700 : 600} 12px ${cssVar("--font-body")}`;
                    ctx.textBaseline = "middle";
                    ctx.fillText(style.short, 7, 10.5);

                    ctx.restore();

                    // Heure affichée pendant le déplacement
                    if (this.drag && this.drag.type === "marker" && this.drag.id === event.id)
                    {
                        const label = this.events.timeLabel ? this.events.timeLabel(t) : formatTime(t);
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
        if (!this.events || this.events.visible === false)
            return null;

        if (!this.events)
            return null;

        const scale = this.chart.scales.x;
        let best = null;
        let bestDistance = MARKER_HIT;

        for (const event of this.events.list.filter((e) => !this.events.isShown || this.events.isShown(e)))
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

        // Double-clic : renommage d'un évènement libre, ou ajout d'un évènement libre à l'instant visé
        canvas.addEventListener("dblclick", (e) =>
        {
            const x      = localX(e);
            const area   = this.chart.chartArea;
            const marker = this._markerAt(x);
            if (marker && this.events.promptRename)
                this.events.promptRename(marker.id);
            else if (!marker && this.events && this.events.visible !== false && x >= area.left && x <= area.right)
                this.events.addFreeAt(this.chart.scales.x.getValueForPixel(x));
        });

        canvas.addEventListener("pointerdown", (e) =>
        {
            const x    = localX(e);
            const area = this.chart.chartArea;
            if (x < area.left || x > area.right)
                return ;

            canvas.setPointerCapture(e.pointerId);

            // Curseur vidéo : prioritaire sur les évènements
            if (this._playheadAt(x))
            {
                this.drag = { type: "playhead", t: this.playhead.cursor };
                canvas.style.cursor = "ew-resize";
                return ;
            }

            const marker = this._markerAt(x);
            if (marker)
                this.drag = { type: "marker", id: marker.id, t: marker.t, x0: e.clientX, moved: false };
            else
                this.drag = { type: "pan", x: e.clientX };

            canvas.style.cursor = marker ? "ew-resize" : "grabbing";
        });

        canvas.addEventListener("pointermove", (e) =>
        {
            const scale = this.chart.scales.x;

            if (!this.drag)
            {
                canvas.style.cursor = this._playheadAt(localX(e)) || this._markerAt(localX(e)) ? "ew-resize" : "grab";
                return ;
            }

            // Curseur vidéo : la vidéo suit pendant le glissement
            if (this.drag.type === "playhead")
            {
                const x = Math.min(this.chart.chartArea.right, Math.max(this.chart.chartArea.left, localX(e)));
                this.drag.t = scale.getValueForPixel(x);
                this.playhead.seekTo(this.drag.t);
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
                // Petit mouvement : simple clic (pas de déplacement)
                if (!this.drag.moved && Math.abs(e.clientX - this.drag.x0) < 4)
                    return ;
                this.drag.moved = true;

                const x = Math.min(this.chart.chartArea.right, Math.max(this.chart.chartArea.left, localX(e)));
                this.drag.t = Math.round(scale.getValueForPixel(x) / 1000) * 1000;
                this.chart.update("none");
            }
        });

        const end = () =>
        {
            if (this.drag && this.drag.type === "playhead")
                this.playhead.seekTo(this.drag.t);
            else if (this.drag && this.drag.type === "marker")
            {
                if (this.drag.moved)
                    this.events.move(this.drag.id, this.drag.t);
                else if (this.events.onEventClick)
                    this.events.onEventClick(this.drag.id);
            }

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
