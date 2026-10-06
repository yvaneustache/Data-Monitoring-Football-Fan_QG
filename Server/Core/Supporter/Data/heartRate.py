##
# @file heartRate.py
#
# @brief Déclaration et implémentation de la classe HeartRateData.
#
# Stocke l'historique horodaté de la fréquence cardiaque d'un supporter et calcule les statistiques en temps réel (cf. MeasureHistory).
##

# =============================================================================
#  Import des modules internes
# =============================================================================

from Server.Core.measureHistory import MeasureHistory

# =============================================================================
#  Données de fréquence cardiaque
# =============================================================================

##
# @class HeartRateData
#
# @brief Historique horodaté de la fréquence cardiaque (en bpm).
##
class HeartRateData(MeasureHistory):

# =============================================================================
#  Accesseurs
# =============================================================================

    ##
    # @brief Retourne le dernier envoi de données du capteur.
    #
    # @return list Liste des valeurs du dernier envoi.
    ##
    def getHeartRate(self):
        return self.getLastData()
