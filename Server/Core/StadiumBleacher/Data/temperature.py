##
# @file temperature.py
#
# @brief Déclaration et implémentation de la classe TemperatureData.
#
# Stocke l'historique horodaté de la température d'une tribune de stade et calcule les statistiques en temps réel (cf. MeasureHistory).
##

# =============================================================================
#  Import des modules internes
# =============================================================================

from Server.Core.measureHistory import MeasureHistory

# =============================================================================
#  Données de température
# =============================================================================

##
# @class TemperatureData
#
# @brief Historique horodaté de la température (en °C). La valeur 0 °C est une mesure valide.
##
class TemperatureData(MeasureHistory):

# =============================================================================
#  Constructeur
# =============================================================================

    ##
    # @brief Initialise un historique vide, en conservant les mesures à 0 °C.
    ##
    def __init__(self):
        super().__init__(ignoreZero=False)

        return

# =============================================================================
#  Accesseurs
# =============================================================================

    ##
    # @brief Retourne le dernier envoi de données du capteur.
    #
    # @return list Liste des valeurs du dernier envoi.
    ##
    def getTemperature(self):
        return self.getLastData()
