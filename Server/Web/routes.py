##
# @file routes.py
#
# @brief Enregistrement des routes HTTP et des gestionnaires d'erreurs Flask.
#
# Déclare toutes les pages web du dashboard et les pages d'erreur HTTP standard (400, 401, 403, 404, 408, 500).
##

# =============================================================================
#  Import des bibliothèques
# =============================================================================

import os
import re
import unicodedata
import json
from datetime import datetime
from flask import render_template, request, redirect, url_for, session, Response, jsonify, send_from_directory, abort

from Server.Config.setting import Config
from Server.Utils.data import getNameOfSupporter, getColorOfSupporter, getNameOfStadiumBleacher, getColorOfStadiumBleacher, getColorOfTracker, getStadiumBleacherIdByName, getStadiumBleacherList, getMetricsOfStadiumBleacher
from Server.Utils.event import loadConfiguration, getConfigurationList, loadMatchInformation, loadConfigurationInformation, getCurrentMatch, getMatchEventList
from Server.Utils.export import EXPORTS, buildCsv, buildZip
from Server.Utils.replay import ReplayError, loadReplay, getReplay, getReplayList, modifyReplayEvents, getReplayExport, clipReplayData
from Server.Utils.logger import Logger

# =============================================================================
#  Création du logger
# =============================================================================

logger = Logger("Serveur/Routes")

# =============================================================================
#  Configuration
# =============================================================================

##
# @brief Points du stade du Moustoir équipés de capteurs (cf. plan d'installation), placés sur la vue
#        static/images/plan-stade.webp (PLAN_STADE.png recadré au format de l'ancienne vue, 624 × 620) : nom de la tribune (stadiumBleacher.json), titre affiché, emplacement,
#        position sur l'image (en % de la largeur et de la hauteur), mesures prises.
#
# Sur le plan, Nord = tribune Lorient Agglomération et Sud = tribune B&B Hôtels ; Est = côté Jean Floc'h,
# Ouest = côté Crédit Mutuel de Bretagne. L'acoustique et la vibration sont mesurées dans trois coins,
# la température dans la tribune Sud et à l'extérieur (rue Jean Le Coutaller).
# Les mesures affichées sont celles configurées pour la tribune (champ "metrics" de stadiumBleacher.json,
# modifiable dans /event/preparation) ; "metrics" ci-dessous ne sert que si la tribune n'est pas déclarée.
##
STADIUM_POINTS = [
    {"name": "Nord-Est",  "title": "Nord-Est",  "place": "Lorient Agglomération · Jean Floc'h",    "x": 41.6, "y": 28.5, "metrics": ["acoustic", "accelerometer"]},
    {"name": "Sud-Est",   "title": "Sud-Est",   "place": "Jean Floc'h · B&B Hôtels",               "x": 84.7, "y": 43.6, "metrics": ["acoustic", "accelerometer"]},
    {"name": "Sud-Ouest", "title": "Sud-Ouest", "place": "B&B Hôtels · Crédit Mutuel de Bretagne", "x": 48.9, "y": 67.8, "metrics": ["acoustic", "accelerometer"]},
    {"name": "Sud",       "title": "Sud",       "place": "Tribune B&B Hôtels",                     "x": 76.7, "y": 61.7, "metrics": ["temperature"]},
    {"name": "Exterieur", "title": "Extérieur", "place": "Rue Jean Le Coutaller",                  "x": 25.3, "y": 78.5, "metrics": ["temperature"]},
]

# =============================================================================
#  Fonctions internes
# =============================================================================

##
# @brief Retourne les identifiants précédent et suivant d'un identifiant dans une liste.
#
# @param ids       Identifiants des éléments actifs.
# @param currentId Identifiant de l'élément affiché.
#
# @return tuple (identifiant précédent ou None, identifiant suivant ou None).
##
def _neighbours(ids, currentId):
    ids = sorted(set(ids) | {currentId})
    index = ids.index(currentId)
    prevId = ids[index - 1] if index > 0 else None
    nextId = ids[index + 1] if index < len(ids) - 1 else None

    return prevId, nextId



##
# @brief Vidéos de match disponibles pour le rejeu (fichiers .mp4 et .webm du dossier VIDEO_PATH).
#
# @return list Noms des fichiers, triés.
##
def _videoList():
    try:
        return sorted(name for name in os.listdir(Config.PATH["video"]) if name.lower().endswith((".mp4", ".webm")))
    except OSError:
        return []



