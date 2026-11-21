/**
 * @file replay.js
 *
 * @brief Logique de la page de rejeu d'un match.
 *
 * Charge tout le match depuis le serveur (mesures et évènements de l'archive ZIP), affiche
 * une courbe par tribune ou par supporter pour chaque type de données, et permet de modifier
 * les évènements du rejeu (ajout, déplacement, suppression) sans toucher au match en cours.
 */

// ============================================================================
//  Import des bibliothèques
// ============================================================================

import { TimeNavigator, TimeChart } from "../Utils/timeChart.js";
import { ReplayEvents } from "../Utils/matchEvents.js";
import { HeartRateBand } from "../Utils/heartRateBand.js";
import { MatchVideo } from "../Utils/matchVideo.js";

// ============================================================================
//  Configuration par type de données
// ============================================================================

const CONFIGURATIONS = {
// Échelle verticale automatique, ajustée aux valeurs affichées (cf. TimeChart.setAutoY())
    accelerometer: { unit: "m/s²",  axis: {} },
    acoustic:      { unit: "dB(A)", axis: {} },
    temperature:   { unit: "°C",    axis: {} },
    heart_rate:    { unit: "bpm",   axis: {} },
};

const MAX_SPAN = 4 * 3600 * 1000; ///< @brief Fenêtre maximale affichée (ms).

/** @brief Largeurs proposées pour la moyenne glissante (s), 0 = courbes brutes. */
const SMOOTHING_WINDOWS = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900];

// ============================================================================
//  Initialisation
// ============================================================================

if (window.DEBUG)
    console.log(`[Replay] Initialisation - Chargement du rejeu id=${window.replayId}`);

fetch(`/replay/${window.replayId}.json`)
    .then((response) => response.json())
    .then((replay) => _init(replay))
    .catch((error) => console.error("[Replay] Chargement du rejeu impossible", error));

// ============================================================================
//  Fonctions internes
// ============================================================================

/**
 * @brief Construit la page du rejeu : fenêtre de temps sur tout le match, évènements et courbes.
 *
 * @param {Object} replay Données du rejeu (cf. Server/Utils/replay.py).
 */
