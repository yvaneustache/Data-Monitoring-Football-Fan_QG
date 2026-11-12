##
# @file meshtastic.py
#
# @brief Déclaration et implémentation de la classe MeshtasticClientWrapper.
#
# Fournit une abstraction haut niveau de l'interface série Meshtastic pour détecter automatiquement le port du noeud, établir la connexion et s'abonner aux paquets reçus via le système pubsub.
##

# =============================================================================
#  Import des bibliothèques
# =============================================================================

import time
import glob
import meshtastic
import meshtastic.serial_interface
from pubsub import pub
import serial.tools.list_ports

from Server.Config.setting import Config
from Server.Core.exception import ConnectionFailError, NotConnectionError, PortNotFoundError
from Server.Utils.state import ConnectionState
from Server.Utils.logger import Logger

# =============================================================================
#  Création du logger
# =============================================================================

logger = Logger("Serveur/Meshtastic")

# =============================================================================
#  Client Meshtastic
# =============================================================================

##
# @class MeshtasticClientWrapper
#
# @brief Gestionnaire de connexion à un noeud Meshtastic via port série.
##
class MeshtasticClientWrapper:

# =============================================================================
#  Constructeur
# =============================================================================

    ##
    # @brief Construit un gestionnaire Meshtastic ciblant un noeud donné.
    #
    # @param host              Adresse du noeud Meshtastic.
    # @param topic             Topic pubsub auquel s'abonner.
    # @param onReceiveCallback Callback utilisateur appelé à chaque paquet reçu (default : None).
    # @param autoReconnect     Reconnexion automatique : attente du branchement du noeud et reconnexion après une déconnexion (default : False).
    # @param retryDelay        Délai entre deux tentatives de connexion en secondes, si autoReconnect (default : 5).
    ##
    def __init__(self, host, topic, onReceiveCallback=None, autoReconnect=False, retryDelay=5):
        self.host          = host              ##< @brief Adresse du noeud Meshtastic.
        self.topic         = topic             ##< @brief Topic pubsub d'abonnement.
        self.userOnReceive = onReceiveCallback ##< @brief Callback utilisateur appelé à la réception d'un paquet.
        self.autoReconnect = autoReconnect     ##< @brief Active la reconnexion automatique.
        self.retryDelay    = retryDelay        ##< @brief Délai entre deux tentatives de connexion en secondes.

        self.client = None                         ##< @brief Interface série Meshtastic, initialisée dans connect().
        self.port   = None                         ##< @brief Port série détecté, renseigné dans _findPort().
        self.state  = ConnectionState.DISCONNECTED ##< @brief État courant de la connexion.

        return

# =============================================================================
#  Connexion
# =============================================================================

    ##
    # @brief Détecte le port série du noeud, ouvre la connexion et s'abonne au topic pubsub.
    #
    # @param timeout Durée maximale d'attente de connexion en secondes (défaut : 30).
    #
    # @throws ConnectionFailError Si l'une des étapes de connexion échoue.
    ##
    def connect(self, timeout=30):
        logger.info("[Meshtastic] Connexion au noeud Meshtastic")

        self.state = ConnectionState.CONNECTING

        try:
            self._findPort()

            self.client = meshtastic.serial_interface.SerialInterface(devPath=self.port)

            # Pause nécessaire : le noeud Meshtastic prend ~2s pour s'initialiser
            time.sleep(2)

            self._fetchNodeInfo()

            logger.info(f"[Meshtastic] Abonnement au topic pubsub '{self.topic}'")

            pub.subscribe(self._onReceive, self.topic)
            pub.subscribe(self._onConnectionLost, "meshtastic.connection.lost")

            self.state = ConnectionState.CONNECTED

        except Exception as e:
            self.state = ConnectionState.ERROR
            logger.error(f"Échec de connexion à 'Meshtastic' [{self.host}:{self.port}] : {type(e).__name__} {e}")
            self._closeInterface()
            raise ConnectionFailError("Meshtastic", self.host, self.port) from e

        return



    ##
    # @brief Parcourt les ports série disponibles et sélectionne celui dont la description contient un des mots-clés définis dans MESHTASTIC_DESCRIPTION.
    #
    # @throws PortNotFoundError Si aucun port ne correspond aux mots-clés.
    ##
    def _findPort(self):
        logger.info("[Meshtastic] Recherche du port série du noeud")

        port = self._searchPort()
        if port is None:
            logger.error("Aucun port série trouvé pour 'Meshtastic'")
            raise PortNotFoundError("Meshtastic")

        self.port = port.device
        logger.info(f"[Meshtastic] Port trouvé : {self.port} ({port.description})")

        return



    ##
    # @brief Cherche, sans journaliser, le port série dont la description contient un des mots-clés définis dans MESHTASTIC_DESCRIPTION.
    #
    # @return Port série trouvé (ListPortInfo), None si aucun ne correspond.
    ##
    def _searchPort(self):
        keywords = Config.MESHTASTIC_DESCRIPTION
        ports    = serial.tools.list_ports.comports()

        for port in ports:
            description = port.description.lower()
            for keyword in keywords:
                if keyword.lower() in description:
                    return port

        return None



    ##
    # @brief Récupère et affiche les informations du nœud local connecté. Appelé automatiquement après l'ouverture de l'interface série.
    #
    # @throws RuntimeError Si la récupération des informations échoue.
    ##
    def _fetchNodeInfo(self):
        logger.info("[Meshtastic] Récupération des informations du noeud local")

        if self.state == ConnectionState.ERROR:
            return

        try:
            node_info = self.client.getMyNodeInfo()

            logger.info(f"[Meshtastic] Noeud local : {node_info}")

        except Exception as e:
            self.state = ConnectionState.ERROR
            message = "[Meshtastic] Échec de la récupération des informations du noeud local"
            logger.error(message)
            raise RuntimeError(message) from e

        return