##
# @brief Réglages des vidéos (videos.json du dossier VIDEO_PATH) : instant du coup d'envoi dans chaque vidéo (s).
#
# @return dict {nom du fichier: {"kickoff": secondes}}, vide si le fichier est absent ou illisible.
##
def _loadVideoSettings():
    try:
        with open(os.path.join(Config.PATH["video"], "videos.json")) as file:
            return json.load(file)
    except (OSError, ValueError):
        return {}



##
# @brief Abréviations des équipes connues (motif recherché dans le nom saisi, abréviation), comme les logos (teams.js).
##
TEAM_ABBREVIATIONS = [
    (r"lorient|^\s*fcl\s*$", "fcl"),
    (r"monaco|^\s*asm\s*$",  "asm"),
    (r"renn|^\s*srfc\s*$",   "srfc"),
]



##
# @brief Abréviation d'une équipe pour un nom de fichier : connue (fcl, asm, srfc), sinon initiales du nom.
#
# @param name Nom de l'équipe (None si non saisi).
#
# @return str Abréviation en minuscules ("equipe" si le nom est vide).
##
def _teamAbbreviation(name):
    for pattern, abbreviation in TEAM_ABBREVIATIONS:
        if name and re.search(pattern, name, re.IGNORECASE):
            return abbreviation

    # Initiales des mots commençant par une lettre ("Stade Brestois 29" → "sb")
    initials = "".join(word[0] for word in re.split(r"[\s-]+", name or "") if word and word[0].isalpha())
    initials = unicodedata.normalize("NFKD", initials).encode("ascii", "ignore").decode().lower()

    return initials or "equipe"



##
# @brief Préfixe des fichiers exportés : équipes du match, date et heure de l'export.
#
# @param match Match (cf. getCurrentMatch()) : équipes "domicile" et "exterieur".
#
# @return str Préfixe (ex : "fcl-asm_20261018-2130").
##
def _exportPrefix(match):
    domicile  = _teamAbbreviation((match.get("domicile") or {}).get("team"))
    exterieur = _teamAbbreviation((match.get("exterieur") or {}).get("team"))

    return f"{domicile}-{exterieur}_{datetime.now().strftime('%Y%m%d-%H%M')}"

# =============================================================================
#  Enregistrement des routes
# =============================================================================

##
# @brief Enregistre toutes les routes HTTP et les gestionnaires d'erreurs sur l'application Flask.
#
# @param app                 Instance Flask de l'application.
# @param supporterList       Liste partagée des objets Supporter actifs.
# @param stadiumBleacherList Liste partagée des objets StadiumBleacher actifs.
# @param trackerList         Liste partagée des objets Tracker actifs.
# @param postgresqlClient    Client PostgreSQL.
##
def registerRoutes(app, supporterList, stadiumBleacherList, trackerList, postgresqlClient):
    logger.info("[Routes] Enregistrement des routes et gestionnaires d'erreurs")

