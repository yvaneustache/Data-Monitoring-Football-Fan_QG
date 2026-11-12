##
# @file data.py
#
# @brief Utilitaires de lecture des données supporters et de formatage pour le client web.
#
# Fournit les accesseurs getNameOf...() et getColorOf...() qui lisent le fichier supporter.json, ainsi que create...ForClient() qui formate les données pour l'envoi via SocketIO.
##

# =============================================================================
#  Import des bibliothèques
# =============================================================================

import json
import os

from Server.Config.setting import Config
from Server.Utils.logger import Logger

# =============================================================================
#  Création du logger
# =============================================================================

logger = Logger("Serveur/Data")

# =============================================================================
#  Lecture du fichier supporter.json
# =============================================================================

##
# @brief Charge et retourne le contenu du fichier supporter.json.
#
# @return list Liste de dictionnaires représentant les supporters.
#
# @throws RuntimeError Si le fichier est absent ou malformé.
##
def _loadSupporterFile():
    filePath = Config.PATH["data"] + "supporter.json"

    try:
        logger.info(f"[Data] Lecture du fichier supporters : '{filePath}'")

        with open(filePath, "r") as file:
            return json.load(file)

    except FileNotFoundError:
        message = f"[Data] Fichier supporters introuvable : '{filePath}'"
        logger.error(message)
        raise RuntimeError(message)

    except json.JSONDecodeError as e:
        message = f"[Data] Fichier supporters invalide (JSON malformé) : '{filePath}'"
        logger.error(message)
        raise RuntimeError(message) from e

    return



##
# @brief Retourne la valeur d'un champ donné pour le supporter identifié.
#
# @param supporterId Identifiant du supporter recherché.
# @param field       Nom du champ à retourner (ex : "name", "color").
#
# @return Valeur du champ pour le supporter correspondant.
#
# @throws RuntimeError Si aucun supporter ne correspond à l'identifiant.
##
def _getSupporterField(supporterId, field):
    supporters = _loadSupporterFile()

    for item in supporters:
        if item["id"] == supporterId:
            return item[field]

    message = f"[Data] Aucun supporter trouvé avec l'id '{supporterId}'"
    logger.error(message)
    raise RuntimeError(message)

    return

# =============================================================================
#  Lecture du fichier stadiumBleacher.json
# =============================================================================

##
# @brief Charge et retourne le contenu du fichier stadiumBleacher.json.
#
# @return list Liste de dictionnaires représentant les tribunes.
#
# @throws RuntimeError Si le fichier est absent ou malformé.
##
def _loadStadiumBleacherFile():
    filePath = Config.PATH["data"] + "stadiumBleacher.json"

    try:
        logger.info(f"[Data] Lecture du fichier tribunes du stade : '{filePath}'")

        with open(filePath, "r") as file:
            return json.load(file)

    except FileNotFoundError:
        message = f"[Data] Fichier tribunes du stade introuvable : '{filePath}'"
        logger.error(message)
        raise RuntimeError(message)

    except json.JSONDecodeError as e:
        message = f"[Data] Fichier tribunes du stade invalide (JSON malformé) : '{filePath}'"
        logger.error(message)
        raise RuntimeError(message) from e

    return



##
# @brief Retourne la valeur d'un champ donné pour la tribune identifié.
#
# @param stadiumBleacherId Identifiant de la tribune recherché.
# @param field             Nom du champ à retourner.
#
# @return Valeur du champ pour la tribune correspondant.
#
# @throws RuntimeError Si aucune tribune ne correspond à l'identifiant.
##
def _getStadiumBleacherField(stadiumBleacherId, field):
    stadiumBleachers = _loadStadiumBleacherFile()

    for item in stadiumBleachers:
        if item["id"] == stadiumBleacherId:
            return item[field]

    message = f"[Data] Aucune tribune de stade trouvé avec l'id '{stadiumBleacherId}'"
    logger.error(message)
    raise RuntimeError(message)

    return

STADIUM_BLEACHER_METRICS = ["acoustic", "accelerometer", "temperature"] ##< @brief Mesures possibles d'une tribune (champ "metrics" de stadiumBleacher.json).



##
# @brief Retourne la liste des tribunes déclarées, avec les mesures de leurs capteurs.
#
# @return list Liste de {"id", "name", "color", "metrics"} ; sans champ "metrics", toutes les mesures.
##
def getStadiumBleacherList():
    stadiumBleachers = _loadStadiumBleacherFile()
    for item in stadiumBleachers:
        item["metrics"] = [m for m in item.get("metrics", STADIUM_BLEACHER_METRICS) if m in STADIUM_BLEACHER_METRICS]

    return stadiumBleachers



##
# @brief Retourne les mesures des capteurs installés dans une tribune.
#
# @param stadiumBleacherId Identifiant de la tribune.
#
# @return list Mesures parmi "acoustic", "accelerometer", "temperature" (toutes si la tribune n'est pas déclarée).
##
def getMetricsOfStadiumBleacher(stadiumBleacherId):
    for item in getStadiumBleacherList():
        if item["id"] == stadiumBleacherId:
            return item["metrics"]

    return list(STADIUM_BLEACHER_METRICS)