function _init(replay)
{
    // Tout le match est affiché au chargement ; la fin du match remplace l'heure courante
    const span = Math.min(MAX_SPAN, Math.max(60 * 1000, replay.end - replay.start + 60 * 1000));
    const timeNavigator = new TimeNavigator(span, { end: replay.end + 30 * 1000, liveLabels: ["Fin du match", "Aller à la fin"] });
    timeNavigator.bindToolbar(document.getElementById("timebar"));
    timeNavigator.extendData(replay.start, replay.end);

    const events = new ReplayEvents(replay.id, timeNavigator, document.getElementById("events"), replay);

    // Vidéo du match : un clic sur un évènement (courbe ou liste) en joue 20 secondes (10 s avant, 10 s après)
    const video = new MatchVideo(document.querySelector("[data-match-video]"), events, window.videoSettings, `match-video-${replay.id}`);
    events.onEventClick = (id) => video.playEvent(id);
    events.videoTimeAt  = (t) => video.videoTimeAt(t);

    // Boutons ▶ et « Recalage vidéo », la liste étant déjà affichée avant le branchement de la vidéo ;
    // recalage modifié : curseur vidéo recalculé
    events._renderTypes();
    events._render();
    events.register({ refresh: () => video._updateCursor() });
    document.querySelector("[data-video-open]").addEventListener("click", () => video.open());
    const curves     = []; ///< @brief Courbes affichées : { chart, key, dataType, history (brut) }.
    const thresholds = {}; ///< @brief Seuillage par type de données : { min, max } ou absent.
    const slider     = document.querySelector("[data-smoothing]");
    const method     = document.querySelector("[data-smoothing-method]");
    const smoothing  = {}; ///< @brief Lissage par type de données : { method, seconds } (réglage de la courbe).
    let   hrMode     = "values"; ///< @brief Fréquence cardiaque : "values" (bpm) ou "delta" (écart à la référence).
    let   hrBand     = null;

    // Courbes recalculées à partir des mesures brutes : seuillage, puis lissage de la courbe
    const recompute = (dataType) =>
    {
        for (const curve of curves)
        {
            if (dataType && curve.dataType !== dataType)
                continue;

            let history = curve.history;
            const threshold = thresholds[curve.dataType];
            if (threshold)
                history = history.map(([t, v]) => [t, Math.min(threshold.max, Math.max(threshold.min, v))]);
            const setting = smoothing[curve.dataType];
            if (setting && setting.seconds)
                history = _smooth(setting.method, history, setting.seconds * 1000);

            // Variations de fréquence cardiaque : écart à la référence du supporter (médiane de son enregistrement)
            if (curve.dataType === "heart_rate" && hrMode === "delta")
            {
                const reference = curve.reference;
                history = history.map(([t, v]) => [t, Math.round((v - reference) * 10) / 10]);
            }
            if (curve.dataType === "heart_rate" && hrBand)
                hrBand.offsets[curve.name] = hrMode === "delta" ? curve.reference : 0;

            curve.chart.setHistory(curve.key, history);
        }
    };

    // Une courbe par type de données, même sans mesure : les évènements du match y sont affichés
    for (const [dataType, config] of Object.entries(CONFIGURATIONS))
    {
        const canvas = document.querySelector(`[data-chart="${dataType}"]`);
        const legend = document.querySelector(`[data-legend="${dataType}"]`);
        const series = replay.data[dataType] || [];
        if (!canvas)
            continue;

        // Fréquence cardiaque : bande de couleurs redessinée avec la courbe
        const bandCanvas = dataType === "heart_rate" ? document.querySelector("[data-hr-band]") : null;
        const band       = bandCanvas ? new HeartRateBand(bandCanvas, events) : null;
        if (band)
            hrBand = band;

        const chart = new TimeChart(canvas, {
            navigator: timeNavigator,
            events:    events,
            unit:      config.unit,
            datasets:  [],
            onRender:  band ? (timeChart) => band.draw(timeChart) : null,
            playhead:  video,
            ...config.axis,
        });
        chart.setMulti();

        for (const entry of series)
        {
            chart.addDataset(String(entry.id), entry.name, entry.color);
            chart.setHistory(String(entry.id), entry.history);
            legend.appendChild(_legendButton(chart, entry));
            curves.push({ chart: chart, key: String(entry.id), dataType: dataType, history: entry.history, name: entry.name, reference: _median(entry.history.map(([, v]) => v)) });
        }

        // Échelle ajustée aux valeurs de la fenêtre affichée (mesures, lissage, courbes visibles)
        chart.setAutoY();

        const scaleForm = document.querySelector(`[data-scale="${dataType}"]`);
        // Lissage propre à la courbe (méthode et largeur)
        const panelSmoothing = document.querySelector(`[data-panel-smoothing="${dataType}"]`);
        if (panelSmoothing)
        {
            const panelMethod = panelSmoothing.querySelector("[data-panel-method]");
            const panelWidth  = panelSmoothing.querySelector("[data-panel-width]");
            const apply = () =>
            {
                smoothing[dataType] = { method: panelMethod.value, seconds: Number(panelWidth.value) };
                panelSmoothing.classList.toggle("is-active", Number(panelWidth.value) > 0);
                recompute(dataType);
            };
            panelMethod.addEventListener("change", apply);
            panelWidth.addEventListener("change", apply);
        }

        // Fréquence cardiaque : valeurs ou variations (échelle automatique, zéro marqué, références affichées)
        if (dataType === "heart_rate")
        {
            const references = curves.filter((c) => c.dataType === "heart_rate").map((c) => `${c.name} ${Math.round(c.reference)}`).join(" · ");
            const referenceLabel = document.querySelector("[data-hr-reference]");
            for (const button of document.querySelectorAll("[data-hr-mode]"))
            {
                button.addEventListener("click", () =>
                {
                    hrMode = button.dataset.hrMode;
                    for (const other of document.querySelectorAll("[data-hr-mode]"))
                    {
                        other.classList.toggle("is-active", other === button);
                        other.setAttribute("aria-pressed", other === button ? "true" : "false");
                    }
                    referenceLabel.textContent = hrMode === "delta" && references ? `Référence (médiane, bpm) : ${references}` : "";

                    chart.setUnit(hrMode === "delta" ? "Δ bpm" : "bpm");
                    chart.setZeroLine(hrMode === "delta");
                    recompute("heart_rate");
                    scaleForm.querySelector("[data-scale-auto]").click();
                });
            }
        }

        _bindScale(chart, scaleForm, (threshold) =>
        {
            if (threshold)
                thresholds[dataType] = threshold;
            else
                delete thresholds[dataType];
            recompute(dataType);
        });

        // Application du seuillage au match : données du rejeu modifiées sur le serveur (ZIP téléchargé)
        const applyButton = scaleForm.querySelector("[data-scale-apply]");
        const status      = document.querySelector(`[data-scale-status="${dataType}"]`);
        applyButton.addEventListener("click", () =>
        {
            const threshold = thresholds[dataType];
            if (!threshold || !window.confirm(`Modifier les données « ${scaleForm.getAttribute("aria-label").replace("Échelle ", "")} » du match ?\nLes valeurs inférieures à ${threshold.min} ou supérieures à ${threshold.max} sont ramenées à ces bornes.`))
                return ;

            fetch(`/replay/${replay.id}/clip`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ dataType: dataType, min: threshold.min, max: threshold.max }),
            })
                .then((response) => response.json())
                .then((result) =>
                {
                    if (result.error)
                        throw new Error(result.error);

                    // Mesures brutes remplacées par les valeurs seuillées : le seuillage est intégré aux données
                    for (const curve of curves)
                        if (curve.dataType === dataType)
                            curve.history = curve.history.map(([t, v]) => [t, Math.min(threshold.max, Math.max(threshold.min, v))]);

                    status.textContent = `${result.modified} valeur(s) modifiée(s) dans le match. Téléchargez le ZIP pour l'enregistrer.`;
                    status.classList.remove("is-error");
                    document.querySelector("[data-export-zip], .events a[href$='.zip']")?.classList.add("is-highlighted");
                })
                .catch((error) =>
                {
                    status.textContent = `Modification impossible : ${error.message}`;
                    status.classList.add("is-error");
                });
        });
    }

    // Variation de la fréquence cardiaque (bpm/min) : une courbe par supporter, recalculée selon la fenêtre choisie
    const trendCanvas = document.querySelector('[data-chart="hr_trend"]');
    if (trendCanvas)
    {
        const trendChart = new TimeChart(trendCanvas, {
            navigator: timeNavigator,
            events:    events,
            unit:      "bpm/min",
            datasets:  [],
            playhead:  video,
        });
        trendChart.setMulti();
        trendChart.setZeroLine(true);

        const windowSelect = document.querySelector("[data-trend-window]");
        const legend       = document.querySelector('[data-legend="hr_trend"]');
        const series       = replay.data.heart_rate || [];
        // Couleur selon la variation : bleu (ralentit) — gris (stable) — rouge (accélère) ; échelle selon la fenêtre
        const SCALE = { 30: 80, 60: 50, 120: 30, 300: 15 };
        const scaleLabel = document.querySelector("[data-trend-scale]");
        const draw = () =>
        {
            const seconds = Number(windowSelect.value);
            for (const entry of series)
                trendChart.setHistory(String(entry.id), _rateOfChange(entry.history, seconds * 1000));

            const limit = SCALE[seconds] || 50;
            trendChart.setValueColor((v) => _divergingColor(v / limit));
            if (scaleLabel)
                scaleLabel.textContent = `±${limit} bpm/min`;
        };

        for (const entry of series)
        {
            trendChart.addDataset(String(entry.id), entry.name, entry.color);
            legend.appendChild(_legendButton(trendChart, entry));
        }
        draw();
        windowSelect.addEventListener("change", draw);
    }

    // Lissage global : méthode et largeur appliquées à toutes les courbes (réglables ensuite une par une) ;
    // Leq ne s'applique qu'à l'acoustique (moyenne glissante pour les autres courbes)
    const label  = document.querySelector("[data-smoothing-value]");
    const update = () =>
    {
        const seconds = SMOOTHING_WINDOWS[Number(slider.value)];
        label.textContent = seconds ? `${method.value === "envelope" ? "retombée " : ""}${_formatWindow(seconds)}` : "Désactivé";

        for (const root of document.querySelectorAll("[data-panel-smoothing]"))
        {
            const dataType = root.dataset.panelSmoothing;
            const chosen   = method.value === "leq" && dataType !== "acoustic" ? "mean" : method.value;
            root.querySelector("[data-panel-method]").value = chosen;
            root.querySelector("[data-panel-width]").value  = String(seconds);
            root.classList.toggle("is-active", seconds > 0);
            smoothing[dataType] = { method: chosen, seconds: seconds };
        }
        recompute(null);
    };
    slider.addEventListener("input", update);
    method.addEventListener("change", update);
}



