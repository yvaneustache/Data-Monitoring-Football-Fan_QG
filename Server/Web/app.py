##
# @file app.py
#
# @brief Point d'entrée principal de l'interface web.
#
# Initialise l'application Flask, la WebSocket SocketIO et le client MQTT, puis démarre le serveur. Les messages MQTT reçus créent ou mettent à jour les supporters et poussent les données aux clients web en temps réel.
##

# =============================================================================
#  Import des bibliothèques
# =============================================================================

import json
from flask import Flask
from flask_socketio import SocketIO

from Server.Config.setting import Config
from Server.Core.Supporter.supporter import Supporter
from Server.Core.StadiumBleacher.stadiumBleacher import StadiumBleacher
from Server.Core.Tracker.tracker import Tracker
from Server.Utils.display import printBanner
from Server.Utils.data import createSupporterHeartRateForClient, getNameOfSupporter, getColorOfSupporter, createStadiumBleacherAccelerometerForClient, createStadiumBleacherAcousticForClient, getNameOfStadiumBleacher, getColorOfStadiumBleacher, makeMessageSystem, createTrackerPositionForClient, getNameOfTracker, getColorOfTracker, getZoneOfTracker
from Server.Core.mqtt import MQTTClientWrapper
from Server.Core.postgresql import PostgreSQLClientWrapper
from Server.Web.routes import registerRoutes
from Server.Web.socketioHandlers import registerSocketioHandlers
from Server.Utils.logger import Logger

# =============================================================================
#  Création du logger
# =============================================================================

logger = Logger("Serveur/App")

# =============================================================================
#  Variables globales
# =============================================================================

supporterList = []       ##< @brief Liste des supporters actifs, alimentée par les messages MQTT.
stadiumBleacherList = [] ##< @brief Liste des tribunes du stade actives, alimentée par les messages MQTT.
trackerList = []         ##< @brief Liste des trackers actifs.
socketio = None          ##< @brief Instance SocketIO partagée entre main() et les callbacks MQTT.

# =============================================================================
#  Programme principal
# =============================================================================

##
# @brief Initialise et démarre l'interface web.
#
# @throws RuntimeError Si le démarrage du serveur SocketIO échoue.
##
def main():
    global socketio

    printBanner("   Interface Web")

    if Config.DEBUG:
        print("\nInterface Web:")
        print(f"   Host: {Config.WEB_HOST}")
        print(f"   Port: {Config.WEB_PORT}")
        print()

    app      = _createFlaskApp()
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

    # Connexion au broker MQTT
    mqttClient = MQTTClientWrapper("interface web", Config.MQTT_BROKER_HOST, Config.MQTT_BROKER_PORT, Config.MQTT_BROKER_KEEPALIVE, qos=Config.MQTT_BROKER_QOS, onMessageCallback=_onMqttMessage)
    # Connexion à la base de données PostgreSQL
    postgresqlClient = PostgreSQLClientWrapper(Config.POSTGRESQL_HOST, Config.POSTGRESQL_PORT, Config.POSTGRESQL_DATABASE, Config.POSTGRESQL_USER, Config.POSTGRESQL_PASSWORD)

    registerRoutes(app, supporterList, stadiumBleacherList, trackerList, postgresqlClient)
    registerSocketioHandlers(socketio, supporterList, stadiumBleacherList, trackerList, postgresqlClient)

    mqttClient.connect()
    mqttClient.subscribe(Config.MQTT_BROKER_TOPICS_DATA)

    postgresqlClient.connect()
    postgresqlClient.initDatabaseFromFile(Config.POSTGRESQL_DATABASE_FILE)

    # Mode non bloquant: socketio.run() prend ensuite la main
    mqttClient.start(blocking=False)

    try:
        socketio.run(app, host=Config.WEB_HOST, port=Config.WEB_PORT, use_reloader=False, allow_unsafe_werkzeug=True)

    except Exception as e:
        message = "[APP] Erreur lors du démarrage du serveur SocketIO"
        logger.error(message)
        raise RuntimeError(message) from e

    finally:
        # Notification de fermeture aux clients web avant l'arrêt
        socketio.emit("serverClose")

        if mqttClient.isConnected():
            mqttClient.stop()
        if postgresql.isConnected():
            postgresqlClient.close()

    return

# =============================================================================
#  Callback MQTT
# =============================================================================

##
# @brief Crée le supporter s'il n'existe pas encore dans supporterList, puis enregistre la nouvelle mesure et notifie les clients web. Appelé à chaque message reçu depuis le broker MQTT.
#
# @param message Message paho-mqtt reçu (topic, payload, qos, retain).
##
def _onMqttMessage(message):
    logger.info(f"[APP] Message MQTT brut reçu : {message}")

    data = json.loads(message.payload.decode())

    logger.info(f"[APP] Données décodées : {data}")

    topic = message.topic.split("/")
    dataType = topic[1]
    idf = int(topic[2])

    if dataType == "heart_rate":
        if not _supporterExists(idf):
            _createSupporter(idf, dataType)
        _addSupporterHeartRate(idf, data)
    elif dataType == "accelerometer_gyroscope":
        if not _stadiumBleacherExists(idf):
            _createStadiumBleacher(idf, dataType)
        _addStadiumBleacherAccelerometer(idf, data)
    elif dataType == "acoustic":
        if not _stadiumBleacherExists(idf):
            _createStadiumBleacher(idf, dataType)
        _addStadiumBleacherAcoustic(idf, data)
    elif dataType == "system":
        socketio.emit("newSystemInfo", makeMessageSystem(data))
    elif dataType == "tracker":
        if not _trackerExists(idf):
            _createTracker(idf)
        _addTrackerPosition(idf, data)
    else:
        logger.warning(f"[APP] Topic MQTT non reconnu : {message.topic}")

    return

