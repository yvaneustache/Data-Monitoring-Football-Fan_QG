##
# @file measureHistory.py
#
# @brief Déclaration et implémentation de la classe MeasureHistory.
#
# Stocke l'historique horodaté des mesures d'un capteur et calcule les statistiques en temps réel (dernière valeur, moyenne, minimum, maximum), remises à zéro à la demande sans effacer l'historique.
##

# =============================================================================
#  Import des modules externes
# =============================================================================

import time
from collections import deque

# =============================================================================
#  Import des modules internes
# =============================================================================

from Server.Config.setting import Config

# =============================================================================
#  Configuration
# =============================================================================

HISTORY_DURATION = 4 * 3600 ##< @brief Durée d'historique conservée en mémoire (en seconde).

# =============================================================================
#  Historique de mesures
# =============================================================================

##
# @class MeasureHistory
#
# @brief Historique horodaté des mesures d'un capteur et statistiques associées.
##
class MeasureHistory:

# =============================================================================
#  Constructeur
# =============================================================================

    ##
    # @brief Initialise un historique vide.
    ##
    def __init__(self):
        delay = Config.SENSOR_DELAY if Config.SENSOR_DELAY > 0 else 1

        self._history  = deque(maxlen=int(HISTORY_DURATION / delay)) ##< @brief Historique des mesures [timestamp en ms, valeur].
        self._lastData = []   ##< @brief Dernier envoi de données par le capteur.
        self._count    = 0    ##< @brief Nombre de mesures prises en compte dans les statistiques.
        self._total    = 0    ##< @brief Somme des mesures prises en compte dans les statistiques.
        self._minimum  = None ##< @brief Valeur minimale depuis la dernière remise à zéro (None si aucune mesure).
        self._maximum  = None ##< @brief Valeur maximale depuis la dernière remise à zéro (None si aucune mesure).

        return

# =============================================================================
#  Accesseurs
# =============================================================================

    ##
    # @brief Retourne la dernière mesure enregistrée.
    #
    # @return float|None Dernière valeur, None si aucune mesure.
    ##
    def getLasted(self):
        return self._history[-1][1] if self._history else None

    ##
    # @brief Retourne la moyenne des mesures depuis la dernière remise à zéro.
    #
    # @return float|None Moyenne arrondie au dixième, None si aucune mesure.
    ##
    def getAverage(self):
        if self._count == 0:
            return None

        return round(self._total / self._count, 1)

    ##
    # @brief Retourne la valeur minimale depuis la dernière remise à zéro.
    #
    # @return float|None Valeur minimale, None si aucune mesure.
    ##
    def getMinimum(self):
        return self._minimum

    ##
    # @brief Retourne la valeur maximale depuis la dernière remise à zéro.
    #
    # @return float|None Valeur maximale, None si aucune mesure.
    ##
    def getMaximum(self):
        return self._maximum

    ##
    # @brief Retourne le dernier envoi de données du capteur.
    #
    # @return list Liste des valeurs du dernier envoi.
    ##
    def getLastData(self):
        return self._lastData

    ##
    # @brief Retourne l'historique horodaté des mesures.
    #
    # @return list Liste de couples [timestamp en ms, valeur], du plus ancien au plus récent.
    ##
    def getHistory(self):
        return list(self._history)

# =============================================================================
#  Méthodes
# =============================================================================

    ##
    # @brief Ajoute un envoi de mesures du capteur.
    #
    # Les mesures sont horodatées à la réception : la dernière valeur de l'envoi
    # correspond à l'instant présent, les précédentes sont espacées de SENSOR_DELAY.
    # Les valeurs None et 0 (buffer du capteur pas encore rempli) sont ignorées.
    #
    # @param values Liste des valeurs envoyées par le capteur.
    #
    # @return list Liste des couples [timestamp en ms, valeur] ajoutés à l'historique.
    ##
    def addData(self, values):
        now   = time.time()
        delay = Config.SENSOR_DELAY if Config.SENSOR_DELAY > 0 else 1
        count = len(values)
        added = []

        for index, value in enumerate(values):
            if value is None or value == 0:
                continue

            point = [int((now - (count - 1 - index) * delay) * 1000), value]
            self._history.append(point)
            added.append(point)

            self._count += 1
            self._total += value

            if self._minimum is None or value < self._minimum:
                self._minimum = value

            if self._maximum is None or value > self._maximum:
                self._maximum = value

        self._lastData = values

        return added

    ##
    # @brief Remet à zéro la moyenne, le minimum et le maximum, sans effacer l'historique.
    ##
    def resetStatistics(self):
        self._count   = 0
        self._total   = 0
        self._minimum = None
        self._maximum = None

        return