/**
 * @brief Champs Min / Max d'une courbe : l'échelle suit les valeurs saisies ; « Auto » revient à l'échelle des données ;
 *        « Seuiller » ramène les valeurs hors de [Min, Max] à ces bornes.
 *
 * @param {TimeChart}   chart       Courbe.
 * @param {HTMLElement} form        Formulaire de l'échelle.
 * @param {Function}    onThreshold Appelée avec { min, max } quand le seuillage change, null s'il est désactivé.
 */
function _bindScale(chart, form, onThreshold)
{
    if (!form)
        return ;

    const minInput = form.querySelector("[data-scale-min]");
    const maxInput = form.querySelector("[data-scale-max]");

    // Champs remplis avec l'échelle affichée
    const fill = () =>
    {
        const range = chart.getYRange();
        minInput.value = Number(range.min.toFixed(2));
        maxInput.value = Number(range.max.toFixed(2));
        minInput.classList.remove("is-invalid");
        maxInput.classList.remove("is-invalid");
    };

    const apply = () =>
    {
        const min = parseFloat(minInput.value);
        const max = parseFloat(maxInput.value);
        const valid = Number.isFinite(min) && Number.isFinite(max) && min < max;

        minInput.classList.toggle("is-invalid", !valid);
        maxInput.classList.toggle("is-invalid", !valid);
        if (valid)
        {
            chart.setYRange(min, max);
            if (clip.getAttribute("aria-pressed") === "true")
                onThreshold({ min: min, max: max });
        }
    };

    // Seuillage aux bornes saisies
    const clip = form.querySelector("[data-scale-clip]");
    clip.disabled = !form.closest(".panel").querySelector("[data-legend]");
    clip.addEventListener("click", () =>
    {
        const enabled = clip.getAttribute("aria-pressed") !== "true";
        const min = parseFloat(minInput.value);
        const max = parseFloat(maxInput.value);
        if (enabled && !(Number.isFinite(min) && Number.isFinite(max) && min < max))
            return ;

        clip.setAttribute("aria-pressed", enabled ? "true" : "false");
        clip.classList.toggle("btn-primary", enabled);
        form.querySelector("[data-scale-apply]").disabled = !enabled;
        onThreshold(enabled ? { min: min, max: max } : null);
    });

    minInput.addEventListener("input", apply);
    maxInput.addEventListener("input", apply);
    form.addEventListener("submit", (event) => event.preventDefault());
    form.querySelector("[data-scale-auto]").addEventListener("click", () =>
    {
        chart.resetYAxis();
        fill();
    });

    // Échelle automatique : champs mis à jour avec les bornes recalculées (sauf pendant la saisie)
    chart.onYRange = () =>
    {
        if (document.activeElement !== minInput && document.activeElement !== maxInput)
            fill();
    };

    fill();
}



