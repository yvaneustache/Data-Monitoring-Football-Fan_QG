##
# @file supporter.py
#
# @brief Déclaration et implémentation de la classe Supporter.
#
# Regroupe l'identité d'un supporter et l'ensemble de ses données biométriques collectées en temps réel.
##

# =============================================================================
#  Import des bibliothèques
# =============================================================================

from Server.Config.setting import Config
from Server.Core.Supporter.Data.heartRate import HeartRateData
from Server.Utils.logger import Logger

# =============================================================================
#  Création du logger
# =============================================================================

logger = Logger("Serveur/Supporter")

# =============================================================================
#  Supporter
# =============================================================================

##
# @class Supporter
#
# @brief Représente un supporter identifié et ses données biométriques.
##
class Supporter:

# =============================================================================
#  Constructeur
# ==============================================================================

    ##
    # @brief Construit un Supporter avec son identifiant et son nom.
    #
    # @param supporterId Identifiant unique du supporter.
    # @param name        Nom d'affichage du supporter.
    ##
    def __init__(self, supporterId, name):
        self.supporterId = supporterId     ##< @brief Identifiant unique du supporter.
        self.name        = name            ##< @brief Nom d'affichage du supporter.
        self.heartRate   = HeartRateData() ##< @brief Données de fréquence cardiaque du supporter.

        return

# =============================================================================
#  Accesseurs
# =============================================================================

    ##
    # @brief Retourne l'identifiant unique du supporter.
    #
    # @return int Identifiant du supporter.
    ##
    def getId(self):
        return self.supporterId



    ##
    # @brief Retourne le nom d'affichage du supporter.
    #
    # @return str Nom du supporter.
    ##
    def getName(self):
        return self.name

# ==============================================================================
#  Ajout de données biométriques
# ==============================================================================

    ##
    # @brief Distribue une nouvelle mesure vers le bon objet de données selon son type.
    #
    # @param data     Dictionnaire contenant au minimum les clés "type" et la valeur associée.
    # @param dataType Type de la données à ajouter.
    #
    # @return list Points [timestamp en ms, valeur] ajoutés à l'historique.
    ##
    def addData(self, data, dataType):
        if dataType == "heart_rate":
            return self.heartRate.addData(data["hr"])
        else:
            # Type inconnu : logué mais non bloquant
            logger.warning(f"[Supporter] Type de données inconnu ignoré : '{dataType}'")
        return []
