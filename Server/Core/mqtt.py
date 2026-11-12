##
# @file mqtt.py
#
# @brief Déclaration et implémentation de la classe MQTTClientWrapper.
#
# Fournit une abstraction haut niveau du client paho-mqtt pour publier des messages et s'abonner à des topics sur un broker MQTT, avec gestion de l'état de connexion et réabonnement automatique après reconnexion.
##

# =============================================================================
#  Import des bibliothèques
# =============================================================================

import paho.mqtt.client as mqtt

from Server.Utils.state import ConnectionState
from Server.Config.setting import Config
from Server.Core.exception import ConnectionFailError, NotConnectionError
from Server.Utils.logger import Logger

# =============================================================================
#  Création du logger
# =============================================================================

logger = Logger("Serveur/MQTT")

# =============================================================================
#  Client MQTT
# =============================================================================

##
# @class MQTTClientWrapper
#
# @brief Gestionnaire de connexion MQTT basé sur paho-mqtt.
##
class MQTTClientWrapper:

# =============================================================================
#  Constructeur
# =============================================================================

    ##
    # @brief Construit un gestionnaire MQTT avec les paramètres de connexion et les callbacks utilisateur optionnels.
    #
    # @param clientId             Identifiant unique du client MQTT.
    # @param host                 Hôte du broker MQTT.
    # @param port                 Port du broker MQTT.
    # @param keepalive            Intervalle de keep-alive en secondes.
    # @param qos                  Niveau de qualité de service (default : 0).
    # @param onMessageCallback    Appelé à chaque message reçu (default : None).
    # @param onConnectCallback    Appelé à la connexion (default : None).
    # @param onDisconnectCallback Appelé à la déconnexion (default : None).
    # @param autoReconnect        Réabonne automatiquement aux topics après reconnexion (default : True).
    ##
    def __init__(self, clientId, host, port, keepalive, qos=0,
                 onMessageCallback=None, onConnectCallback=None,
                 onDisconnectCallback=None, autoReconnect=True):
        self.clientId     = clientId       ##< @brief Identifiant unique du client MQTT.
        self.host         = host           ##< @brief Hôte du broker MQTT.
        self.port         = port           ##< @brief Port du broker MQTT.
        self.keepalive    = keepalive      ##< @brief Intervalle de keep-alive en secondes.
        self.qos          = qos            ##< @brief Niveau de qualité de service (0, 1 ou 2).
        self.autoReconnect = autoReconnect ##< @brief Active le réabonnement automatique après reconnexion.

        self.userOnMessage    = onMessageCallback    ##< @brief Callback utilisateur appelé à la réception d'un message.
        self.userOnConnect    = onConnectCallback    ##< @brief Callback utilisateur appelé à la connexion.
        self.userOnDisconnect = onDisconnectCallback ##< @brief Callback utilisateur appelé à la déconnexion.

        self.client           = None                         ##< @brief Instance paho-mqtt, initialisée dans connect().
        self.subscribedTopics = []                           ##< @brief Liste des topics souscrits, mémorisés pour le réabonnement automatique.
        self.state            = ConnectionState.DISCONNECTED ##< @brief État courant de la connexion.

        return

# =============================================================================
#  Connexion
# =============================================================================

    ##
    # @brief Crée le client paho-mqtt et établit la connexion au broker.
    #
    # @throws ConnectionFailError Si la connexion au broker échoue.
    ##
    def connect(self):
        logger.info(f"[MQTT] Connexion au broker {self.host}:{self.port}")

        self.state = ConnectionState.CONNECTING

        try:
            self.client = mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION2,
                client_id=self.clientId,
                clean_session=True
            )

            # Branchement des callbacks internes
            self.client.on_connect    = self._onConnect
            self.client.on_message    = self._onMessage
            self.client.on_disconnect = self._onDisconnect

            self.client.connect(self.host, self.port, self.keepalive)

            self.state = ConnectionState.CONNECTED

        except Exception as e:
            self.state = ConnectionState.ERROR
            logger.error(f"Échec de connexion à 'MQTT' [{self.host}:{self.port}]")
            raise ConnectionFailError("MQTT", self.host, self.port) from e

        return

# =============================================================================
#  Callbacks internes
# =============================================================================

    ##
    # @brief Callback interne appelé par paho-mqtt lors de l'établissement de la connexion au broker.
    #
    # @param client     Instance paho-mqtt.
    # @param userdata   Données utilisateur.
    # @param flags      Flags de connexion.
    # @param rc         Code de retour de connexion.
    # @param properties Propriétés MQTT v5 (default : None).
    ##
    def _onConnect(self, client, userdata, flags, rc, properties=None):
        logger.info(f"[MQTT] Connexion établie avec le broker (rc={rc})")

        if rc == 0:
            # Connexion (ou reconnexion automatique de paho) établie : les publications sont de nouveau possibles
            self.state = ConnectionState.CONNECTED

            # Réabonnement automatique aux topics mémorisés après reconnexion
            if self.autoReconnect and self.subscribedTopics:
                for topic in self.subscribedTopics:
                    self.client.subscribe(topic, qos=self.qos)
                    logger.info(f"[MQTT] Réabonnement automatique au topic '{topic}'")

            if self.userOnConnect:
                try:
                    self.userOnConnect(client, userdata, flags, rc)
                except Exception as e:
                    logger.warning(f"[MQTT] Erreur dans le callback onConnect utilisateur : {e}")
        else:
            self.state = ConnectionState.ERROR
            logger.info(f"[MQTT] Échec de connexion au broker (rc={rc})")

        return



    ##
    # @brief Callback interne appelé par paho-mqtt lors de la déconnexion du broker.
    #
    # @param client           Instance paho-mqtt.
    # @param userdata         Données utilisateur.
    # @param disconnect_flags Flags de déconnexion.
    # @param rc               Code de retour.
    # @param properties       Propriétés MQTT v5 (default = None).
    ##
    def _onDisconnect(self, client, userdata, disconnect_flags, rc, properties=None):
        logger.info(f"[MQTT] Déconnexion du broker (rc={rc})")

        if rc == 0:
            self.state = ConnectionState.DISCONNECTED
        else:
            # Déconnexion inattendue : la boucle réseau de paho (loop_start / loop_forever) se reconnecte seule,
            # _onConnect() rétablit alors l'état CONNECTED
            self.state = ConnectionState.RECONNECTING
            logger.info("[MQTT] Déconnexion inattendue, reconnexion automatique en cours")

        if self.userOnDisconnect:
            try:
                self.userOnDisconnect(client, userdata, rc)
            except Exception as e:
                logger.warning(f"[MQTT] Erreur dans le callback onDisconnect utilisateur : {e}")

        return



    ##
    # @brief Callback interne appelé par paho-mqtt à la réception d'un message sur un topic souscrit.
    #
    # @param client   Instance paho-mqtt.
    # @param userdata Données utilisateur.
    # @param message  Message reçu.
    ##
    def _onMessage(self, client, userdata, message):
        logger.info(f"[MQTT] Message reçu sur le topic '{message.topic}'")

        if self.userOnMessage:
            try:
                self.userOnMessage(message)
            except Exception as e:
                logger.warning(f"[MQTT] Erreur dans le callback onMessage utilisateur : {e}")

        return

