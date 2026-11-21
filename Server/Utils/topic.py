##
# @file topic.py
#
# @brief Gestion des topics MQTT et construction des points InfluxDB.
#
# Fournit getMQTTTopic() pour résoudre le topic MQTT d'un type de données, et buildPointInfluxDB() pour séparer les champs d'un message en tags et fields destinés à InfluxDB.
##

# =============================================================================
#  Import des bibliothèques
# =============================================================================

import json

from Server.Config.setting import Config
from Server.Utils.logger import Logger

# =============================================================================
#  Création du logger
# =============================================================================

logger = Logger("Serveur/Topic")

# =============================================================================
#  Résolution du topic MQTT
# =============================================================================

##
# @brief Retourne le topic MQTT correspondant à un type de données et à un identifiant de supporter.
#
# @param dataType    Type de données.
# @param supporterId Identifiant numérique du supporter.
#
# @return str Topic MQTT résolu.
#
# @throws RuntimeError Si le fichier est absent, invalide ou si le type est inconnu.
##
def getMQTTTopic(dataType, supporterId):
    filePath = Config.PATH["data"] + "topicMQTT.json"

    try:
        logger.info(f"[Topic] Lecture du fichier de topics MQTT : '{filePath}'")

        with open(filePath, "r") as file:
            topicList = json.load(file)

    except FileNotFoundError:
        message = f"[Topic] Fichier de topics MQTT introuvable : '{filePath}'"
        logger.error(message)
        raise RuntimeError(message)

    except json.JSONDecodeError as e:
        message = f"[Topic] Fichier de topics MQTT invalide (JSON malformé) : '{filePath}'"
        logger.error(message)
        raise RuntimeError(message) from e

    for item in topicList:
        if item["code"] == dataType:
            topic = item["topic"] + str(supporterId)

            logger.info(f"[Topic] Topic MQTT résolu : '{topic}' (type='{dataType}', id={supporterId})")

            return topic

    message = f"[Topic] Aucun topic MQTT défini pour le type de données '{dataType}'"
    logger.error(message)
    raise RuntimeError(message)

    return ""

# =============================================================================
#  Construction du point InfluxDB
# =============================================================================

##
# @brief Transforme un JSON en liste de dicts (Les champs simple sont dupliqués et les champs liste génèrent plusieurs points).
#
# @param data Dictionnaire de données.
#
# @return list de dict correspondant aux champs d'un point.
##
def jsonToFieldsPoints(data):
    # Séparer champs simples et champs listes
    scalarFields = {}
    listFields = {}

    for key, value in data.items():
        # On ignore les champs "n" (nom du capteur), "t" (type) et "s" (compteur d'envois)
        if key in ("n", "t", "s"):
            continue

        if isinstance(value, list):
            listFields[key] = value
        else:
            scalarFields[key] = value

    # S'il n'y a pas de liste retourne un seul point
    if not listFields:
        return [scalarFields]

    # On suppose que toutes les listes ont la même longueur
    lengths = [len(v) for v in listFields.values()]
    if len(set(lengths)) != 1:
        raise ValueError("Toutes les listes doivent avoir la même taille")

    result = []
    n = lengths[0]

    for i in range(n):
        point = scalarFields.copy()
        for key, values in listFields.items():
            point[key] = values[i]
        result.append(point)

    return result
