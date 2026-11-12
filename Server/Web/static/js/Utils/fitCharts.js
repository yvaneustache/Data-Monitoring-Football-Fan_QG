/**
 * @file fitCharts.js
 *
 * @brief Hauteur des courbes adaptée à la hauteur de l'écran : tous les blocs de mesure de la page tiennent
 *        dans la fenêtre sans défilement (avec une hauteur minimale pour les petits écrans).
 */

/**
 * @brief Ajuste la hauteur des courbes (.chart-box) des blocs de mesure (.panel) d'une colonne.
 *
 * @param {HTMLElement} column    Colonne des courbes (.main-col).
 * @param {number}      minHeight Hauteur minimale d'une courbe (px) : en dessous, la page défile.
 */
export function fitChartsToScreen(column, minHeight = 100)
{
    if (!column)
        return;

    const page    = column.closest(".page");
    const sidebar = page?.querySelector(".events");
    const bottom  = 24; ///< @brief Marge sous les blocs, égale à l'écart entre les fenêtres (px).

    // Marge basse de la page réduite à l'écart entre les fenêtres : la page ne dépasse pas de l'écran
    if (page)
        page.style.paddingBottom = `${bottom}px`;

    const update = () =>
    {
        const panels = [...column.querySelectorAll(":scope > .panel")].filter((panel) => panel.querySelector(".chart-box"));
        if (!panels.length)
            return;

        // Place disponible : du haut du premier bloc (position dans la page, indépendante du défilement) au bas de la fenêtre
        const top      = panels[0].getBoundingClientRect().top + window.scrollY;
        const gap      = parseFloat(getComputedStyle(column).rowGap) || 0;
        // Hauteur des blocs hors courbes (titre, indicateurs, marges)
        const overhead = panels.reduce((sum, panel) => sum + panel.offsetHeight - panel.querySelector(".chart-box").offsetHeight, 0);

        const available = window.innerHeight - top - bottom - gap * (panels.length - 1) - overhead;
        const height    = Math.max(minHeight, Math.floor(available / panels.length));

        for (const panel of panels)
        {
            const box = panel.querySelector(".chart-box");
            if (box.style.height !== `${height}px`)
                box.style.height = `${height}px`;
        }

        // Colonne des évènements à côté des courbes : arrêtée au bas de l'écran (défilement interne si elle est plus longue)
        if (sidebar)
        {
            const besides = sidebar.offsetTop === column.offsetTop;
            const sideTop = sidebar.getBoundingClientRect().top + window.scrollY;
            sidebar.style.maxHeight = besides ? `${Math.max(200, window.innerHeight - sideTop - bottom)}px` : "";
            sidebar.style.overflowY = besides ? "auto" : "";
        }
    };

    // Recalcul au redimensionnement de la fenêtre et quand l'en-tête ou les indicateurs changent de taille (retour à la ligne)
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    for (const element of [document.querySelector(".topbar"), ...column.querySelectorAll(":scope > .sticky-head, .panel-header, .kpis")])
        if (element)
            observer.observe(element);
    document.fonts?.ready.then(update);
    update();
}