# =============================================================================
#  Page principale
# =============================================================================

    ##
    # @brief Page d'accueil : liste tous les supporters actifs.
    ##
    @app.route("/")
    def index():
        configured = {item["name"]: item["metrics"] for item in getStadiumBleacherList()}
        corners = [dict(point, id=getStadiumBleacherIdByName(point["name"]), number=index + 1, metrics=configured.get(point["name"], point["metrics"])) for index, point in enumerate(STADIUM_POINTS)]

        return render_template("Dashboard/index.html", debug=int(Config.DEBUG), corners=corners, active="dashboard")



    ##
    # @brief Page de détail d'un supporter.
    #
    # La page est servie pour tout supporter déclaré dans supporter.json, même si aucune donnée n'a encore été reçue.
    #
    # @param supporter_id Identifiant du supporter extrait de l'URL. Le type <int:…> garantit la conversion automatique par Flask et la compatibilité avec supporter.getId().
    ##
    @app.route("/supporter/<int:supporter_id>")
    def supporterPage(supporter_id):
        try:
            name  = getNameOfSupporter(supporter_id)
            color = getColorOfSupporter(supporter_id)
        except RuntimeError:
            return render_template("Control/error.html", code=404), 404

        prevId, nextId = _neighbours([s.getId() for s in supporterList], supporter_id)

        return render_template("Dashboard/supporter.html", debug=int(Config.DEBUG), id=supporter_id, name=name, color=color, sensorDelay=Config.SENSOR_DELAY, prevId=prevId, nextId=nextId, active="dashboard")



    ##
    # @brief Page de détail d'une tribune.
    #
    # La page est servie pour toute tribune déclarée dans stadiumBleacher.json, même si aucune donnée n'a encore été reçue.
    #
    # @param stadium_bleacher_id Identifiant de la tribune extrait de l'URL. Le type <int:…> garantit la conversion automatique par Flask et la compatibilité avec stadiumBleacher.getId().
    ##
    @app.route("/stadiumBleacher/<int:stadium_bleacher_id>")
    def stadiumBleacherPage(stadium_bleacher_id):
        try:
            name  = getNameOfStadiumBleacher(stadium_bleacher_id)
            color = getColorOfStadiumBleacher(stadium_bleacher_id)
        except RuntimeError:
            return render_template("Control/error.html", code=404), 404

        prevId, nextId = _neighbours([b.getId() for b in stadiumBleacherList], stadium_bleacher_id)

        # Mesures des capteurs installés dans la tribune (configurées dans /event/preparation)
        metrics = getMetricsOfStadiumBleacher(stadium_bleacher_id)

        return render_template("Dashboard/stadiumBleacher.html", debug=int(Config.DEBUG), id=stadium_bleacher_id, name=name, color=color, metrics=metrics, sensorDelay=Config.SENSOR_DELAY, prevId=prevId, nextId=nextId, active="dashboard")



    ##
    # @brief Page de comparaison des données de tous les supporters ou toutes les tribunes du stade.
    #
    # @param type Type de comparaison extrait de l'URL. Le type <string:…> garantit la convertion automatique par Flask.
    # @param data Type de données extrait de l'URL. Le type <string:…> garantit la convertion automatique par Flask.
    ##
    @app.route("/comparison/<string:type>/<string:data>")
    def comparisonPage(type, data):
        if (type, data) not in [("Supporter", "heart_rate"), ("StadiumBleacher", "accelerometer"), ("StadiumBleacher", "acoustic"), ("StadiumBleacher", "temperature")]:
            return render_template("Control/error.html", code=404), 404

        # Tribunes : seules celles équipées du capteur comparé (configurées dans /event/preparation)
        allowedIds = [item["id"] for item in getStadiumBleacherList() if data in item["metrics"]] if type == "StadiumBleacher" else None

        return render_template("Dashboard/comparison.html", debug=int(Config.DEBUG), sensorDelay=Config.SENSOR_DELAY, data=data, type=type, allowedIds=allowedIds, active="comparison")