# =============================================================================
#  Initialisation Flask
# =============================================================================

##
# @brief Crée et configure l'instance Flask.
#
# @return Flask Instance Flask configurée.
##
def _createFlaskApp():
    logger.info("[APP] Création de l'application Flask")

    app = Flask(__name__)
    app.config["SECRET_KEY"]            = Config.SECRET_KEY
    app.config["DEBUG"]                 = Config.DEBUG
    app.config["JSON_SORT_KEYS"]        = False
    app.config["TEMPLATES_AUTO_RELOAD"] = Config.DEBUG

    return app


# =============================================================================
#  Gestion des supporters
# =============================================================================

##
# @brief Indique si un Supporter avec cet identifiant est déjà présent dans supporterList.
#
# @param supporterId Identifiant du supporter recherché.
#
# @return bool True si le supporter existe.
# @return bool False sinon.
##
def _supporterExists(supporterId):
    for supporter in supporterList:
        if supporter.getId() == supporterId:
            return True
    return False



##
# @brief Crée un nouveau Supporter, l'ajoute à supporterList et notifie les clients web de sa connexion via SocketIO.
#
# @param supporterId Identifiant du nouveau supporter.
# @param topic       Topic MQTT
##
def _createSupporter(supporterId, topic):
    global socketio

    logger.info(f"[APP] Nouveau supporter détecté (id={supporterId})")

    name  = getNameOfSupporter(supporterId)
    color = getColorOfSupporter(supporterId)

    supporterList.append(Supporter(supporterId, name))

    if topic == "heart_rate":
        # heartRate=None: valeur initiale avant la première mesure
        payload = createSupporterHeartRateForClient(supporterId, name, color, None)
    else:
        logger.warning(f"[APP] Topic MQTT inconnu (topic={topic})")
        return
    
    socketio.emit("supporterConnection", payload)

    return



##
# @brief Enregistre une nouvelle mesure pour le supporter correspondant et pousse la mise à jour aux clients web via SocketIO.
#
# @param supporterId Identifiant du nouveau supporter.
# @param data        Dictionnaire de données reçu depuis le broker MQTT.
##
def _addSupporterHeartRate(supporterId, data):
    name        = getNameOfSupporter(supporterId)
    color       = getColorOfSupporter(supporterId)

    for supporter in supporterList:
        if supporter.getId() == supporterId:
            points = supporter.addData(data, "heart_rate")

            payload = createSupporterHeartRateForClient(supporter.getId(), name, color, data["hr"])
            payload.update({
                "average": supporter.heartRate.getAverage(),
                "minimum": supporter.heartRate.getMinimum(),
                "maximum": supporter.heartRate.getMaximum(),
                "points":  points,
            })

            socketio.emit("newSupporterHeartRate", payload)
            return

    logger.warning(f"[APP] Données reçues pour un supporter inconnu (id={supporterId}), message ignoré")

    return

# =============================================================================
#  Gestion des tribunes du stade
# =============================================================================

##
# @brief Indique si un StadiumBleacher avec cet identifiant est déjà présent dans stadiumBleacherList.
#
# @param stadiumeBleacherId Identifiant de la tribune recherché.
#
# @return bool True si la tribune existe.
# @return bool False sinon.
##
def _stadiumBleacherExists(stadiumBleacherId):
    for stadiumBleacher in stadiumBleacherList:
        if stadiumBleacher.getId() == stadiumBleacherId:
            return True
    return False




##
# @brief Crée un nouveau StadiumBleacher, l'ajoute à stadiumBleacherList et notifie les clients web de sa connexion via SocketIO.
#
# @param stadiumBleacher Identifiant de la nouvelle tribune.
# @param topic           Topic MQTT.
##
def _createStadiumBleacher(stadiumBleacherId, topic):
    global socketio

    logger.info(f"[APP] Nouvelle tribune détecté (id={stadiumBleacherId})")

    name  = getNameOfStadiumBleacher(stadiumBleacherId)
    color = getColorOfStadiumBleacher(stadiumBleacherId)

    stadiumBleacherList.append(StadiumBleacher(stadiumBleacherId, name))

    if topic == "accelerometer_gyroscope":
        # accelerometer=None: valeur initiale avant la première mesure
        payload = createStadiumBleacherAccelerometerForClient(stadiumBleacherId, name, color, None)
    elif topic == "acoustic":
        # acoustic=None: valeur initiale avant la première mesure
        payload = createStadiumBleacherAcousticForClient(stadiumBleacherId, name, color, None)
    else:
        logger.warning(f"[APP] Topic MQTT inconnu (topic={topic})")
        return

    socketio.emit("stadiumBleacherConnection", payload)

    return



