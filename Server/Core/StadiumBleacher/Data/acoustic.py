##
# @file acoustic.py
#
# @brief Déclaration et implémentation de la classe AcousticData.
#
# Stocke l'historique horodaté du niveau sonore d'une tribune de stade et calcule les statistiques en temps réel (cf. MeasureHistory).
##

# =============================================================================
#  Import des modules internes
# =============================================================================

from Server.Core.measureHistory import MeasureHistory
from Server.Utils.data import CALIBRATION

# =============================================================================
#  Données acoustiques
# =============================================================================

##
# @class AcousticData
#
# @brief Historique horodaté du niveau sonore (LAeq en dB(A)).
##
class AcousticData(MeasureHistory):

# =============================================================================
#  Constructeur
# =============================================================================

    ##
    # @brief Initialise l'historique acoustique, avec un seuillage de calibration (cf. MeasureHistory.configureThreshold()) :
    #        les mesures corrigées du décalage inférieures au seuil sont ramenées à 30 dB(A).
    ##
    def __init__(self):
        super().__init__()
        self.configureThreshold(CALIBRATION["acoustic"]["floor"])

# =============================================================================
#  Accesseurs
# =============================================================================

    ##
    # @brief Retourne le dernier envoi de données du capteur.
    #
    # @return list Liste des valeurs du dernier envoi.
    ##
    def getAcoustic(self):
        return self.getLastData()
