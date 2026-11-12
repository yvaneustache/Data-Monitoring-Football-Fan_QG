/**
 * @file index.js
 *
 * @brief Logique de la page d'accueil du dashboard.
 *
 * Affiche le bandeau du match, la vue du stade avec les mesures des tribunes et une carte par supporter connecté,
 * mis à jour en temps réel.
 */

// ============================================================================
//  Import des bibliothèques
// ============================================================================

import { HeartRateBoard } from "./heartRateBoard.js";
import { bindLiveIndicator, GOAL_CODE } from "../Utils/timeChart.js";
import { teamLogo, teamInitials } from "../Utils/teams.js";

// ============================================================================
//  Initialisation
// ============================================================================

const socket = io();
bindLiveIndicator(socket);

// Bandeau vertical : fermé, il est remplacé par un bloc noir de même taille (mémorisé dans le navigateur)
const sideArt       = document.querySelector("[data-side-art]");
const sideArtToggle = document.querySelector("[data-side-art-toggle]");

function setSideArtBlanked(blanked)
{
    sideArt.classList.toggle("is-blanked", blanked);
    sideArtToggle.textContent = blanked ? "›" : "×";
    sideArtToggle.title = blanked ? "Rouvrir le bandeau" : "Fermer le bandeau";
    sideArtToggle.setAttribute("aria-label", sideArtToggle.title);
    sideArtToggle.setAttribute("aria-pressed", String(blanked));
    try { localStorage.setItem("sideArtBlanked", String(blanked)); } catch (e) { /* stockage indisponible */ }
}

if (sideArt && sideArtToggle)
{
    let blanked = false;
    try { blanked = localStorage.getItem("sideArtBlanked") === "true"; } catch (e) { /* stockage indisponible */ }
    setSideArtBlanked(blanked);
    sideArtToggle.addEventListener("click", () => setSideArtBlanked(!sideArt.classList.contains("is-blanked")));
}

// Rythme cardiaque des supporters : cartes en direct (option A) et frise du match (option B)
const heartRateBoard = new HeartRateBoard(document.getElementById("hrCards"), document.getElementById("hrTimeline"));

if (window.DEBUG)
    console.log("[Index] Initialisation - Demande de la liste des supporters et des tribunes connectés");

socket.emit("getSupporter");
socket.emit("getStadiumBleacher");

// ============================================================================
//  Bandeau du match : équipes, logos, score, date et stade
// ============================================================================

const DEFAULT_STADIUM = "Stade du Moustoir"; ///< @brief Stade affiché si aucun n'est saisi dans la préparation du match.

let match = { date: null, stadium: null, domicile: null, exterieur: null, events: [] }; ///< @brief Match en cours.

// Bandeau du match fixé sous la barre du haut, réduit quand la page défile (comme le titre des pages Tribune).
// La hauteur perdue est compensée par une marge basse : la place occupée dans la page ne change pas,
// donc pas de saut du défilement (qui ferait osciller le bandeau entre ses deux tailles).
const matchBanner = document.querySelector("[data-match-banner]");
let   matchBannerHeight = matchBanner.offsetHeight; ///< @brief Hauteur du bandeau en grand (place réservée dans la page).

function _updateMatchBanner()
{
    const wasStuck = matchBanner.classList.contains("is-stuck");
    const stuck    = window.scrollY > 80 ? true : (window.scrollY < 8 ? false : wasStuck);

    if (!stuck)
    {
        matchBanner.classList.remove("is-stuck");
        matchBanner.style.marginBottom = "";
        matchBannerHeight = matchBanner.offsetHeight;
        return ;
    }

    matchBanner.classList.add("is-stuck");
    matchBanner.style.marginBottom = `${Math.max(0, matchBannerHeight - matchBanner.offsetHeight)}px`;
}
window.addEventListener("scroll", _updateMatchBanner, { passive: true });
window.addEventListener("resize", _updateMatchBanner);
_updateMatchBanner();

