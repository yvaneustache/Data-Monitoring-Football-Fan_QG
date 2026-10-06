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
import json
from datetime import datetime
from flask import render_template, request, redirect, url_for, session, Response

from Server.Config.setting import Config
from Server.Utils.data import getNameOfSupporter, getColorOfSupporter, getNameOfStadiumBleacher, getColorOfStadiumBleacher, getColorOfTracker
from Server.Utils.event import loadConfiguration, getConfigurationList, loadMatchInformation, loadConfigurationInformation, getCurrentMatch, getMatchEventList
from Server.Utils.export import EXPORTS, buildCsv
from Server.Utils.logger import Logger

# =============================================================================
#  Création du logger
# =============================================================================

logger = Logger("Serveur/Routes")

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
# @brief Préfixe des fichiers exportés : numéro du match, date et heure de l'export.
#
# @param match Match en cours (cf. getCurrentMatch()).
#
# @return str Préfixe (ex : "match_7_20261005-1530").
##
def _exportPrefix(match):
    return f"match_{match['id']}_{datetime.now().strftime('%Y%m%d-%H%M')}"

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
        return render_template("Dashboard/index.html", debug=int(Config.DEBUG), active="dashboard")



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

        return render_template("Dashboard/stadiumBleacher.html", debug=int(Config.DEBUG), id=stadium_bleacher_id, name=name, color=color, sensorDelay=Config.SENSOR_DELAY, prevId=prevId, nextId=nextId, active="dashboard")



    ##
    # @brief Page de comparaison des données de tous les supporters ou toutes les tribunes du stade.
    #
    # @param type Type de comparaison extrait de l'URL. Le type <string:…> garantit la convertion automatique par Flask.
    # @param data Type de données extrait de l'URL. Le type <string:…> garantit la convertion automatique par Flask.
    ##
    @app.route("/comparison/<string:type>/<string:data>")
    def comparisonPage(type, data):
        if (type, data) not in [("Supporter", "heart_rate"), ("StadiumBleacher", "accelerometer"), ("StadiumBleacher", "acoustic")]:
            return render_template("Control/error.html", code=404), 404

        return render_template("Dashboard/comparison.html", debug=int(Config.DEBUG), sensorDelay=Config.SENSOR_DELAY, data=data, type=type, active="comparison")

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
        return render_template("Control/preparation.html", debug=int(Config.DEBUG), configurationList=getConfigurationList(), matchInformation=matchInformation, lastInformation=lastInformation, active="control")



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