# =============================================================================
#  Rejeu d'un match
# =============================================================================

    ##
    # @brief Page de rejeu : chargement de l'archive ZIP d'un match et liste des matchs chargés.
    #
    # En POST, charge l'archive envoyée (champ "archive") et affiche son rejeu.
    ##
    @app.route("/replay", methods=["GET", "POST"])
    def replayListPage():
        error = None

        if request.method == "POST":
            archive = request.files.get("archive")
            if archive is None or archive.filename == "":
                error = "Aucun fichier sélectionné."
            else:
                try:
                    replayId = loadReplay(archive.read(), archive.filename)
                    logger.info(f"[Routes] Rejeu chargé : '{archive.filename}' (id={replayId})")
                    return redirect(url_for("replayPage", replay_id=replayId))
                except ReplayError as e:
                    logger.warning(f"[Routes] Rejeu impossible pour '{archive.filename}' : {e}")
                    error = str(e)

        return render_template("Dashboard/replayList.html", debug=int(Config.DEBUG), replays=getReplayList(), error=error, active="replay"), (400 if error else 200)



    ##
    # @brief Page de rejeu d'un match chargé.
    #
    # @param replay_id Identifiant du rejeu.
    ##
    @app.route("/replay/<string:replay_id>")
    def replayPage(replay_id):
        replay = getReplay(replay_id)
        if replay is None:
            return redirect(url_for("replayListPage"))

        return render_template("Dashboard/replay.html", debug=int(Config.DEBUG), replay=replay, videos=_videoList(), videoSettings=_loadVideoSettings(), active="replay")



    ##
    # @brief Vidéo d'un match (dossier VIDEO_PATH), envoyée par morceaux (en-tête Range) pour se positionner dedans.
    #
    # @param name Nom du fichier vidéo.
    ##
    @app.route("/video/<path:name>")
    def videoFile(name):
        if name not in _videoList():
            abort(404)

        return send_from_directory(Config.PATH["video"], name, conditional=True)



    ##
    # @brief Fenêtre séparée de la vidéo du match, pilotée par la page du rejeu.
    ##
    @app.route("/video-window")
    def videoWindowPage():
        return render_template("Dashboard/videoWindow.html")



    ##
    # @brief Enregistre l'instant du coup d'envoi dans une vidéo (videos.json), pour la synchroniser avec les courbes.
    ##
    @app.route("/video/settings", methods=["POST"])
    def videoSettings():
        body = request.get_json(silent=True) or {}
        name = body.get("name")
        if name not in _videoList():
            return jsonify({"error": "Vidéo inconnue"}), 404

        try:
            kickoff = float(body["kickoff"]) if body.get("kickoff") is not None else None
        except (TypeError, ValueError):
            return jsonify({"error": "Instant du coup d'envoi invalide"}), 400

        settings = _loadVideoSettings()
        settings.setdefault(name, {})["kickoff"] = kickoff

        try:
            with open(os.path.join(Config.PATH["video"], "videos.json"), "w") as file:
                json.dump(settings, file, ensure_ascii=False, indent=4)
        except OSError as e:
            logger.warning(f"[Routes] Enregistrement des réglages vidéo impossible : {e}")
            return jsonify({"error": "Enregistrement impossible (dossier des vidéos en lecture seule ?)"}), 500

        logger.info(f"[Routes] Vidéo '{name}' : coup d'envoi à {kickoff} s")

        return jsonify({"ok": True})



    ##
    # @brief Données d'un match chargé (mesures et évènements), pour la page de rejeu.
    #
    # @param replay_id Identifiant du rejeu.
    ##
    @app.route("/replay/<string:replay_id>.json")
    def replayData(replay_id):
        replay = getReplay(replay_id)
        if replay is None:
            return jsonify({"error": "Rejeu introuvable"}), 404

        return jsonify(replay)



    ##
    # @brief Modifie les évènements d'un match chargé (ajout, déplacement, suppression), sans toucher au match en cours.
    #
    # Corps JSON : {"action": "addMatchEvent" | "moveMatchEvent" | "deleteMatchEvent", "payload": …}.
    #
    # @param replay_id Identifiant du rejeu.
    ##
    @app.route("/replay/<string:replay_id>/events", methods=["POST"])
    def replayEvents(replay_id):
        body = request.get_json(silent=True) or {}

        try:
            result = modifyReplayEvents(replay_id, body.get("action"), body.get("payload"))
        except (ReplayError, KeyError, TypeError, ValueError) as e:
            logger.warning(f"[Routes] Modification des évènements du rejeu id={replay_id} impossible : {e}")
            return jsonify({"error": str(e)}), 400

        if result is None:
            return jsonify({"error": "Rejeu introuvable"}), 404

        logger.info(f"[Routes] Rejeu id={replay_id} : {body.get('action')} {body.get('payload')}")

        return jsonify(result)



    ##
    # @brief Seuillage d'une donnée d'un match chargé (valeurs hors bornes ramenées aux bornes), enregistré dans le rejeu.
    #
    # @param replay_id Identifiant du rejeu.
    ##
    @app.route("/replay/<string:replay_id>/clip", methods=["POST"])
    def replayClip(replay_id):
        body = request.get_json(silent=True) or {}

        try:
            modified = clipReplayData(replay_id, body["dataType"], body["min"], body["max"])
        except (ReplayError, KeyError, TypeError, ValueError) as e:
            logger.warning(f"[Routes] Seuillage du rejeu id={replay_id} impossible : {e}")
            return jsonify({"error": str(e)}), 400

        if modified is None:
            return jsonify({"error": "Rejeu introuvable"}), 404

        logger.info(f"[Routes] Rejeu id={replay_id} : {body['dataType']} seuillé à [{body['min']}, {body['max']}], {modified} valeur(s) modifiée(s)")

        return jsonify({"modified": modified})



    ##
    # @brief Téléchargement de l'archive ZIP d'un match chargé, avec ses évènements modifiés.
    #
    # @param replay_id Identifiant du rejeu.
    ##
    @app.route("/replay/<string:replay_id>.zip")
    def replayZip(replay_id):
        export = getReplayExport(replay_id)
        if export is None:
            return redirect(url_for("replayListPage"))

        supporters, stadiumBleachers, match, events = export
        prefix = f"rejeu_{_exportPrefix(match)}"
        content = buildZip(prefix, supporters, stadiumBleachers, match, events)

        return Response(content, mimetype="application/zip", headers={"Content-Disposition": f"attachment; filename={prefix}.zip"})