# =============================================================================
#  Abonnement aux topics
# =============================================================================

    ##
    # @brief Abonne le client à une liste de topics et les mémorise pour le réabonnement automatique après reconnexion.
    #
    # @param topics Liste de chaînes représentant les topics MQTT.
    #
    # @throws NotConnectionError Si le client n'est pas connecté.
    # @throws RuntimeError       Si l'abonnement à un topic échoue.
    ##
    def subscribe(self, topics):
        if not self.isConnected():
            logger.error("Opération impossible : la connexion à 'MQTT' n'est pas établie")
            raise NotConnectionError("MQTT")

        for topic in topics:
            logger.info(f"[MQTT] Abonnement au topic '{topic}'")

            result, _ = self.client.subscribe(topic, qos=self.qos)

            if result == mqtt.MQTT_ERR_SUCCESS:
                if topic not in self.subscribedTopics:
                    self.subscribedTopics.append(topic)
            else:
                message = f"[MQTT] Échec de l'abonnement au topic '{topic}' (code={result})"
                logger.error(message);
                raise RuntimeError(message)

        return



    ##
    # @brief Désabonne le client des topics spécifiés et les retire de la liste mémorisée.
    #
    # @param topics Liste de chaînes représentant les topics MQTT.
    #
    # @throws NotConnectionError Si le client n'est pas connecté.
    ##
    def unsubscribe(self, topics):
        if not self.isConnected():
            logger.error("Opération impossible : la connexion à 'MQTT' n'est pas établie")
            raise NotConnectionError("MQTT")

        for topic in topics:
            logger.info(f"[MQTT] Désabonnement du topic '{topic}'")

            self.client.unsubscribe(topic)

            if topic in self.subscribedTopics:
                self.subscribedTopics.remove(topic)

        return

# =============================================================================
#  Publication
# =============================================================================

    ##
    # @brief Publie un message sur le topic spécifié.
    #
    # @param topic   Topic MQTT cible.
    # @param payload Contenu du message.
    # @param retain  Si True, le broker conserve le dernier message publié.
    #
    # @return bool True si la publication a réussi.
    # @return bool False sinon.
    #
    # @throws NotConnectionError Si le client n'est pas connecté.
    # @throws RuntimeError       Si la publication échoue.
    ##
    def publish(self, topic, payload, retain=False):
        if not self.isConnected():
            logger.error("Opération impossible : la connexion à 'MQTT' n'est pas établie")
            raise NotConnectionError("MQTT")

        try:
            logger.info(f"[MQTT] Publication sur le topic '{topic}'")

            result = self.client.publish(topic, payload, qos=self.qos, retain=retain)
            return result.rc == mqtt.MQTT_ERR_SUCCESS

        except Exception as e:
            message = f"[MQTT] Échec de la publication sur le topic '{topic}' : {e}"
            logger.error(message)
            raise RuntimeError(message) from e

        return False

# =============================================================================
#  Boucle réseau
# =============================================================================

    ##
    # @brief Démarre la boucle réseau paho-mqtt.
    #
    # @param blocking True bloque le thread courant. False tourne dans un thread séparé (default : True).
    #
    # @throws NotConnectionError Si le client n'est pas connecté.
    ##
    def start(self, blocking=True):
        logger.info(f"[MQTT] Démarrage de la boucle réseau (blocking={blocking})")

        if not self.isConnected():
            logger.error("Opération impossible : la connexion à 'MQTT' n'est pas établie")
            raise NotConnectionError("MQTT")

        if blocking:
            self.client.loop_forever()
        else:
            self.client.loop_start()

        return



    ##
    # @brief Arrête la boucle réseau et se déconnecte proprement du broker.
    ##
    def stop(self):
        logger.info("[MQTT] Arrêt de la boucle réseau et déconnexion")

        if self.isConnected():
            self.client.loop_stop()
            self.client.disconnect()
            self.state = ConnectionState.DISCONNECTED

        return

# =============================================================================
#  État
# =============================================================================

    ##
    # @brief Indique si le client est actuellement connecté au broker.
    #
    # @return bool True si l'état est CONNECTED.*
    # @return bool False sinon.
    ##
    def isConnected(self):
        return self.state == ConnectionState.CONNECTED
