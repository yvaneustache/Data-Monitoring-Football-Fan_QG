/**
 * @file element.js
 *
 * @brief Composants UI et utilitaires graphiques partagés entre les pages.
 *
 * Fournit les fonctions de création d'éléments HTML.
 */

// ============================================================================
//  Fonction de création de composant HTML
// ============================================================================

/**
 * @brief Crée et retourne une carte HTML cliquable représentant un supporter.
 *
 * La carte affiche la pastille du supporter, son nom et sa dernière fréquence cardiaque (élément .value, mis à jour par setCardValue()).
 *
 * @param {number} id    Identifiant unique du supporter.
 * @param {string} name  Nom d'affichage du supporter.
 * @param {string} color Code couleur du supporter
 *
 * @returns {HTMLAnchorElement} Élément prêt à être inséré dans le DOM.
 */
export function supporterCard(id, name, color)
{
    if (DEBUG)
        console.log(`[Element] supporterCard - Création de la carte pour le supporter id=${id} (${name})`);

    const card = document.createElement("a");
    card.id = "s" + id;
    card.href = "/supporter/" + id;
    card.classList.add("card", "supporter-card");

    const head = document.createElement("div");
    head.classList.add("card-head");

    const avatar = document.createElement("span");
    avatar.classList.add("avatar");
    avatar.style.backgroundColor = color;
    avatar.textContent = name.charAt(0);

    const identity = document.createElement("div");
    const pName = document.createElement("p");
    pName.classList.add("name");
    pName.textContent = name;
    const pId = document.createElement("p");
    pId.classList.add("id");
    pId.textContent = "Supporter n°" + id;
    identity.append(pName, pId);
    head.append(avatar, identity);

    const value = document.createElement("p");
    value.classList.add("metric");
    value.innerHTML = '<span class="value" data-metric="heart_rate">—</span> <span class="unit">bpm</span>';

    const bar = document.createElement("div");
    bar.classList.add("bar");
    const fill = document.createElement("div");
    fill.classList.add("bar-fill");
    bar.appendChild(fill);

    card.append(head, value, bar);

    return card;
}



/**
 * @brief Crée et retourne une carte HTML cliquable représentant une tribune.
 *
 * La carte affiche le nom de la tribune, son dernier niveau sonore et sa dernière vibration (éléments .value, mis à jour par setCardValue()).
 *
 * @param {number} id    Identifiant unique de la tribune.
 * @param {string} name  Nom d'affichage de la tribune.
 * @param {string} color Code couleur de la tribune
 *
 * @returns {HTMLAnchorElement} Élément prêt à être inséré dans le DOM.
 */
export function stadiumBleacherCard(id, name, color)
{
    if (DEBUG)
        console.log(`[Element] stadiumBleacherCard - Création de la carte pour la tribune id=${id} (${name})`);

    const card = document.createElement("a");
    card.id = "b" + id;
    card.href = "/stadiumBleacher/" + id;
    card.classList.add("card", "bleacher-card");

    const head = document.createElement("div");
    head.classList.add("card-head", "spread");

    const pName = document.createElement("p");
    pName.classList.add("name");
    pName.textContent = "Tribune " + name;

    const pId = document.createElement("span");
    pId.classList.add("badge");
    pId.textContent = "n°" + id;
    head.append(pName, pId);

    const metrics = document.createElement("div");
    metrics.classList.add("metrics");
    metrics.innerHTML =
        '<div class="metric-box"><p class="metric-label">Acoustique</p><p class="metric"><span class="value" data-metric="acoustic">—</span> <span class="unit">dB(A)</span></p></div>' +
        '<div class="metric-box"><p class="metric-label">Vibration</p><p class="metric"><span class="value" data-metric="accelerometer">—</span> <span class="unit">m/s²</span></p></div>';

    card.append(head, metrics);

    return card;
}



/**
 * @brief Met à jour la valeur affichée sur une carte du dashboard.
 *
 * @param {HTMLElement} card   Carte (supporter ou tribune).
 * @param {string}      metric Donnée ("heart_rate", "acoustic", "accelerometer").
 * @param {number}      value  Dernière valeur reçue.
 */
export function setCardValue(card, metric, value)
{
    const element = card ? card.querySelector(`.value[data-metric='${metric}']`) : null;
    if (!element || value == null)
        return ;

    const digits = metric === "accelerometer" ? 2 : (metric === "acoustic" ? 1 : 0);
    element.textContent = Number(value).toFixed(digits);

    // Jauge de fréquence cardiaque, de 40 à 200 bpm
    const fill = card.querySelector(".bar-fill");
    if (fill && metric === "heart_rate")
        fill.style.width = `${Math.max(0, Math.min(100, ((value - 40) / 160) * 100))}%`;

    return ;
}



