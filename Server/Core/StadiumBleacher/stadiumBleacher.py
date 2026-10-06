##
# @file stadiumBleacher.py
#
# @brief Déclaration et implémentation de la classe StadiumBleacher.
#
# Regroupe l'identité d'une tribune du stade et l'ensemble de ses données collectées en temps réel.
##

# =============================================================================
#  Import des bibliothèques
# =============================================================================

from Server.Config.setting import Config
from Server.Core.StadiumBleacher.Data.accelerometer import AccelerometerData
from Server.Core.StadiumBleacher.Data.acoustic import AcousticData
from Server.Utils.logger import Logger

# =============================================================================
#  Création du logger
# =============================================================================

logger = Logger("Serveur/Stadium_Bleacher")

# =============================================================================
#  Tribune du stade
# =============================================================================

##
# @class StadiumBleacher
#
# @brief Représente une tribune du stade identifié et ses données.
##
class StadiumBleacher:

# =============================================================================
#  Constructeur
# ==============================================================================

    ##
    # @brief Construit une tribune de stade avec son identifiant et son nom.
    #
    # @param stadiumBleacherId  Identifiant unique de la tribune du stade.
    # @param name               Nom d'affichage de la tribune du stade.
    ##
    def __init__(self, stadiumBleacherId, name):
        self.stadiumBleacherId = stadiumBleacherId   ##< @brief Identifiant unique de la tribune du stade.
        self.name              = name                ##< @brief Nom d'affichage de la tribune du stade.
        self.accelerometer     = AccelerometerData() ##< @brief Données d'accélération de la tribune.
        self.acoustic          = AcousticData()      ##< @brief Données acoustic de la tribune.

        return

# =============================================================================
#  Accesseurs
# =============================================================================

    ##
    # @brief Retourne l'identifiant unique de la tribune du stade.
    #
    # @return int Identifiant de la tribune du stade.
    ##
    def getId(self):
        return self.stadiumBleacherId



    ##
    # @brief Retourne le nom d'affichage de la tribune du stade.
    #
    # @return str Nom de la tribune du stade.
    ##
    def getName(self):
        return self.name

# ==============================================================================
#  Ajout de données
# =============================================================================

    ##
    # @brief Distribue une nouvelle mesure vers le bon objet de données selon son type.
    #
    # @param data     Dictionnaire contenant au minimum les clés "type" et la valeur associée.
    # @param dataType Type de la données à ajouter.
    #
    # @return list Points [timestamp en ms, valeur] ajoutés à l'historique.
    ##
    def addData(self, data, dataType):
        if dataType == "accelerometer_gyroscope":
            return self.accelerometer.addData(data["a"])
        elif dataType == "acoustic":
            return self.acoustic.addData(data["a"])
        else:
            # Type inconnu : logué mais non bloquant
            logger.warning(f"[StadiumBleacher] Type de données inconnu ignoré : '{dataType}'")

        return []
