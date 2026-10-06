/**
 * @file comparison.js
 *
 * @brief Logique de la page de comparaison.
 *
 * Superpose sur un même graphique les courbes de tous les supporters (fréquence cardiaque) ou de toutes les tribunes (vibration ou acoustique). Chaque courbe peut être masquée ou réaffichée en cliquant sur son nom dans la légende.
 */

// ============================================================================
//  Import des bibliothèques
// ============================================================================

import { TimeNavigator, TimeChart, bindLiveIndicator } from "../Utils/timeChart.js";
import { MatchEvents } from "../Utils/matchEvents.js";

// ============================================================================
//  Configuration selon le type de comparaison
// ============================================================================

const CONFIGURATIONS = {
    heart_rate: {
        request:    "getSupporterHeartRateAll",
        response:   "getSupporterHeartRateAllResponse",
        live:       "newSupporterHeartRate",
        connection: "supporterConnection",
        field:      "heartRate",
        unit:       "bpm",
        digits:     0,
        axis:       { min: 40, max: 200, step: 20 },
    },
    accelerometer: {
        request:    "getStadiumBleacherAccelerometerAll",
        response:   "getStadiumBleacherAccelerometerAllResponse",
        live:       "newStadiumBleacherAccelerometer",
        connection: "stadiumBleacherConnection",
        field:      "accelerometer",
        unit:       "m/s²",
        digits:     2,
        axis:       { suggestedMin: 0, suggestedMax: 1 },
    },
    acoustic: {
        request:    "getStadiumBleacherAcousticAll",
        response:   "getStadiumBleacherAcousticAllResponse",
        live:       "newStadiumBleacherAcoustic",
        connection: "stadiumBleacherConnection",
        field:      "acoustic",
        unit:       "dB(A)",
        digits:     1,
        axis:       { suggestedMin: 30, suggestedMax: 90 },
    },
};

const config = CONFIGURATIONS[window.data];

// ============================================================================
//  Initialisation
// ============================================================================

const socket = io();
bindLiveIndicator(socket);

if (window.DEBUG)
    console.log(`[Comparison] Initialisation - type=${window.type} data=${window.data}`);

const timeNavigator = new TimeNavigator();
timeNavigator.bindToolbar(document.getElementById("timebar"));

const events = new MatchEvents(socket, timeNavigator, document.getElementById("events"));

const chart = new TimeChart(document.getElementById("chart"), {
    navigator: timeNavigator,
    events:    events,
    unit:      config.unit,
    datasets:  [],
    ...config.axis,
});
chart.setMulti();

const legend = document.getElementById("legend");
const empty  = document.getElementById("empty");
const series = new Map(); ///< @brief Courbes affichées : id → { button, value, visible }.

document.getElementById("show-all").addEventListener("click", () =>
{
    for (const id of series.keys())
        _setVisible(id, true);
});
document.getElementById("hide-all").addEventListener("click", () =>
{
    for (const id of series.keys())
        _setVisible(id, false);
});

socket.emit(config.request);

// ============================================================================
//  Événements SocketIO
// ============================================================================

/**
 * @brief Réception de l'historique de tous les supporters ou de toutes les tribunes.
 */
socket.on(config.response, (dataList) =>
{
    if (window.DEBUG)
        console.log(`[Comparison] ${config.response} - ${dataList.length} courbe(s)`);

    for (const data of dataList)
    {
        _addSeries(data.id, data.name, data.color);
        chart.setHistory(String(data.id), data.history);
        _setValue(data.id, data.history);
    }
});



/**
 * @brief Réception d'un nouvel envoi de données.
 */
socket.on(config.live, (data) =>
{
    _addSeries(data.id, data.name, data.color);
    chart.addPoints(String(data.id), data.points);
    _setValue(data.id, data.points);
});



/**
 * @brief Nouveau supporter ou nouvelle tribune : rechargement de son historique.
 */
socket.on(config.connection, () =>
{
    socket.emit(config.request);
});



/**
 * @brief Fermeture du serveur.
 */
socket.on("serverClose", () =>
{
    window.location.href = "/";
});

// ============================================================================
//  Fonctions internes
// ============================================================================

/**
 * @brief Ajoute une courbe et son bouton de légende s'ils n'existent pas encore.
 */
function _addSeries(id, name, color)
{
    if (series.has(id))
        return ;

    chart.addDataset(String(id), name, color);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "legend-item";
    button.setAttribute("aria-pressed", "true");

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = color;

    const label = document.createElement("span");
    label.className = "legend-name";
    label.textContent = name;

    const value = document.createElement("span");
    value.className = "legend-value";
    value.textContent = `— ${config.unit}`;

    button.append(swatch, label, value);
    button.addEventListener("click", () => _setVisible(id, !series.get(id).visible));

    // Légende triée par identifiant
    const next = [...series.entries()].find(([otherId]) => otherId > id);
    legend.insertBefore(button, next ? next[1].button : null);

    series.set(id, { button: button, value: value, visible: true });
    empty.classList.add("hidden");
}



/**
 * @brief Affiche ou masque une courbe.
 */
function _setVisible(id, visible)
{
    const entry = series.get(id);
    entry.visible = visible;
    entry.button.setAttribute("aria-pressed", visible ? "true" : "false");
    chart.setVisible(String(id), visible);
}



/**
 * @brief Affiche la dernière valeur d'une courbe dans la légende.
 */
function _setValue(id, points)
{
    if (points && points.length)
        series.get(id).value.textContent = `${Number(points[points.length - 1][1]).toFixed(config.digits)} ${config.unit}`;
}