socket.emit("getMatchEvents");
socket.on("connect", () => socket.emit("getMatchEvents"));
socket.on("matchEventsChanged", () => socket.emit("getMatchEvents"));
socket.on("getMatchEventsResponse", (data) =>
{
    match = { date: data.date, stadium: data.stadium, domicile: data.domicile, exterieur: data.exterieur, events: data.events.sort((a, b) => a.t - b.t) };
    _renderMatch();
    heartRateBoard.setEvents(match.events, { domicile: match.domicile, exterieur: match.exterieur });
});

// ============================================================================
//  Vue du stade : mesures des coins équipés de capteurs
// ============================================================================

/**
 * @brief Mesures affichées sur la vue du stade : unité, décimales et plage de la hauteur des colonnes.
 */
const STADIUM_METRICS = {
    acoustic:      { unit: "dB(A)", digits: 1, min: 40, max: 100 },
    accelerometer: { unit: "m/s²",  digits: 2, min: 0,  max: 1.5 },
    temperature:   { unit: "°C",    digits: 1, min: 0,  max: 35 },
};
const PIN_HEIGHT     = [12, 120];     ///< @brief Hauteur des colonnes (px) : minimum et maximum de la plage.
const stadiumValues  = new Map();     ///< @brief Dernières valeurs : id de tribune → { acoustic, accelerometer, temperature }.
let   stadiumMetric  = "acoustic";    ///< @brief Mesure représentée par les colonnes.

for (const button of document.querySelectorAll("[data-pin-metric]"))
{
    button.addEventListener("click", () =>
    {
        stadiumMetric = button.dataset.pinMetric;
        for (const other of document.querySelectorAll("[data-pin-metric]"))
        {
            other.classList.toggle("is-active", other === button);
            other.setAttribute("aria-pressed", other === button ? "true" : "false");
        }
        // Colonnes des points qui ne mesurent pas la grandeur choisie masquées (y compris sans tribune configurée)
        for (const pin of document.querySelectorAll("[data-pin-metrics]"))
            pin.hidden = !pin.dataset.pinMetrics.split(" ").includes(stadiumMetric);
        for (const id of document.querySelectorAll("[data-pin-id]"))
            _renderPin(Number(id.dataset.pinId));
    });
}
document.querySelectorAll("[data-pin-metrics]").forEach((pin) => { pin.hidden = !pin.dataset.pinMetrics.split(" ").includes(stadiumMetric); });
document.querySelectorAll("[data-pin-id]").forEach((pin) => _renderPin(Number(pin.dataset.pinId)));

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
        heartRateBoard.addSupporter(data);
    _updateSupporters();

    // Historique de fréquence cardiaque
    socket.emit("getSupporterHeartRateAll");
});



/**
 * @brief Historique de fréquence cardiaque de tous les supporters.
 */
socket.on("getSupporterHeartRateAllResponse", (dataList) =>
{
    for (const data of dataList)
    {
        heartRateBoard.addSupporter(data);
        heartRateBoard.setHistory(data.id, data.history, data.current);
    }
    _updateSupporters();
});



/**
 * @brief Connexion d'un nouveau supporter.
 */
socket.on("supporterConnection", (data) =>
{
    if (window.DEBUG)
        console.log(`[Index] supporterConnection - Nouveau supporter id=${data.id} (${data.name})`);

    heartRateBoard.addSupporter(data);
    _updateSupporters();
});



/**
 * @brief Nouvelle mesure de fréquence cardiaque.
 */
socket.on("newSupporterHeartRate", (data) =>
{
    heartRateBoard.addSupporter(data);
    heartRateBoard.addPoints(data.id, data.points, data.current);
    _updateSupporters();
});



/**
 * @brief Déconnexion d'un supporter.
 */
socket.on("supporterDisconnection", (id) =>
{
    heartRateBoard.removeSupporter(id);
    _updateSupporters();
});

