##
# @file bridge_Meshtastic_MQTT.py
#
# @brief Point d'entrée du bridge Meshtastic vers MQTT.
#
# Reçoit les paquets du noeud Meshtastic, décode leur payload JSON et publie les données sur le topic MQTT approprié selon le type de données.
##

# =============================================================================
#  Import des bibliothèques
# =============================================================================

import json

from Server.Config.setting import Config
from Server.Core.meshtastic import MeshtasticClientWrapper
from Server.Core.mqtt import MQTTClientWrapper
from Server.Utils.display import printBanner
from Server.Utils.topic import getMQTTTopic
from Server.Utils.logger import Logger

# =============================================================================
#  Création du logger
# =============================================================================

logger = Logger("Serveur/Bridge_Meshtastic-MQTT")

# =============================================================================
#  Variable globale
# =============================================================================

mqttClient = None ##< @brief Client MQTT partagé entre main() et le callback _onReceive().

# =============================================================================
#  Programme principal
# =============================================================================

##
# @brief Initialise le bridge Meshtastic vers MQTT et démarre la boucle d'attente de paquets.
##
def main():
    global mqttClient

    printBanner("   Bridge Meshtastic → MQTT")

    if Config.DEBUG:
        print("\nMeshtastic:")
        print(f"   Host  : {Config.MESHTASTIC_HOST}")
        print(f"   Topic : {Config.MESHTASTIC_TOPIC}")
        print("\nMQTT:")
        print(f"   Host      : {Config.MQTT_BROKER_HOST}")
        print(f"   Port      : {Config.MQTT_BROKER_PORT}")
        print(f"   KeepAlive : {Config.MQTT_BROKER_KEEPALIVE}")
        print(f"   QoS       : {Config.MQTT_BROKER_QOS}")
        print()

    # Reconnexion automatique : le noeud passerelle peut être branché après le lancement du bridge, et débranché/rebranché
    meshtasticClient = MeshtasticClientWrapper(Config.MESHTASTIC_HOST, Config.MESHTASTIC_TOPIC, onReceiveCallback=_onReceive, autoReconnect=True)

    mqttClient = MQTTClientWrapper("bridge_Meshtastic_MQTT", Config.MQTT_BROKER_HOST, Config.MQTT_BROKER_PORT, Config.MQTT_BROKER_KEEPALIVE, qos=Config.MQTT_BROKER_QOS)

    try:
        mqttClient.connect()

        # MQTT en mode non bloquant pour que waitForever() puisse tourner ensuite
        mqttClient.start(blocking=False)

        # Connexion au noeud Meshtastic dans waitForever(), dès qu'il est branché
        meshtasticClient.waitForever()

    except KeyboardInterrupt:
        logger.info("[Bridge Meshtastic-MQTT] Arrêt demandé par l'utilisateur (Ctrl+C)")

        meshtasticClient.close()
        mqttClient.stop()

    except Exception as e:
        logger.error(f"Erreur fatale: {e}", exc_info=True)

    return

# =============================================================================
#  Callback Meshtastic
# =============================================================================

##
# @brief Décode le payload JSON du champ "text", détermine le topic MQTT correspondant au type de données et publie le message. Appelé à chaque paquet reçu depuis le noeud Meshtastic.
#
# @param packet    Paquet Meshtastic reçu (dict).
# @param interface Interface série source.
##
def _onReceive(packet, interface):
    global mqttClient

    logger.info(f"[Bridge Meshtastic-MQTT] Paquet brut reçu : {packet}")

    # Seuls les paquets décodés avec un champ texte nous intéressent
    if "decoded" not in packet:
        logger.warning("[Bridge Meshtastic-MQTT] Paquet sans champ 'decoded' ignoré")
        return

    try:
        data = json.loads(packet["decoded"].get("text", ""))

    except (json.JSONDecodeError, TypeError):
        logger.warning("[Bridge Meshtastic-MQTT] Champ 'text' absent ou non-JSON, paquet ignoré")
        return

    channelIndex = data.get("t")
    topic        = getMQTTTopic(channelIndex, data.get("id"))

    if not mqttClient.publish(topic, json.dumps(data)):
        logger.warning(f"[Bridge Meshtastic-MQTT] Échec de la publication sur le topic '{topic}'")

    return

# =============================================================================
#  Point d'entrée
# =============================================================================

if __name__ == "__main__":
    main()
