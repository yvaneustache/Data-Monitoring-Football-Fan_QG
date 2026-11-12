/**
 * @file videoWindow.js
 *
 * @brief Fenêtre de la vidéo du match, pilotée par la page du rejeu (cf. RemotePlayer dans matchVideo.js) :
 *        reçoit les ordres (chargement, position, lecture, titre) et renvoie l'état de la vidéo (curseur des courbes).
 */

const params  = new URLSearchParams(window.location.search);
const channel = new BroadcastChannel(params.get("channel") || "match-video");
const video   = document.querySelector("video");
const caption = document.querySelector("[data-caption]");

/** @brief Envoie l'état de la vidéo au rejeu. */
function sendState(event)
{
    channel.postMessage({
        type:  "state",
        event: event,
        state: { currentTime: video.currentTime, duration: video.duration, readyState: video.readyState, paused: video.paused },
    });
}

for (const name of ["timeupdate", "seeked", "loadedmetadata", "play", "pause"])
    video.addEventListener(name, () => sendState(name === "play" || name === "pause" ? "timeupdate" : name));

channel.onmessage = ({ data }) =>
{
    if (data.type === "load")
    {
        if (data.src && !video.src.endsWith(data.src))
            video.src = data.src;
        if (data.time)
            video.addEventListener("loadedmetadata", () => { video.currentTime = data.time; }, { once: true });
    }
    else if (data.type === "seek")
        video.currentTime = data.time;
    else if (data.type === "play")
        video.play().catch(() => { /* lecture bloquée : bouton ▶ de la vidéo */ });
    else if (data.type === "pause")
        video.pause();
    else if (data.type === "caption")
    {
        caption.textContent = data.text;
        document.title = `${data.text} · Vidéo du match`;
    }
    else if (data.type === "close")
        window.close();
};

// Prête : le rejeu envoie la vidéo et sa position ; fermeture signalée au rejeu
channel.postMessage({ type: "ready" });
window.addEventListener("beforeunload", () => channel.postMessage({ type: "closed" }));