// Bouton « Tout remettre à zéro » : toutes les tribunes et tous les supporters, sur toutes les pages ouvertes
document.getElementById("reset-all").addEventListener("click", () =>
{
    if (window.confirm("Remettre à zéro les valeurs de toutes les tribunes et de tous les supporters ?\nLes courbes sont conservées."))
        socket.emit("resetAllStatistics");
});



/**
 * @brief Remise à zéro des statistiques (bouton du Dashboard, page Tribune ou Supporter) : valeur actuelle affichée « — ».
 */
socket.on("statisticsReset", (data) =>
{
    if (data.kind === "stadiumBleacher")
        _setStadiumValue(data.id, data.dataType, data.current ?? null);
    else if (data.kind === "supporter")
        heartRateBoard.setCurrent(data.id, data.current ?? null);
});

// ============================================================================
//  Événements SocketIO : tribunes
// ============================================================================

/**
 * @brief Réception de la liste des tribunes connectées : demande de leurs dernières valeurs pour la vue du stade.
 */
socket.on("getStadiumBleacherResponse", (dataList) =>
{
    if (window.DEBUG)
        console.log(`[Index] getStadiumBleacherResponse - Réception de ${dataList.length} tribune(s)`);

    socket.emit("getStadiumBleacherAcousticAll");
    socket.emit("getStadiumBleacherAccelerometerAll");
    socket.emit("getStadiumBleacherTemperatureAll");
});



/**
 * @brief Dernières valeurs acoustiques.
 */
socket.on("getStadiumBleacherAcousticAllResponse", (dataList) =>
{
    for (const data of dataList)
        _setStadiumCurrent(data, "acoustic", data.history);
});



/**
 * @brief Dernières valeurs de vibration.
 */
socket.on("getStadiumBleacherAccelerometerAllResponse", (dataList) =>
{
    for (const data of dataList)
        _setStadiumCurrent(data, "accelerometer", data.history);
});



/**
 * @brief Dernières valeurs de température.
 */
socket.on("getStadiumBleacherTemperatureAllResponse", (dataList) =>
{
    for (const data of dataList)
        _setStadiumCurrent(data, "temperature", data.history);
});



/**
 * @brief Nouvelle mesure acoustique.
 */
socket.on("newStadiumBleacherAcoustic", (data) =>
{
    _setStadiumCurrent(data, "acoustic", data.points);
});



/**
 * @brief Nouvelle mesure de vibration.
 */
socket.on("newStadiumBleacherAccelerometer", (data) =>
{
    _setStadiumCurrent(data, "accelerometer", data.points);
});



/**
 * @brief Nouvelle mesure de température.
 */