##
# @brief Enregistre les mesures des capteurs de chaque tribune dans stadiumBleacher.json (les autres champs sont conservés).
#
# @param metrics Dictionnaire {identifiant de tribune: liste de mesures}.
#
# @throws RuntimeError Si le fichier ne peut pas être écrit.
##
def saveStadiumBleacherMetrics(metrics):
    filePath = Config.PATH["data"] + "stadiumBleacher.json"
    stadiumBleachers = _loadStadiumBleacherFile()

    for item in stadiumBleachers:
        if item["id"] in metrics:
            item["metrics"] = [m for m in STADIUM_BLEACHER_METRICS if m in metrics[item["id"]]]

    try:
        # Écriture dans un fichier temporaire puis remplacement : pas de fichier à moitié écrit
        temporaryPath = filePath + ".tmp"
        with open(temporaryPath, "w") as file:
            json.dump(stadiumBleachers, file, ensure_ascii=False, indent=4)
            file.write("\n")
        os.replace(temporaryPath, filePath)
    except OSError as e:
        message = f"[Data] Écriture impossible du fichier tribunes du stade : '{filePath}'"
        logger.error(message)
        raise RuntimeError(message) from e

    logger.info(f"[Data] Mesures des tribunes enregistrées : {metrics}")

    return



##
# @brief Retourne l'identifiant d'une tribune d'après son nom (stadiumBleacher.json).
#
# @param name Nom de la tribune (ex : "Nord-Est").
#
# @return int|None Identifiant de la tribune, None si aucune ne porte ce nom.
##
def getStadiumBleacherIdByName(name):
    for item in _loadStadiumBleacherFile():
        if item["name"] == name:
            return item["id"]

    return None

# =============================================================================
#  Lecture du fichier tracker.json
# =============================================================================

##
# @brief Charge et retourne le contenu du fichier tracker.json.
#
# @return list Liste de dictionnaires représentant les trackers.
#
# @throws RuntimeError Si le fichier est absent ou malformé.
##
def _loadTrackerFile():
    filePath = Config.PATH["data"] + "tracker.json"

    try:
        logger.info(f"[Data] Lecture du fichier des trackers : '{filePath}'")

        with open(filePath, "r") as file:
            return json.load(file)

    except FileNotFoundError:
        message = f"[Data] Fichier des trackers introuvable : '{filePath}'"
        logger.error(message)
        raise RuntimeError(message)

    except json.JSONDecodeError as e:
        message = f"[Data] Fichier des trackers invalide (JSON malformé) : '{filePath}'"
        logger.error(message)
        raise RuntimeError(message) from e

    return



##
# @brief Retourne la valeur d'un champ donné pour le tracker identifié.
#
# @param trackerId Identifiant du tracker recherché.
# @param field     Nom du champ à retourner.
#
# @return Valeur du champ pour le tracker correspondant.
#
# @throws RuntimeError Si aucun tracker ne correspond à l'identifiant.
##
def _getTrackerField(trackerId, field):
    trackers = _loadTrackerFile()

    for item in trackers:
        if item["id"] == trackerId:
            return item[field]

    message = f"[Data] Aucun tracker trouvé avec l'id '{trackerId}'"
    logger.error(message)
    raise RuntimeError(message)

    return

# =============================================================================
#  Accesseurs publics
# =============================================================================

##
# @brief Retourne le nom du supporter correspondant à l'identifiant donné.
#
# @param supporterId Identifiant numérique du supporter.
#
# @return str Nom du supporter.
#
# @throws RuntimeError Si aucun supporter ne correspond à l'identifiant.
##
def getNameOfSupporter(supporterId):
    return _getSupporterField(supporterId, "name")



##
# @brief Retourne la couleur du supporter correspondant à l'identifiant donné.
#
# @param supporterId Identifiant numérique du supporter.
#
# @return str Couleur du supporter.
#
# @throws RuntimeError Si aucun supporter ne correspond à l'identifiant.
##
def getColorOfSupporter(supporterId):
    return _getSupporterField(supporterId, "color")



##
# @brief Retourne le nom de la tribune correspondant à l'identifiant donné.
#
# @param stadiumBleacherId Identifiant numérique de la tribune.
#
# @return str Nom de la tribune.
#
# @throws RuntimeError Si aucune tribune ne correspond à l'identifiant.
##
def getNameOfStadiumBleacher(stadiumBleacherId):
    return _getStadiumBleacherField(stadiumBleacherId, "name")



##
# @brief Retourne la couleur de la tribune correspondant à l'identifiant donné.
#
# @param stadiumBleacher Identifiant numérique de la tribune.
#
# @return str Couleur de la tribune.
#
# @throws RuntimeError Si aucune tribune ne correspond à l'identifiant.
##
def getColorOfStadiumBleacher(stadiumBleacherId):
    return _getStadiumBleacherField(stadiumBleacherId, "color")