# =============================================================================
#  Callbacks internes
# =============================================================================

    ##
    # @brief Callback interne appelé par pubsub à la réception d'un paquet Meshtastic.
    #
    # @param packet    Paquet Meshtastic reçu.
    # @param interface Interface série source.
    ##
    def _onReceive(self, packet, interface):
        logger.info(f"[Meshtastic] Paquet reçu depuis le noeud (topic='{self.topic}')")

        if self.userOnReceive:
            try:
                self.userOnReceive(packet, interface)
            except Exception as e:
                logger.warning(f"[Meshtastic] Erreur dans le callback onReceive utilisateur : {e}")

        return

    ##
    # @brief Callback interne appelé par pubsub quand la liaison série avec le noeud est perdue (noeud débranché).
    #
    # @param interface Interface série perdue.
    ##
    def _onConnectionLost(self, interface):
        if interface is not self.client:
            return

        logger.warning("[Meshtastic] Liaison série perdue (noeud débranché ?)")

        self.state = ConnectionState.DISCONNECTED

        return

# =============================================================================
#  Boucle de traitement
# =============================================================================

    ##
    # @brief Maintient le programme actif indéfiniment en attendant les paquets Meshtastic.
    #
    # Si autoReconnect est actif, attend le branchement du noeud lorsqu'il n'est pas connecté
    # (au démarrage ou après un débranchement) et s'y connecte dès qu'il apparaît.
    ##
    def waitForever(self):
        logger.info("[Meshtastic] En attente de paquets (boucle infinie)")

        waitingLogged = False

        while True:
            if self.autoReconnect and self.state != ConnectionState.CONNECTED:
                self._closeInterface()

                # Noeud absent : attente silencieuse de son branchement
                if self._searchPort() is None:
                    if not waitingLogged:
                        logger.warning(f"[Meshtastic] Noeud non branché, nouvelle tentative toutes les {self.retryDelay} s")
                        waitingLogged = True
                    time.sleep(self.retryDelay)
                    continue

                try:
                    self.connect()
                    waitingLogged = False
                    logger.info("[Meshtastic] Noeud connecté")

                except ConnectionFailError:
                    time.sleep(self.retryDelay)
                    continue

            time.sleep(1)

        return

# =============================================================================
#  Fermeture
# =============================================================================

    ##
    # @brief Ferme, sans lever d'erreur, l'interface série restée ouverte après un échec de connexion ou un débranchement.
    ##
    def _closeInterface(self):
        if self.client is None:
            return

        try:
            self.client.close()

        except Exception as e:
            logger.warning(f"[Meshtastic] Fermeture de l'interface série impossible : {e}")

        self.client = None

        return


    ##
    # @brief Se désabonne du topic pubsub et ferme l'interface série proprement.
    #
    # @throws RuntimeError Si le désabonnement ou la fermeture de l'interface échoue.
    ##
    def close(self):
        logger.info("[Meshtastic] Fermeture de la connexion au noeud")

        if self.state != ConnectionState.CONNECTED:
            return

        try:
            logger.info(f"[Meshtastic] Désabonnement du topic pubsub '{self.topic}'")

            pub.unsubscribe(self._onReceive, self.topic)
            pub.unsubscribe(self._onConnectionLost, "meshtastic.connection.lost")

        except Exception as e:
            self.state = ConnectionState.ERROR
            message = f"[Meshtastic] Échec du désabonnement du topic '{self.topic}'"
            logger.error(message)
            raise RuntimeError(message) from e

        try:
            self.client.close()

        except Exception as e:
            self.state = ConnectionState.ERROR
            message = "[Meshtastic] Échec de la fermeture de l'interface série"
            logger.error(message)
            raise RuntimeError(message) from e

        self.state = ConnectionState.DISCONNECTED

        logger.info("[Meshtastic] Connexion fermée proprement")

        return
