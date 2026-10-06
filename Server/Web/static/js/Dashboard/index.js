/**
 * @file index.js
 *
 * @brief Logique de la page d'accueil du dashboard.
 *
 * Affiche une carte par supporter et par tribune connectés, avec leur dernière mesure mise à jour en temps réel, et les cartes de comparaison dès que deux supporters ou deux tribunes sont connectés.
 */

// ============================================================================
//  Import des bibliothèques
// ============================================================================

import { supporterCard, stadiumBleacherCard, comparisonCard, setCardValue } from "../Utils/element.js";
import { bindLiveIndicator } from "../Utils/timeChart.js";

// ============================================================================
//  Initialisation
// ============================================================================

const socket = io();
bindLiveIndicator(socket);

const gridSupporter       = document.getElementById("gridSupporter");
const gridStadiumBleacher = document.getElementById("gridStadiumBleacher");

if (window.DEBUG)
    console.log("[Index] Initialisation - Demande de la liste des supporters et des tribunes connectés");

socket.emit("getSupporter");
socket.emit("getStadiumBleacher");

// ============================================================================
//  Événements SocketIO : supporters
// ============================================================================

/**
 * @brief Réception de la liste des supporters connectés.
 */
socket.on("getSupporterResponse", (dataList) =>
{
    if (window.DEBUG)
        console.log(`[Index] getSupporterResponse - Réception de ${dataList.length} supporter(s)`);

    for (const data of dataList)
        _addSupporter(data);

    // Dernières valeurs
    socket.emit("getSupporterHeartRateAll");
});



/**
 * @brief Dernières valeurs de fréquence cardiaque.
 */
socket.on("getSupporterHeartRateAllResponse", (dataList) =>
{
    for (const data of dataList)
        _setLast(document.getElementById("s" + data.id), "heart_rate", data.history);
});



/**
 * @brief Connexion d'un nouveau supporter.
 */
socket.on("supporterConnection", (data) =>
{
    if (window.DEBUG)
        console.log(`[Index] supporterConnection - Nouveau supporter id=${data.id} (${data.name})`);

    _addSupporter(data);
});



/**
 * @brief Nouvelle mesure de fréquence cardiaque.
 */
socket.on("newSupporterHeartRate", (data) =>
{
    _addSupporter(data);
    _setLast(document.getElementById("s" + data.id), "heart_rate", data.points);
});



/**
 * @brief Déconnexion d'un supporter.
 */
socket.on("supporterDisconnection", (id) =>
{
    const card = document.getElementById("s" + id);
    if (card)
        card.remove();

    _updateSupporters();
});

// ============================================================================
//  Événements SocketIO : tribunes
// ============================================================================

/**
 * @brief Réception de la liste des tribunes connectées.
 */
socket.on("getStadiumBleacherResponse", (dataList) =>
{
    if (window.DEBUG)
        console.log(`[Index] getStadiumBleacherResponse - Réception de ${dataList.length} tribune(s)`);

    for (const data of dataList)
        _addStadiumBleacher(data);

    // Dernières valeurs
    socket.emit("getStadiumBleacherAcousticAll");
    socket.emit("getStadiumBleacherAccelerometerAll");
});



/**
 * @brief Dernières valeurs acoustiques.
 */
socket.on("getStadiumBleacherAcousticAllResponse", (dataList) =>
{
    for (const data of dataList)
        _setLast(document.getElementById("b" + data.id), "acoustic", data.history);
});



/**
 * @brief Dernières valeurs de vibration.
 */
socket.on("getStadiumBleacherAccelerometerAllResponse", (dataList) =>
{
    for (const data of dataList)
        _setLast(document.getElementById("b" + data.id), "accelerometer", data.history);
});



/**
 * @brief Connexion d'une nouvelle tribune.
 */
socket.on("stadiumBleacherConnection", (data) =>
{
    if (window.DEBUG)
        console.log(`[Index] stadiumBleacherConnection - Nouvelle tribune id=${data.id} (${data.name})`);

    _addStadiumBleacher(data);
});



