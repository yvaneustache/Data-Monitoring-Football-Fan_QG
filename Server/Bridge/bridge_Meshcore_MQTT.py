##
# @file bridge_Meshcore_MQTT.py
#
# @brief Point d'entrée du bridge Meshcore vers MQTT.
#
# Reçoit les paquets du noeud Meshcore, décode leur payload et publie les données sur le topic MQTT approprié selon le type de données.
##

# =============================================================================
#  Import des bibliothèques
# =============================================================================

import json

from Server.Config.setting import Config
from Server.Core.meshcore import MeshcoreClientWrapper
from Server.Core.mqtt import MQTTClientWrapper
from Server.Utils.display import printBanner
from Server.Utils.topic import getMQTTTopic
from Server.Utils.logger import Logger

# =============================================================================
#  Création du logger
# =============================================================================

logger = Logger("Serveur/Bridge_Meshcore-MQTT")

# =============================================================================
#  Variable globale
# =============================================================================

mqttClient = None ##< @brief Client MQTT partagé entre main() et le callback _onReceive().

# =============================================================================
#  Programme principal
# =============================================================================

##
# @brief Initialise le bridge Meshcore vers MQTT et démarre la boucle d'attente de paquets.
##
def main():
    global mqttClient

    printBanner("   Bridge Meshcore → MQTT")

    if Config.DEBUG:
        print("\nMQTT")
        print(f"   Host      : {Config.MQTT_BROKER_HOST}")
        print(f"   Port      : {Config.MQTT_BROKER_PORT}")
        print(f"   KeepAlive : {Config.MQTT_BROKER_KEEPALIVE}")
        print(f"   QoS       : {Config.MQTT_BROKER_QOS}")

    meshcoreClient = MeshcoreClientWrapper(onReceiveCallback=_onReceive)

    # Identifiant propre à ce bridge : deux clients MQTT de même identifiant se déconnectent mutuellement
    mqttClient = MQTTClientWrapper("bridge_Meshcore_MQTT", Config.MQTT_BROKER_HOST, Config.MQTT_BROKER_PORT, Config.MQTT_BROKER_KEEPALIVE, qos=Config.MQTT_BROKER_QOS)

    try:
        meshcoreClient.connect()
        mqttClient.connect()

        # MQTT en mode non bloquant pour que waitForever() puisse tourner ensuite
        mqttClient.start(blocking=False)

        meshcoreClient.waitForever()

    except KeyboardInterrupt:
        logger.info("[Bridge Meshcore-MQTT] Arrêt demandé par l'utilisateur (Ctrl+C)")

        meshcoreClient.close()
        mqttClient.stop()

    except Exception as e:
        logger.error(f"Erreur fatale: {e}", exc_info=True)

    return

# =============================================================================
#  Callback Meshcore
# =============================================================================

##
# @brief Décode le payload JSON du paquet Meshcore, determine le topic MQTT correspondant au topic de données et publie le message. Appelé à chaque paquet reçu depuis le noeud Meshcore.
#
# @param packet Paquet Meshcore reçu (dict).
##
def _onReceive(packet):
    global mqttClient

    logger.info(f"[Bridge Meshcore-MQTT] Paquet brut reçu : {packet}")

    try:
        data = json.loads(packet.get("payload", ""))

    except (json.JSONDecodeError, TypeError):
        logger.warning("[Bridge Meshcore-MQTT] Champ 'payload' absent ou non-JSON, paquet ignoré")
        return

    channelIndex = data.get("t")
    topic        = getMQTTTopic(channelIndex, data.get("id"))

    if not mqttClient.publish(topic, json.dumps(data)):
        logger.warning(f"[Bridge Meshcore-MQTT] Échec de la publication sur le topic '{topic}")

    return

# =============================================================================
#  Point d'entrée
# =============================================================================

if __name__ == "__main__":
    main()