# =============================================================================
#  Page de contrôle
# =============================================================================

    ##
    # @brief Téléchargement d'un fichier CSV par type de données du match en cours.
    #
    # @param kind Type de données : "vibration", "cardiaque", "acoustique" ou "evenements".
    ##
    @app.route("/export/<string:kind>.csv")
    def exportCsv(kind):
        if kind not in EXPORTS:
            return render_template("Control/error.html", code=404), 404

        match = getCurrentMatch(postgresqlClient)
        events = getMatchEventList(postgresqlClient, match["id"])
        content = buildCsv(kind, supporterList, stadiumBleacherList, match, events)

        logger.info(f"[Routes] Export CSV '{kind}' du match id={match['id']}")

        filename = f"{_exportPrefix(match)}_{kind}.csv"
        return Response(content, mimetype="text/csv; charset=utf-8", headers={"Content-Disposition": f"attachment; filename={filename}"})



    ##
    # @brief Téléchargement de l'archive ZIP du match en cours : les fichiers CSV et match.json (pour le rejeu).
    ##
    @app.route("/export/match.zip")
    def exportZip():
        match = getCurrentMatch(postgresqlClient)
        events = getMatchEventList(postgresqlClient, match["id"])
        prefix = _exportPrefix(match)
        content = buildZip(prefix, supporterList, stadiumBleacherList, match, events)

        logger.info(f"[Routes] Export ZIP du match id={match['id']}")

        return Response(content, mimetype="application/zip", headers={"Content-Disposition": f"attachment; filename={prefix}.zip"})



    ##
    # @brief Page de conrôle des évènements.
    ##
    @app.route("/event")
    def eventPage():
        matchInformation, lastInformation = loadMatchInformation(postgresqlClient)
        configInformation = loadConfigurationInformation()
        config = loadConfiguration(matchInformation["config"])
        return render_template("Control/event.html", debug=int(Config.DEBUG), events=config, config=json.dumps(config, ensure_ascii=False), lastInformation=lastInformation, domicile=matchInformation["domicile"], exterieur=matchInformation["exterieur"], configInformation=json.dumps(configInformation, ensure_ascii=False), matchId=matchInformation["id"], active="control")



    ##
    # @brief Page de préparation d'avant match.
    ##
    @app.route("/event/preparation")
    def preparationPage():
        matchInformation, lastInformation = loadMatchInformation(postgresqlClient)
        return render_template("Control/preparation.html", debug=int(Config.DEBUG), configurationList=getConfigurationList(), matchInformation=matchInformation, lastInformation=lastInformation, stadiumBleachers=getStadiumBleacherList(), active="control")



    ##
    # @brief Page de configuration du contrôle d'évènements.
    ##
    @app.route("/event/configuration")
    def configurationPage():
        matchInformation, _ = loadMatchInformation(postgresqlClient)
        config = loadConfiguration(matchInformation["config"])
        return render_template("Control/configuration.html", debug=int(Config.DEBUG), events=config, active="control")



    ##
    # @brief Page de log d'informations systèmes.
    ##
    @app.route("/system")
    def systemPage():
        return render_template("Control/system.html", debug=int(Config.DEBUG), active="system")

# =============================================================================
#  Page de tracking
# =============================================================================

    ##
    # @brief Page de tracking d'objet.
    ##
    @app.route("/tracking")
    def trackingPage():
        return render_template("Tracking/index.html", debug=int(Config.DEBUG), active="tracking")



    ##
    # @brief Page de visualisation d'un tracker
    ##
    @app.route("/tracker/<int:tracker_id>")
    def trackerPage(tracker_id):
        for tracker in trackerList:
            if tracker.getId() == tracker_id:
                return render_template("Tracking/tracker.html", debug=int(Config.DEBUG), id=tracker.getId(), name=tracker.getName(), color=getColorOfTracker(tracker.getId()), active="tracking")

        return render_template("Control/error.html", code=404), 404

# =============================================================================
#  Gestionnaires d'erreurs HTTP
# =============================================================================

    ##
    # @brief Page d'erreur 400.
    ##
    @app.errorhandler(400)
    def badRequest(error):
        return render_template("Control/error.html", code=400), 400



    ##
    # @brief Page d'erreur 401.
    ##
    @app.errorhandler(401)
    def unauthorized(error):
        return render_template("Control/error.html", code=401), 401



    ##
    # @brief Page d'erreur 403.
    ##
    @app.errorhandler(403)
    def forbidden(error):
        return render_template("Control/error.html", code=403), 403



    ##
    # @brief Page d'erreur 404.
    ##
    @app.errorhandler(404)
    def pageNotFound(error):
        return render_template("Control/error.html", code=404), 404



    ##
    # @brief Page d'erreur 405
    ##
    @app.errorhandler(405)
    def methodNotAllowed(error):
        return render_template("Control/error.html", code=405), 405



    ##
    # @brief Page d'erreur 408.
    ##
    @app.errorhandler(408)
    def timeout(error):
        return render_template("Control/error.html", code=408), 408



    ##
    # @brief Page d'erreur 500.
    ##
    @app.errorhandler(500)
    def internalError(error):
        return render_template("Control/error.html", code=500), 500



    return
