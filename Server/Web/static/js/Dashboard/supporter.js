/**
 * @file supporter.js
 *
 * @brief Logique de la page de détail d'un supporter.
 *
 * Charge l'historique de fréquence cardiaque du supporter identifié par window.id, met à jour les indicateurs et le graphique à chaque nouvelle mesure reçue via SocketIO, et gère la navigation dans le temps et les évènements du match.
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
    console.log(`[Supporter] Initialisation - Demande des données du supporter id=${window.id}`);

const timeNavigator = new TimeNavigator();
timeNavigator.bindToolbar(document.getElementById("timebar"));

const events = new MatchEvents(socket, timeNavigator, document.getElementById("events"));

const panel = new MeasurePanel("heart-rate", {
    navigator: timeNavigator,
    events:    events,
    label:     window.name,
    unit:      "bpm",
    digits:    0,
    min:       40,
    max:       200,
    step:      20,
    onReset:   () => socket.emit("resetSupporterStatistics", window.id),
});

socket.emit("getSupporterHeartRate", window.id);

// ============================================================================
//  Événements SocketIO
// ============================================================================

/**
 * @brief Réception de l'historique de fréquence cardiaque.
 */
socket.on("getSupporterHeartRateResponse", (data) =>
{
    if (data.id !== window.id)
        return;

    if (window.DEBUG)
        console.log(`[Supporter] getSupporterHeartRateResponse - ${data.history.length} point(s)`);

    panel.load(data);
});



/**
 * @brief Réception d'un nouvel envoi de fréquence cardiaque.
 */
socket.on("newSupporterHeartRate", (data) =>
{
    if (data.id !== window.id)
        return;

    panel.append(data);
});



/**
 * @brief Première donnée du supporter : la page a pu être ouverte avant, on recharge l'historique.
 */
socket.on("supporterConnection", (data) =>
{
    if (data.id === window.id)
        socket.emit("getSupporterHeartRate", window.id);
});



/**
 * @brief Remise à zéro des statistiques (depuis cette page ou une autre).
 */
socket.on("statisticsReset", (data) =>
{
    if (data.kind === "supporter" && data.id === window.id)
        panel.setStatistics({ average: null, minimum: null, maximum: null });
});



/**
 * @brief Déconnexion du supporter actuellement affiché.
 */
socket.on("supporterDisconnection", (supporterId) =>
{
    if (supporterId === window.id)
        showToast("Supporter déconnecté");
});



/**
 * @brief Fermeture du serveur.
 */
socket.on("serverClose", () =>
{
    if (window.DEBUG)
        console.log("[Supporter] serverClose - Fermeture du serveur, redirection vers l'accueil");

    window.location.href = "/";
});
