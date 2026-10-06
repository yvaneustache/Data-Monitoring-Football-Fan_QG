/**
 * @file stadiumBleacher.js
 *
 * @brief Logique de la page de détail d'une tribune.
 *
 * Charge l'historique de vibration et d'acoustique de la tribune identifiée par window.id, met à jour les indicateurs et les graphiques à chaque nouvelle mesure reçue via SocketIO, et gère la navigation dans le temps et les évènements du match.
 */

// ============================================================================
//  Import des bibliothèques
// ============================================================================

import { TimeNavigator, bindLiveIndicator } from "../Utils/timeChart.js";
import { MatchEvents } from "../Utils/matchEvents.js";
import { MeasurePanel, showToast } from "../Utils/measurePanel.js";

// ============================================================================
//  Initialisation
// ============================================================================

const socket = io();
bindLiveIndicator(socket);

if (window.DEBUG)
    console.log(`[StadiumBleacher] Initialisation - Demande des données de la tribune id=${window.id}`);

const timeNavigator = new TimeNavigator();
timeNavigator.bindToolbar(document.getElementById("timebar"));

const events = new MatchEvents(socket, timeNavigator, document.getElementById("events"));

const resetStatistics = (dataType) => socket.emit("resetStadiumBleacherStatistics", window.id, dataType);

const panels = {
    accelerometer: new MeasurePanel("accelerometer", {
        navigator:    timeNavigator,
        events:       events,
        label:        "Vibration",
        unit:         "m/s²",
        digits:       2,
        suggestedMin: 0,
        suggestedMax: 1,
        onReset:      () => resetStatistics("accelerometer"),
    }),
    acoustic: new MeasurePanel("acoustic", {
        navigator:    timeNavigator,
        events:       events,
        label:        "Acoustique",
        unit:         "dB(A)",
        digits:       1,
        suggestedMin: 30,
        suggestedMax: 90,
        onReset:      () => resetStatistics("acoustic"),
    }),
};

document.getElementById("reset-all").addEventListener("click", () =>
{
    resetStatistics("accelerometer");
    resetStatistics("acoustic");
});

const requestData = () =>
{
    socket.emit("getStadiumBleacherAccelerometer", window.id);
    socket.emit("getStadiumBleacherAcoustic", window.id);
};

requestData();

// ============================================================================
//  Événements SocketIO
// ============================================================================

/**
 * @brief Réception de l'historique de vibration de la tribune.
 */
socket.on("getStadiumBleacherAccelerometerResponse", (data) =>
{
    if (data.id !== window.id)
        return;

    if (window.DEBUG)
        console.log(`[StadiumBleacher] getStadiumBleacherAccelerometerResponse - ${data.history.length} point(s)`);

    panels.accelerometer.load(data);
});



/**
 * @brief Réception de l'historique acoustique de la tribune.
 */
socket.on("getStadiumBleacherAcousticResponse", (data) =>
{
    if (data.id !== window.id)
        return;

    if (window.DEBUG)
        console.log(`[StadiumBleacher] getStadiumBleacherAcousticResponse - ${data.history.length} point(s)`);

    panels.acoustic.load(data);
});



/**
 * @brief Réception d'un nouvel envoi de vibration.
 */
socket.on("newStadiumBleacherAccelerometer", (data) =>
{
    if (data.id !== window.id)
        return;

    panels.accelerometer.append(data);
});



/**
 * @brief Réception d'un nouvel envoi acoustique.
 */
socket.on("newStadiumBleacherAcoustic", (data) =>
{
    if (data.id !== window.id)
        return;

    panels.acoustic.append(data);
});



/**
 * @brief Première donnée d'une tribune : la page a pu être ouverte avant, on recharge l'historique.
 */
socket.on("stadiumBleacherConnection", (data) =>
{
    if (data.id === window.id)
        requestData();
});



/**
 * @brief Remise à zéro des statistiques (depuis cette page ou une autre).
 */
socket.on("statisticsReset", (data) =>
{
    if (data.kind !== "stadiumBleacher" || data.id !== window.id || !panels[data.dataType])
        return;

    panels[data.dataType].setStatistics({ average: null, minimum: null, maximum: null });
});



/**
 * @brief Déconnexion de la tribune actuellement affichée.
 */
socket.on("stadiumBleacherDisconnection", (stadiumBleacherId) =>
{
    if (stadiumBleacherId === window.id)
        showToast("Tribune déconnectée");
});



/**
 * @brief Fermeture du serveur.
 */
socket.on("serverClose", () =>
{
    if (window.DEBUG)
        console.log("[StadiumBleacher] serverClose - Fermeture du serveur, redirection vers l'accueil");

    window.location.href = "/";
});