/**
 * @brief Moyenne glissante centrée : chaque point devient la moyenne des mesures situées à moins d'une demi-fenêtre de lui.
 *
 * La fenêtre est en temps (et non en nombre de points) : le résultat ne dépend pas de la période des mesures,
 * et un trou dans les données n'est pas comblé par des mesures éloignées.
 *
 * @param {Array<[number, number]>} history Mesures [timestamp ms, valeur], triées par date.
 * @param {number}                  width   Largeur de la fenêtre (ms).
 *
 * @returns {Array<[number, number]>} Courbe lissée, aux mêmes instants que les mesures.
 */
/**
 * @brief Lissage d'une courbe selon la méthode choisie.
 *
 * @param {string}                  method  "mean", "max", "hampel" ou "envelope".
 * @param {Array<[number, number]>} history Mesures [timestamp ms, valeur], triées par date.
 * @param {number}                  width   Largeur de la fenêtre (ms) ; pour l'enveloppe, constante de retombée.
 *
 * @returns {Array<[number, number]>} Courbe lissée, aux mêmes instants que les mesures.
 */
function _smooth(method, history, width)
{
    if (method === "max")
        return _movingMax(history, width);
    if (method === "hampel")
        return _hampel(history, width);
    if (method === "envelope")
        return _envelope(history, width);
    if (method === "leq")
        return _movingLeq(history, width);
    if (method === "p90")
        return _movingPercentile(history, width, 0.9);

    return _movingAverage(history, width);
}