##
# @brief Retourne le nom du tracker correspondant à l'identifiant donné.
#
# @param trackerId Identifiant numérique du tracker.
#
# @return str Nom du tracker.
#
# @throws RuntimeError Si aucun tracker ne correspond à l'identifiant.
##
def getNameOfTracker(trackerId):
    return _getTrackerField(trackerId, "name")



##
# @brief Retourne la couleur du tracker correspondant à l'identifiant donné.
#
# @param trackerId Identifiant numérique du tracker.
#
# @return str Couleur du tracker.
#
# @throws RuntimeError Si aucun tracker ne correspond à l'identifiant.
##
def getColorOfTracker(trackerId):
    return _getTrackerField(trackerId, "color")



##
# @brief Retourne la zone du tracker correspondant à l'identifiant donné.
#
# @param trackerId Identifiant numérique du tracker.
#
# @return List Zone du tracker.
#
# @throws RuntimeError Si aucun tracker ne correspond à l'identifiant.
##
def getZoneOfTracker(trackerId):
    return _getTrackerField(trackerId, "zone")




# =============================================================================
#  Formatage pour le client web
# =============================================================================

##
# @brief Construit le dictionnaire de données envoyé au client web via SocketIO.
#
# @param supporterId Identifiant du supporter.
# @param name        Nom du supporter.
# @param color       Couleur associée au supporter.
# @param heartRate   Dernière fréquence cardiaque en bpm.
#
# @return dict Données formatées pour le client. Format : { "id": …, "name": …, "color": …, "heartRate": … }
##
def createSupporterHeartRateForClient(supporterId, name, color, heartRate):
    return {
        "id":        supporterId,
        "name":      name,
        "color":     color,
        "heartRate": heartRate,
    }



##
# @brief Construit le dictionnaire de données envoyé au client web via SocketIO.
#
# @param stadiumBleacherId Identifiant de la tribune.
# @param name              Nom de la tribune.
# @param color             Couleur associée à la tribune.
# @param accelerometer     Dernière mesure de l'accéléromètre.
#
# @return dict Données formatées pour le client. Format : { "id": …, "name": …, "color": …, "accelerometer": … }
##
def createStadiumBleacherAccelerometerForClient(stadiumBleacherId, name, color, accelerometer):
    return {
        "id":        stadiumBleacherId,
        "name":      name,
        "color":     color,
        "accelerometer": accelerometer,
    }



##
# @brief Construit le dictionnaire de données envoyé au client web via SocketIO.
#
# @param stadiumBleacherId Identifiant de la tribune.
# @param name              Nom de la tribune.
# @param color             Couleur associée à la tribune.
# @param acoustic           Dernière mesure acoustic.
#
# @return dict Données formatées pour le client. Format : { "id": …, "name": …, "color": …, "acoustic": … }
##
def createStadiumBleacherAcousticForClient(stadiumBleacherId, name, color, acoustic):
    return {
        "id":        stadiumBleacherId,
        "name":      name,
        "color":     color,
        "acoustic":  acoustic,
    }



##
# @brief Construit le dictionnaire de données de température envoyé au client web via SocketIO.
#
# @param stadiumBleacherId Identifiant de la tribune.
# @param name              Nom de la tribune.
# @param color             Couleur associée à la tribune.
# @param temperature       Dernier envoi de température.
#
# @return dict Données formatées pour le client. Format : { "id": …, "name": …, "color": …, "temperature": … }
##
def createStadiumBleacherTemperatureForClient(stadiumBleacherId, name, color, temperature):
    return {
        "id":          stadiumBleacherId,
        "name":        name,
        "color":       color,
        "temperature": temperature,
    }



##
# @brief Créer un message système formaté.
#
# @param data Dictionnaire de données reçu depuis le broker MQTT.
#
# @return Le message système formaté.
##
def makeMessageSystem(data):
    match data.get('t'):
        case "PolarH10":
            messageSystem = f"Capteur: {data.get('n')} du supporter n°{data.get('id')} - "
            messageSystem += f"Niveau de batterie du capteur: {data.get('bl')}% - "
            messageSystem += f"Location du capteur sur le corps: {data.get('bsl')}"
        case _:
            messageSystem = f"Pas de message formater pour ce type de capteur: {data}"

    return messageSystem



##
# @brief Construit le dictionnaire de données envoyé au client web via SocketIO.
#
# @param trackerId Identifiant du tracker.
# @param name      Nom du tracker.
# @param color     Couleur associée au tracker.
# @param position  Nouvelle mesure de la position.
#
# @return dict Données formatées pour le client. Format : { "id": …, "name": …, "color": …, "position": … }
##
def createTrackerPositionForClient(trackerId, name, color, position):
    return {
        "id":        trackerId,
        "name":      name,
        "color":     color,
        "position":  position,
    }
