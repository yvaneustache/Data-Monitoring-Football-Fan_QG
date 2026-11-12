/**
 * @file teams.js
 *
 * @brief Logos des équipes, retrouvés d'après le nom saisi pour le match.
 */

// ============================================================================
//  Constantes
// ============================================================================

/** @brief Logos connus : motif recherché dans le nom de l'équipe (nom complet ou abréviation), fichier du logo (static/images/logos). */
const TEAM_LOGOS = [
    { pattern: /lorient|^\s*fcl\s*$/i, file: "fc-lorient.svg",    abbreviation: "FCL" },
    { pattern: /monaco|^\s*asm\s*$/i,  file: "as-monaco.svg",     abbreviation: "ASM" },
    { pattern: /renn|^\s*srfc\s*$/i,   file: "stade-rennais.svg", abbreviation: "SRFC" },
];

// ============================================================================
//  Fonctions
// ============================================================================

/**
 * @brief Adresse du logo d'une équipe.
 *
 * @param {string|null} name Nom de l'équipe (ex : "Stade Rennais", "AS Monaco").
 *
 * @returns {string|null} Adresse du logo, null si l'équipe n'a pas de logo connu.
 */
export function teamLogo(name)
{
    const team = name ? TEAM_LOGOS.find((entry) => entry.pattern.test(name)) : null;

    return team ? `/static/images/logos/${team.file}` : null;
}

/**
 * @brief Initiales d'une équipe, affichées à la place d'un logo inconnu (ex : "Stade Brestois" → "SB").
 *
 * @param {string|null} name Nom de l'équipe.
 *
 * @returns {string} Une à trois initiales, "?" si le nom est vide.
 */
export function teamInitials(name)
{
    // Mots commençant par une lettre (le numéro de "Stade Brestois 29" est ignoré)
    const words = (name || "").split(/[\s-]+/).filter((word) => /^\p{L}/u.test(word));

    return words.length ? words.slice(0, 3).map((word) => word[0].toUpperCase()).join("") : "?";
}


/**
 * @brief Abréviation d'une équipe : connue (FCL, ASM, SRFC), sinon ses initiales.
 *
 * @param {string|null} name Nom de l'équipe.
 *
 * @returns {string}
 */
export function teamAbbreviation(name)
{
    const team = name ? TEAM_LOGOS.find((entry) => entry.pattern.test(name)) : null;

    return team ? team.abbreviation : teamInitials(name);
}
