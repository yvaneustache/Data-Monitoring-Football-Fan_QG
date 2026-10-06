/**
 * @file export.js
 *
 * @brief Téléchargement des fichiers CSV du match.
 *
 * Le bouton [data-export-csv] télécharge les cinq fichiers CSV (ensemble, vibration, cardiaque, acoustique, évènements) l'un après l'autre.
 */

// ============================================================================
//  Constantes
// ============================================================================

const FILES = ["ensemble", "vibration", "cardiaque", "acoustique", "evenements"]; ///< @brief Types de données exportés.

// ============================================================================
//  Initialisation
// ============================================================================

for (const button of document.querySelectorAll("[data-export-csv]"))
{
    button.addEventListener("click", () =>
    {
        // Un téléchargement toutes les 300 ms : les navigateurs bloquent les téléchargements simultanés
        FILES.forEach((file, index) =>
        {
            setTimeout(() =>
            {
                const link = document.createElement("a");
                link.href = `/export/${file}.csv`;
                link.download = "";
                document.body.appendChild(link);
                link.click();
                link.remove();
            }, index * 300);
        });
    });
}