/**
 * @brief Maximum glissant centré : chaque point devient le maximum des mesures à moins d'une demi-fenêtre.
 *        Les pics sont conservés à leur hauteur (et élargis de la fenêtre).
 */
function _movingMax(history, width)
{
    const half   = width / 2;
    const result = [];
    const deque  = []; // indices, valeurs décroissantes
    let end = 0;

    for (const [t] of history)
    {
        while (end < history.length && history[end][0] <= t + half)
        {
            while (deque.length && history[deque[deque.length - 1]][1] <= history[end][1])
                deque.pop();
            deque.push(end++);
        }
        while (history[deque[0]][0] < t - half)
            deque.shift();

        result.push([t, history[deque[0]][1]]);
    }

    return result;
}



/**
 * @brief Filtre de Hampel : une mesure qui s'écarte de la médiane de la fenêtre de plus de 3 écarts robustes
 *        (1,4826 × écart absolu médian) est remplacée par cette médiane ; les autres mesures sont conservées.
 *        Retire les valeurs aberrantes isolées sans aplatir les vrais pics (plus larges que la demi-fenêtre).
 */
function _hampel(history, width)
{
    const half   = width / 2;
    const result = [];
    const sorted = []; // valeurs de la fenêtre, triées
    let start = 0;
    let end   = 0;

    const insert = (v) => { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; } sorted.splice(lo, 0, v); };
    const remove = (v) => { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; } sorted.splice(lo, 1); };
    const median = (values) => { const n = values.length; return n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2; };

    for (const [t, v] of history)
    {
        while (end < history.length && history[end][0] <= t + half)
            insert(history[end++][1]);
        while (history[start][0] < t - half)
            remove(history[start++][1]);

        const m   = median(sorted);
        const mad = median(sorted.map((x) => Math.abs(x - m)).sort((a, b) => a - b));
        result.push([t, Math.abs(v - m) > 3 * 1.4826 * mad && mad > 0 ? m : v]);
    }

    return result;
}



/**
 * @brief Enveloppe « attaque rapide, retombée lente » : la courbe suit immédiatement une hausse, puis redescend
 *        vers le signal avec une constante de temps égale à la largeur choisie. Les pics restent à leur hauteur.
 */
function _envelope(history, width)
{
    const result = [];
    let value = null;
    let last  = null;

    for (const [t, v] of history)
    {
        if (value == null || v >= value)
            value = v;
        else
            value = v + (value - v) * Math.exp(-(t - last) / width);

        last = t;
        result.push([t, value]);
    }

    return result;
}



/**
 * @brief Leq glissant (acoustique) : moyenne énergétique centrée, 10·log10(moyenne de 10^(L/10)).
 *        Mesure de référence en acoustique : les pics pèsent selon leur énergie (bien plus que dans une moyenne).
 */
function _movingLeq(history, width)
{
    const energy = history.map(([t, v]) => [t, Math.pow(10, v / 10)]);

    return _movingAverage(energy, width).map(([t, e]) => [t, 10 * Math.log10(e)]);
}



/**
 * @brief Centile glissant centré (90e centile par défaut) : niveau soutenu de la fenêtre, entre la moyenne et le
 *        maximum ; un pic isolé n'en fait pas monter la valeur, une agitation durable si.
 *
 * @param {number} rank Rang du centile (0,9 pour le 90e centile).
 */
