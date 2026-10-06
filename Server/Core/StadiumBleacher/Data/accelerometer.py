##
# @file accelerometer.py
#
# @brief Déclaration et implémentation de la classe AccelerometerData.
#
# Stocke l'historique horodaté de l'accélération d'une tribune de stade et calcule les statistiques en temps réel (cf. MeasureHistory).
##

# =============================================================================
#  Import des modules internes
# =============================================================================

from Server.Core.measureHistory import MeasureHistory

# =============================================================================
#  Données d'accélération
# =============================================================================

##
# @class AccelerometerData
#
# @brief Historique horodaté de l'accélération (max de |‖a‖ - g| par seconde, en m/s²).
##
class AccelerometerData(MeasureHistory):

# =============================================================================
#  Accesseurs
# =============================================================================

    ##
    # @brief Retourne le dernier envoi de données du capteur.
    #
    # @return list Liste des valeurs du dernier envoi.
    ##
    def getAccelerometer(self):
        return self.getLastData()