/**
 * @brief Nouvelle mesure acoustique.
 */
socket.on("newStadiumBleacherAcoustic", (data) =>
{
    _addStadiumBleacher(data);
    _setLast(document.getElementById("b" + data.id), "acoustic", data.points);
});



/**
 * @brief Nouvelle mesure de vibration.
 */
socket.on("newStadiumBleacherAccelerometer", (data) =>
{
    _addStadiumBleacher(data);
    _setLast(document.getElementById("b" + data.id), "accelerometer", data.points);
});



/**
 * @brief Déconnexion d'une tribune.
 */
socket.on("stadiumBleacherDisconnection", (id) =>
{
    const card = document.getElementById("b" + id);
    if (card)
        card.remove();

    _updateStadiumBleachers();
});



/**
 * @brief Fermeture du serveur.
 */
socket.on("serverClose", () =>
{
    if (window.DEBUG)
        console.log("[Index] serverClose - Fermeture du serveur, rechargement de la page");

    window.location.href = "/";
});

// ============================================================================
//  Fonctions internes
// ============================================================================

/**
 * @brief Ajoute la carte d'un supporter si elle n'existe pas encore.
 */
function _addSupporter(data)
{
    if (document.getElementById("s" + data.id))
        return ;

    gridSupporter.insertBefore(supporterCard(data.id, data.name, data.color), _firstComparison(gridSupporter));
    _updateSupporters();
}



/**
 * @brief Ajoute la carte d'une tribune si elle n'existe pas encore.
 */
function _addStadiumBleacher(data)
{
    if (document.getElementById("b" + data.id))
        return ;

    gridStadiumBleacher.insertBefore(stadiumBleacherCard(data.id, data.name, data.color), _firstComparison(gridStadiumBleacher));
    _updateStadiumBleachers();
}



/**
 * @brief Met à jour le compteur et la carte de comparaison des supporters.
 */
function _updateSupporters()
{
    const count = gridSupporter.querySelectorAll(".supporter-card").length;
    _updateSection("supporters", count, count > 1 ? "supporters connectés" : "supporter connecté");

    const comparison = document.getElementById("comparisonSupporter");
    if (count >= 2 && !comparison)
        gridSupporter.appendChild(comparisonCard("Supporter", "heart_rate", "Fréquence cardiaque"));
    else if (count < 2 && comparison)
        comparison.remove();
}



/**
 * @brief Met à jour le compteur et les cartes de comparaison des tribunes.
 */
function _updateStadiumBleachers()
{
    const count = gridStadiumBleacher.querySelectorAll(".bleacher-card").length;
    _updateSection("bleachers", count, count > 1 ? "tribunes connectées" : "tribune connectée");

    const comparisons = gridStadiumBleacher.querySelectorAll(".comparison-card");
    if (count >= 2 && comparisons.length === 0)
    {
        gridStadiumBleacher.appendChild(comparisonCard("StadiumBleacher", "acoustic", "Acoustique"));
        gridStadiumBleacher.appendChild(comparisonCard("StadiumBleacher", "accelerometer", "Vibration"));
    }
    else if (count < 2)
        comparisons.forEach((card) => card.remove());
}



/**
 * @brief Affiche le nombre d'éléments connectés d'une section.
 */
function _updateSection(prefix, count, label)
{
    document.getElementById(`${prefix}-count`).textContent = count ? `${count} ${label}` : "";
    document.getElementById(`${prefix}-empty`).classList.toggle("hidden", count > 0);
}



/**
 * @brief Retourne la première carte de comparaison d'une grille (les cartes sont insérées avant).
 */
function _firstComparison(grid)
{
    return grid.querySelector(".comparison-card");
}



/**
 * @brief Affiche la dernière valeur d'une liste de points [timestamp, valeur] sur une carte.
 */
function _setLast(card, metric, points)
{
    if (points && points.length)
        setCardValue(card, metric, points[points.length - 1][1]);
}