/**
 * @brief Crée et retourne la carte HTML de comparaison entre supporters ou tribunes.
 *
 * @param type  Type de comparaison.
 * @param data  Type de données de comparaison.
 * @param titre Titre de la carte.
 *
 * @returns {HTMLAnchorElement} Élément prêt à être inséré dans le DOM.
 */
export function comparisonCard(type, data, titre)
{
    if (DEBUG)
        console.log("[Element] comparisonCard - Création de la carte de comparaison");

    const card = document.createElement("a");
    card.id = "comparison" + type + (type === "StadiumBleacher" ? "_" + data : "");
    card.href = "/comparison/" + type + "/" + data;
    card.classList.add("card", "comparison-card");

    const pId = document.createElement("p");
    pId.classList.add("id");
    pId.textContent = "Comparer";

    const pName = document.createElement("p");
    pName.classList.add("name");
    pName.textContent = titre;

    card.append(pId, pName);

    return card;
}



/**
 * @brief Crée et retourne une carte HTML cliquable représentant un tracker.
 *
 * @param {number} id    Identifiant unique du tracker.
 * @param {string} name  Nom d'affichage du tracker.
 * @param {string} color Code couleur du tracker
 *
 * @returns {HTMLDivElement} Élément div prêt à être inséré dans le DOM.
 */
export function trackerCard(id, name, color)
{
    if (DEBUG)
        console.log(`[Element] trackerCard - Création de la carte pour le tracker id=${id} (${name})`);

    // Création de la carte
    const card = document.createElement("div");
    card.id = "t" + id;
    card.classList.add("card");

    // Redirection vers la page de détail du supporter au clic
    card.addEventListener("click", () =>
        {
            if (DEBUG)
                console.log(`[Element] trackerCard - Clic sur la carte du tracker id=${id}, redirection vers /tracker/${id}`);

            window.location.href = "/tracker/" + id;
        });

    // Création des éléments texte
    const pName = document.createElement("p");
    pName.textContent = name;
    pName.classList.add("name");
    pName.style.color = color;

    const pId = document.createElement("p");
    pId.textContent = "Tracker n°" + id;
    pId.classList.add("id");

    card.appendChild(pName);
    card.appendChild(pId);

    return card;
}



/**
 * @brief Crée et retourne un évènement.
 *
 * @param {string}   name    Nom de l'évènement.
 * @param {number}   code    Code de l'évènement.
 * @param {number}   matchId Identifiant du match.
 * @param {socketio} socket  Socket de connexion au serveur.
 *
 * @returns {HTMLDivElement} Élément div prêt à être inséré dans le DOM.
 */