function _movingPercentile(history, width, rank)
{
    const half   = width / 2;
    const result = [];
    const sorted = [];
    let start = 0;
    let end   = 0;

    const position = (v) => { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; } return lo; };

    for (const [t] of history)
    {
        while (end < history.length && history[end][0] <= t + half)
            sorted.splice(position(history[end][1]), 0, history[end++][1]);
        while (history[start][0] < t - half)
            sorted.splice(position(history[start++][1]), 1);

        result.push([t, sorted[Math.floor(rank * (sorted.length - 1))]]);
    }

    return result;
}



/**
 * @brief Vitesse de variation d'une courbe (unités par minute) : moyenne de la demi-fenêtre qui suit chaque instant,
 *        moins celle de la demi-fenêtre qui le précède, divisée par la demi-fenêtre. Lisse le bruit de mesure.
 *
 * @param {Array<[number, number]>} history Mesures [timestamp ms, valeur], triées par date.
 * @param {number}                  width   Largeur de la fenêtre (ms).
 *
 * @returns {Array<[number, number]>} Vitesse de variation (par minute), arrondie au dixième.
 */
function _rateOfChange(history, width)
{
    const half   = width / 2;
    const prefix = [0];
    for (const [, v] of history)
        prefix.push(prefix[prefix.length - 1] + v);

    const result = [];
    let start = 0;
    let end   = 0;
    for (let i = 0; i < history.length; i++)
    {
        const t = history[i][0];
        while (history[start][0] < t - half)
            start++;
        while (end < history.length && history[end][0] <= t + half)
            end++;

        // Demi-fenêtres avant (start..i) et après (i..end-1) l'instant
        const before = (prefix[i + 1] - prefix[start]) / (i + 1 - start);
        const after  = (prefix[end] - prefix[i]) / (end - i);
        const span   = (history[end - 1][0] - history[start][0]) / 2;
        if (span <= 0)
            continue;

        result.push([t, Math.round(((after - before) / (span / 60000)) * 10) / 10]);
    }

    return result;
}



/**
 * @brief Couleur divergente : bleu (−1) — gris (0) — rouge (+1), interpolée et bornée.
 *
 * @param {number} x Valeur normalisée.
 *
 * @returns {string} Couleur CSS.
 */
function _divergingColor(x)
{
    const k     = Math.max(-1, Math.min(1, x));
    const grey  = [158, 150, 144];
    const end   = k >= 0 ? [229, 57, 53] : [66, 165, 245];
    const mix   = Math.abs(k);
    const [r, g, b] = grey.map((c, i) => Math.round(c + (end[i] - c) * mix));

    return `rgb(${r}, ${g}, ${b})`;
}



/** @brief Médiane d'une liste de nombres (0 si vide). */
function _median(values)
{
    const sorted = values.filter((v) => v != null).sort((a, b) => a - b);
    const n = sorted.length;

    return n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : 0;
}



function _movingAverage(history, width)
{
    const half   = width / 2;
    const result = [];
    let start = 0;
    let end   = 0;
    let sum   = 0;

    for (const [t] of history)
    {
        // Ajout des mesures jusqu'à t + demi-fenêtre, retrait de celles avant t - demi-fenêtre
        while (end < history.length && history[end][0] <= t + half)
            sum += history[end++][1];
        while (history[start][0] < t - half)
            sum -= history[start++][1];

        result.push([t, sum / (end - start)]);
    }

    return result;
}



/**
 * @brief Largeur de la fenêtre en texte ("30 s", "2 min").
 */
function _formatWindow(seconds)
{
    return seconds < 60 ? `${seconds} s` : `${seconds / 60} min`;
}



/**
 * @brief Bouton de légende d'une courbe : un clic l'affiche ou la masque.
 */
function _legendButton(chart, entry)
{
    const button = document.createElement("button");
    button.type = "button";
    button.className = "legend-item";
    button.setAttribute("aria-pressed", "true");

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = entry.color;

    const label = document.createElement("span");
    label.className = "legend-name";
    label.textContent = entry.name;

    button.append(swatch, label);
    button.addEventListener("click", () =>
    {
        const visible = button.getAttribute("aria-pressed") !== "true";
        button.setAttribute("aria-pressed", visible ? "true" : "false");
        chart.setVisible(String(entry.id), visible);
    });

    return button;
}
