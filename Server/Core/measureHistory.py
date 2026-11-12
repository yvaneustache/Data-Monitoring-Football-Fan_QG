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
    #
    # @param ignoreZero Ignorer les valeurs 0 (buffer du capteur pas encore rempli). À désactiver
    #                   pour les données où 0 est une mesure valide (température).
    ##
    def __init__(self, ignoreZero=True):
        delay = Config.SENSOR_DELAY if Config.SENSOR_DELAY > 0 else 1

        self._ignoreZero = ignoreZero ##< @brief Les valeurs 0 sont ignorées.

        self._history  = deque(maxlen=int(HISTORY_DURATION / delay)) ##< @brief Historique des mesures [timestamp en ms, valeur].
        self._lastData = []   ##< @brief Dernier envoi de données par le capteur.
        self._current  = None ##< @brief Valeur actuelle : maximum des mesures du dernier envoi du capteur, depuis la dernière remise à zéro (None si aucune).
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
    # @brief Retourne la valeur actuelle : maximum des mesures valides du dernier envoi du capteur
    #        (15 mesures en général), depuis la dernière remise à zéro.
    #
    # @return float|None Valeur actuelle, None si aucune mesure depuis la remise à zéro.
    ##
    def getCurrent(self):
        return self._current

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
    # correspond à l'instant présent, les précédentes sont espacées de la période
    # du capteur (SENSOR_DELAY par défaut). Les valeurs None (mesure invalide) et 0
    # (buffer du capteur pas encore rempli, sauf si ignoreZero=False) sont ignorées.
    #
    # @param values Liste des valeurs envoyées par le capteur.
    # @param period Période entre deux mesures en secondes (champ "p" du message), None pour SENSOR_DELAY.
    #
    # @return list Liste des couples [timestamp en ms, valeur] ajoutés à l'historique.
    ##
    def addData(self, values, period=None):
        now   = time.time()
        delay = period if period else (Config.SENSOR_DELAY if Config.SENSOR_DELAY > 0 else 1)
        count = len(values)
        added = []

        for index, value in enumerate(values):
            if value is None or (self._ignoreZero and value == 0):
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

        # Valeur actuelle : maximum des mesures valides de cet envoi (inchangée si l'envoi n'en contient aucune)
        if added:
            self._current = max(point[1] for point in added)

        self._lastData = values

        return added

    ##
    # @brief Remet à zéro la valeur actuelle, la moyenne, le minimum et le maximum, sans effacer l'historique.
    ##
    def resetStatistics(self):
        self._current = None
        self._count   = 0
        self._total   = 0
        self._minimum = None
        self._maximum = None

        return

    ##
    # @brief Retourne la valeur actuelle et les statistiques.
    #
    # @return dict {"current", "average", "minimum", "maximum"}, valeurs None si aucune mesure depuis la remise à zéro.
    ##
    def getStatistics(self):
        return {"current": self.getCurrent(), "average": self.getAverage(), "minimum": self.getMinimum(), "maximum": self.getMaximum()}