##
# @brief Enregistre une nouvelle mesure pour la tribune correspondant et pousse la mise à jour aux clients web via SocketIO.
#
# @param stadiumBleacherId Identifiant de la nouvelle tribune.
# @param data              Dictionnaire de données reçu depuis le broker MQTT.
##
def _addStadiumBleacherAccelerometer(stadiumBleacherId, data):
    name              = getNameOfStadiumBleacher(stadiumBleacherId)
    color             = getColorOfStadiumBleacher(stadiumBleacherId)

    for stadiumBleacher in stadiumBleacherList:
        if stadiumBleacher.getId() == stadiumBleacherId:
            points = stadiumBleacher.addData(data, "accelerometer_gyroscope")

            payload = createStadiumBleacherAccelerometerForClient(stadiumBleacher.getId(), name, color, data["a"])
            payload.update({
                "average": stadiumBleacher.accelerometer.getAverage(),
                "minimum": stadiumBleacher.accelerometer.getMinimum(),
                "maximum": stadiumBleacher.accelerometer.getMaximum(),
                "points":  points,
            })

            socketio.emit("newStadiumBleacherAccelerometer", payload)
            return

    logger.warning(f"[APP] Données reçues pour une tribune inconnu (id={stadiumBleacherId}), message ignoré")

    return



##
# @brief Enregistre une nouvelle mesure pour la tribune correspondant et pousse la mise à jour aux clients web via SocketIO.
#
# @param stadiumBleacherId Identifiant de la nouvelle tribune.
# @param data Dictionnaire de données reçu depuis le broker MQTT.
##
def _addStadiumBleacherAcoustic(stadiumBleacherId, data):
    name              = getNameOfStadiumBleacher(stadiumBleacherId)
    color             = getColorOfStadiumBleacher(stadiumBleacherId)

    for stadiumBleacher in stadiumBleacherList:
        if stadiumBleacher.getId() == stadiumBleacherId:
            points = stadiumBleacher.addData(data, "acoustic")

            payload = createStadiumBleacherAcousticForClient(stadiumBleacher.getId(), name, color, data["a"])
            payload.update({
                "average": stadiumBleacher.acoustic.getAverage(),
                "minimum": stadiumBleacher.acoustic.getMinimum(),
                "maximum": stadiumBleacher.acoustic.getMaximum(),
                "points":  points,
            })
            socketio.emit("newStadiumBleacherAcoustic", payload)
            return

    logger.warning(f"[APP] Données reçues pour une tribune inconnu (id={stadiumBleacherId}), message ignoré")

    return

# =============================================================================
#  Gestion des trackers
# =============================================================================

##
# @brief Indique si un Tracker avec cet identifiant est déjà présent dans trackerList.
#
# @param trackerId Identifiant du tracker recherché.
#
# @return bool True si le tracker existe.
# @return bool False sinon.
##
def _trackerExists(trackerId):
    for tracker in trackerList:
        if tracker.getId() == trackerId:
            return True
    return False



##
# @brief Crée un nouveau Tracker, l'ajoute à trackerList et notifie les clients web de sa connexion via SocketIO.
#
# @param trackerId Identifiant du nouveau tracker.
##
def _createTracker(trackerId):
    global socketio

    logger.info(f"[APP] Nouveau tracker détecté (id={trackerId})")

    name  = getNameOfTracker(trackerId)
    color = getColorOfTracker(trackerId)
    zone  = getZoneOfTracker(trackerId)

    trackerList.append(Tracker(trackerId, name, zone))

    # position=None: valeur initiale avant la première mesure
    payload = createTrackerPositionForClient(trackerId, name, color, None)

    socketio.emit("trackerConnection", payload)

    return



##
# @brief Enregistre une nouvelle mesure pour le tracker correspondant et pousse la mise à jour aux clients web via SocketIO.
#
# @param tarckerId Identifiant du nouveau tracker.
# @param data      Dictionnaire de données reçu depuis le broker MQTT.
##
def _addTrackerPosition(trackerId, data):
    name  = getNameOfTracker(trackerId)
    color = getColorOfTracker(trackerId)
    zone  = getZoneOfTracker(trackerId)

    for tracker in trackerList:
        if tracker.getId() == trackerId:
            tracker.addPosition((data["p"][-1]["x"], data["p"][-1]["y"]))

            payload = createTrackerPositionForClient(tracker.getId(), name, color, tracker.getPosition())
            payload.update({
                "zone": zone,
                "lastPositions": tracker.getLastPositions(),
            })

            socketio.emit("newTrackerPosition", payload)
            return

    logger.warning(f"[APP] Données reçues pour un tracker inconnu (id={trackerId}), message ignoré")

    return

# =============================================================================
#  Point d'entrée
# =============================================================================

if __name__ == "__main__":
    main()