export function createEvent(name, code, matchId, socket)
{
    if (window.DEBUG)
        console.log(`[Element] createEvent - Création de l'évènement : ${name}`);

    // Création de l'élément
    const div = document.createElement("div");
    const info = document.createElement("span");
    const p = document.createElement("p");
    const buttons = document.createElement("div");
    const removeImg = document.createElement("img");
    const modifyImg = document.createElement("img");

    if (window.matchMedia("(prefers-color-scheme: dark)").matches)
        removeImg.src = window.deleteDarkIcon;
    else
        removeImg.src = window.deleteLightIcon
    if (window.matchMedia("(prefers-color-scheme: dark)").matches)
        modifyImg.src = window.modifyDarkIcon;
    else
        modifyImg.src = window.modifyLightIcon;

    info.classList.add("hidden");
    info.setAttribute("code", code);
    info.setAttribute("minute_number", null);
    info.setAttribute("match_minute", null);
    info.setAttribute("team", null);
    info.setAttribute("player", null);
    info.setAttribute("offending_player", null);
    info.setAttribute("victim_player", null);
    info.setAttribute("out_player", null);
    info.setAttribute("in_player", null);
    info.setAttribute("detail", null);
    info.setAttribute("match", matchId);
    p.appendChild(document.createElement("span"));
    p.textContent = name;
    p.name = name;
    removeImg.alt = "Icone de suppression";
    modifyImg.alt = "Icone de modification";
    div.appendChild(info);
    div.appendChild(p);
    buttons.appendChild(modifyImg);
    buttons.appendChild(removeImg);
    div.appendChild(buttons);

    // Ajout des évènements de modification et suppression de l'évènement
    removeImg.addEventListener("click", () =>
    {
        if (window.DEBUG)
            console.log(`[Element] createElement - Suppression de l'évènement : ${p.textContent}`);

        const eventSelected = document.getElementById("event-selected");
        if (eventSelected.querySelector("p").textContent == info.getAttribute("id"))
            eventSelected.classList.add("hidden");
        div.remove();
        socket.emit("deleteEvent", info.getAttribute("id"));
    });
    modifyImg.addEventListener("click", () =>
    {
        if (window.DEBUG)
            console.log(`[Element] Modification de l'évènement : ${p.textContent}`);

        const eventSelected = document.getElementById("event-selected");
        eventSelected.classList.remove("hidden");

        const h3 = eventSelected.querySelector("h3");
        const idEventSelected = eventSelected.querySelector("p");

        h3.textContent = p.textContent;
        idEventSelected.textContent = info.getAttribute("id");

        undisplayEventInformation();

        // Afficher les champs dynamiques
        for (const category of JSON.parse(window.configInformation))
        {
            const foundEvent = category.event.find(e => e.name === p.name);
            if (foundEvent)
            {
                for (const field of foundEvent.data)
                    displayEventInformation(field);
            }
        }

        const bindInput = (name, attr) =>
        {
            const input = eventSelected.querySelector(`input[name='${name}']`);
            if (!input)
                return ;

            // Définir valeur par défaut si elle existe
            const value = info.getAttribute(attr);
            if (value !== null)
                input.value = value;

            // Update du span au changement
            input.onchange = () =>
            {
                info.setAttribute(attr, input.value);
                if (info.getAttribute("match_minute") != "null")
                {
                    const event = document.querySelector(`#event-list span[id='${info.getAttribute("id")}']`).nextElementSibling;
                    event.textContent = `${info.getAttribute("match_minute")}' ${event.name}`;
                }
            };
        };

        bindInput("Timestamp", "ts");
        bindInput("Minute de jeu", "match_minute");
        bindInput("Nombre de minutes", "minute_number");
        bindInput("Cause", "detail");

        const bindSelect = (name, attr, optionAttr) =>
        {
            const select = eventSelected.querySelector(`select[name='${name}']`);
            if (!select)
                return ;

            const value = info.getAttribute(attr);

            // Définir valeur par défaut si elle existe
            if (value !== null)
            {
                const option = select.querySelector(`option[${optionAttr}='${value}']`);
                if (option)
                    select.value = option.value;
            }

            // Update du span au changement
            select.onchange = () =>
            {
                const selectedOption = select.options[select.selectedIndex];
                if (selectedOption)
                {
                    info.setAttribute(attr, selectedOption.getAttribute(optionAttr));
                }
            };
        };

        bindSelect("Équipe", "team", "teamId");
        bindSelect("Joueur", "player", "playerId");
        bindSelect("Joueur fautif", "offending_player", "playerId");
        bindSelect("Joueur victime", "victim_player", "playerId");
        bindSelect("Joueur sortant", "out_player", "playerId");
        bindSelect("Joueur entrant", "in_player", "playerId");
    });

    return div;
}



/**
 * @brief Affiche un champ d'information d'évènement.
 *
 * @param {string} info Le type d'information.
 */
function displayEventInformation(info)
{
    switch (info)
    {
        case "Timestamp":
            document.querySelector("input[name='Timestamp']").parentElement.classList.remove("hidden");
            break;

        case "Minute de jeu":
            document.querySelector("input[name='Minute de jeu']").parentElement.classList.remove("hidden");
            break;

        case "Équipe":
            document.querySelector("select[name='Équipe']").classList.remove("hidden");
            break;

        case "Joueur":
            document.querySelector("select[name='Joueur']").classList.remove("hidden");
            break;

        case "Joueur fautif":
            document.querySelector("select[name='Joueur fautif']").classList.remove("hidden");
            break;

        case "Joueur sortant":
            document.querySelector("select[name='Joueur sortant']").classList.remove("hidden");
            break;

        case "Joueur entrant":
            document.querySelector("select[name='Joueur entrant']").classList.remove("hidden");
            break;

        case "Joueur victime":
            document.querySelector("select[name='Joueur victime']").classList.remove("hidden");
            break;

        case "Cause":
            document.querySelector("input[name='Cause']").parentElement.classList.remove("hidden");
            break;

        default:
            if (window.DEBUG)
                console.log(`[Element] createEventInformation - Information '${info}' inconnu`);
            break;
    }

    return ;
}



/**
 * @brief Supprime l'affichage des champs d'information d'évènement.
 */
function undisplayEventInformation()
{
    document.querySelector("input[name='Timestamp']").parentElement.classList.add("hidden");
    document.querySelector("input[name='Minute de jeu']").parentElement.classList.add("hidden");
    document.querySelector("select[name='Équipe']").classList.add("hidden");
    document.querySelector("select[name='Joueur']").classList.add("hidden");
    document.querySelector("select[name='Joueur fautif']").classList.add("hidden");
    document.querySelector("select[name='Joueur sortant']").classList.add("hidden");
    document.querySelector("select[name='Joueur entrant']").classList.add("hidden");
    document.querySelector("select[name='Joueur victime']").classList.add("hidden");
    document.querySelector("input[name='Cause']").parentElement.classList.add("hidden");

    return ;
}