socket.on("newStadiumBleacherTemperature", (data) =>
{
    _setStadiumCurrent(data, "temperature", data.points);
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
 * @brief Met à jour le compteur des supporters et affiche les deux représentations dès qu'un supporter est connecté.
 */
function _updateSupporters()
{
    const count = heartRateBoard.count;
    document.getElementById("supporters-count").textContent = count ? `${count} ${count > 1 ? "supporters connectés" : "supporter connecté"}` : "";
    document.getElementById("supporters-empty").classList.toggle("hidden", count > 0);
    document.getElementById("hrOptions").classList.toggle("hidden", count === 0);
}



/**
 * @brief Reporte la valeur actuelle d'une tribune sur la vue du stade : celle du serveur ("current", vide après une
 *        remise à zéro), à défaut la dernière mesure reçue.
 *
 * @param {Object}                  data   Données reçues (id, current).
 * @param {string}                  metric Mesure.
 * @param {Array<[number, number]>} points Mesures [timestamp, valeur].
 */
function _setStadiumCurrent(data, metric, points)
{
    if ("current" in data)
        _setStadiumValue(data.id, metric, data.current);
    else if (points && points.length)
        _setStadiumValue(data.id, metric, points[points.length - 1][1]);
}



/**
 * @brief Affiche les équipes (nom et logo, ou initiales sans logo connu), le score (d'après les buts), la date et le stade du match.
 */
function _renderMatch()
{
    for (const side of ["domicile", "exterieur"])
    {
        const team = match[side];
        const name = team && team.team ? team.team : (side === "domicile" ? "Domicile" : "Extérieur");
        const logo = teamLogo(team ? team.team : null);

        // Bandeau et barre compacte
        document.querySelectorAll(`[data-team-name="${side}"]`).forEach((element) => { element.textContent = name; });

        for (const logoRoot of document.querySelectorAll(`[data-team-logo="${side}"]`))
        {
            logoRoot.replaceChildren();
            logoRoot.classList.toggle("is-initials", !logo);
            if (logo)
            {
                const image = document.createElement("img");
                image.src = logo;
                image.alt = `Logo ${name}`;
                logoRoot.appendChild(image);
            }
            else
                logoRoot.textContent = teamInitials(team ? team.team : null);
        }

        // Score : nombre de buts de l'équipe
        const goals = match.events.filter((event) => event.code === GOAL_CODE && team && event.team === team.id).length;
        document.querySelectorAll(`[data-team-score="${side}"]`).forEach((element) => { element.textContent = goals; });
    }

    // Date : celle du coup d'envoi s'il a eu lieu, sinon celle de la préparation du match
    const kickOff = match.events.find((event) => event.code === 1);
    const date    = kickOff ? kickOff.t : match.date;
    const text    = date ? new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
    document.querySelectorAll("[data-match-date]").forEach((element) => { element.textContent = text.charAt(0).toUpperCase() + text.slice(1); });

    document.querySelectorAll("[data-match-stadium]").forEach((element) => { element.textContent = match.stadium || DEFAULT_STADIUM; });
}



/**
 * @brief Enregistre la dernière valeur d'une tribune et met à jour sa carte et sa colonne sur la vue du stade.
 *
 * @param {number} id     Identifiant de la tribune.
 * @param {string} metric Mesure ("acoustic", "accelerometer" ou "temperature").
 * @param {number} value  Valeur.
 */
function _setStadiumValue(id, metric, value)
{
    if (!(metric in STADIUM_METRICS))
        return ;

    const values = stadiumValues.get(id) || {};
    values[metric] = value;
    stadiumValues.set(id, values);

    const card = document.querySelector(`[data-corner-id="${id}"] [data-metric="${metric}"]`);
    if (card)
        card.textContent = _formatStadium(metric, value);

    _renderPin(id);
}



/**
 * @brief Colonne d'un coin du stade : hauteur proportionnelle à la mesure choisie, valeur au sommet.
 */
function _renderPin(id)
{
    const pin = document.querySelector(`[data-pin-id="${id}"]`);
    if (!pin)
        return ;

    // Colonne affichée seulement si le point mesure la grandeur choisie (température : tribune Sud et extérieur)
    const measured = pin.dataset.pinMetrics.split(" ").includes(stadiumMetric);
    pin.hidden = !measured;
    if (!measured)
        return ;

    const config = STADIUM_METRICS[stadiumMetric];
    const value  = (stadiumValues.get(id) || {})[stadiumMetric];
    const ratio  = value == null ? 0 : Math.min(1, Math.max(0, (value - config.min) / (config.max - config.min)));
    const height = PIN_HEIGHT[0] + ratio * (PIN_HEIGHT[1] - PIN_HEIGHT[0]);

    pin.classList.toggle("is-empty", value == null);
    pin.querySelector("[data-pin-column]").style.height = `${height}px`;
    pin.querySelector("[data-pin-tag]").style.top = `${-(height + 6)}px`;
    pin.querySelector("[data-pin-value]").textContent = _formatStadium(stadiumMetric, value);
    pin.querySelector("[data-pin-unit]").textContent = config.unit;
}



/**
 * @brief Valeur formatée à la française ("78,4"), "—" si absente.
 */
function _formatStadium(metric, value)
{
    return value == null ? "—" : Number(value).toFixed(STADIUM_METRICS[metric].digits).replace(".", ",");
}
