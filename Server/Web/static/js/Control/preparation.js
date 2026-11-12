/**
 * @file preparation.js
 * 
 * @brief Logique de la page de préparation d'avant match.
 * 
 * Ajoute un écouteur d'évènements sur le select pour la création d'une nouvelle configuration.
 */

import { teamLogo, teamInitials } from "../Utils/teams.js";

let timeout;
const socket = io();

// Ajout d'un écouteur de changement
const select = document.getElementById("config");
select.addEventListener("change", () => 
{
	if (window.DEBUG)
		console.log(`[Preparation] Changement de configuration: ${select.value}`);
	
	// Redirection vers la création d'une nouvelle configuration
	if (select.value === "Nouvelle configuration")
		window.location.href = "/event/configuration";
});

// Mise à jour du match
document.addEventListener("DOMContentLoaded", () =>
{
    const domicileTeam = document.querySelector("#domicile input[name='team']");
    const exterieurTeam = document.querySelector("#exterieur input[name='team']");
    const matchInput = document.querySelector("#match input[name='match']");

    function updateMatchName()
    {
        const domicile = domicileTeam.value || "";
        const exterieur = exterieurTeam.value || "";

        matchInput.value = `${domicile} - ${exterieur}`;

        // Aperçu du logo de chaque équipe (initiales si le logo n'est pas connu)
        for (const input of [domicileTeam, exterieurTeam])
        {
            const logoRoot = input.closest("form").querySelector("[data-team-logo]");
            const logo     = teamLogo(input.value);
            logoRoot.replaceChildren();
            logoRoot.classList.toggle("is-initials", !logo);
            if (logo)
            {
                const image = document.createElement("img");
                image.src = logo;
                image.alt = `Logo ${input.value}`;
                logoRoot.appendChild(image);
            }
            else
                logoRoot.textContent = teamInitials(input.value);
        }

        if (window.DEBUG)
        	console.log(`[Preparation] Mise à jour du match: ${matchInput.value}`);

        return ;
    }

    // Écoute les changements sur les deux inputs
    domicileTeam.addEventListener("input", updateMatchName);
    exterieurTeam.addEventListener("input", updateMatchName);

    // Initialisation
    updateMatchName();
});



// Envoi des données d'avant match
document.addEventListener("DOMContentLoaded", () =>
{
    // Champs du match et des équipes (le tableau des capteurs a son propre enregistrement)
    const inputs = document.querySelectorAll("form input, form select");

    inputs.forEach(input =>
    {
        input.addEventListener("input", autoSend);
        input.addEventListener("change", autoSend);
    });
});



/**
 * @brief Récupération des informations d'avant match.
 */
function getMatchInformation()
{
    const domicileForm = document.getElementById("domicile");
    const exterieurForm = document.getElementById("exterieur");
    const matchForm = document.getElementById("match");

    function getTeamData(form)
    {
        // L'entraîneur et les joueurs ne sont plus saisis (remplacés par les capteurs des tribunes)
        const data =
        {
            id: form.querySelector("input[name='team']").getAttribute("teamId"),
            team: form.querySelector("input[name='team']").value,
            coach: null,
            player: []
        };

        return data;
    }

    const matchInformation = 
    {
        domicile: getTeamData(domicileForm),
        exterieur: getTeamData(exterieurForm),
        stadium: matchForm.querySelector("input[name='stadium']").value,
        config: matchForm.querySelector("#config").value,
        id: matchForm.querySelector("input[name='stadium']").getAttribute("matchId")
    };

    return matchInformation;
}



/**
 * @brief Envoi automatique des données
 */
function autoSend()
{
    clearTimeout(timeout);

    timeout = setTimeout(() => 
    {
        const data = JSON.stringify(getMatchInformation(), null, 4);

        socket.emit("matchInformation", data);

        if (window.DEBUG)
            console.log("Infomation du match envoyé :", data);
    }, 500);

    return ;
}




// ============================================================================
//  Capteurs des tribunes
// ============================================================================

const sensorsTable  = document.querySelector("[data-sensors-table]");
const sensorsStatus = document.querySelector("[data-sensors-status]");

/**
 * @brief Envoie les mesures cochées de chaque tribune ({ "<id>": ["acoustic", …] }) pour enregistrement.
 */
function sendSensors()
{
    const metrics = {};
    for (const row of sensorsTable.querySelectorAll("[data-bleacher-id]"))
        metrics[row.dataset.bleacherId] = [...row.querySelectorAll("input[data-metric]:checked")].map((input) => input.dataset.metric);

    sensorsStatus.textContent = "Enregistrement…";
    socket.emit("stadiumBleacherMetrics", metrics);

    if (window.DEBUG)
        console.log("[Preparation] Capteurs des tribunes envoyés :", metrics);
}

if (sensorsTable)
    sensorsTable.addEventListener("change", sendSensors);

socket.on("stadiumBleacherMetricsResponse", (response) =>
{
    sensorsStatus.textContent = response.ok ? "Enregistré" : `Enregistrement impossible : ${response.error}`;
    sensorsStatus.classList.toggle("is-error", !response.ok);
});




// ============================================================================
//  Nouveau match
// ============================================================================

/**
 * @brief Crée un nouveau match vide (après confirmation) et recharge la page pour le préparer.
 */
document.querySelector("[data-new-match]").addEventListener("click", () =>
{
    if (window.confirm("Créer un nouveau match ?\nIl devient le match en cours ; le match actuel et ses évènements sont conservés."))
        socket.emit("newMatch");
});

socket.on("newMatchResponse", () =>
{
    window.location.reload();
});
