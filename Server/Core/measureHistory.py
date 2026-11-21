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
from array import array
from collections import deque

# =============================================================================
#  Import des modules internes
# =============================================================================

from Server.Config.setting import Config

# =============================================================================
#  Configuration
# =============================================================================

HISTORY_DURATION = 4 * 3600 ##< @brief Durée d'historique conservée en mémoire (en seconde).
PHASE_WINDOW     = 20       ##< @brief Nombre d'envois récents servant au calage (environ 5 min pour des envois toutes les 15 s).
SPAN_WINDOW      = 40       ##< @brief Nombre d'intervalles entre envois servant à mesurer la durée réelle d'un envoi (environ 10 min).
SEQUENCE_SPAN    = 60       ##< @brief Nombre d'envois numérotés servant à mesurer la durée réelle d'un envoi (environ 15 min).
SEQUENCE_MODULO  = 1000     ##< @brief Le compteur d'envois "s" du capteur va de 0 à 999 (environ 4 h d'envois toutes les 15 s).
DUPLICATE_WINDOW = 300      ##< @brief Un envoi dont le compteur et les valeurs ont déjà été reçus dans les 5 dernières minutes est un doublon (s).
MAX_LATE_SLOTS   = 4        ##< @brief Retard maximal d'un envoi arrivé après les suivants (créneaux, environ 1 min) : au-delà, capteur redémarré.

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

        # Calage des envois du capteur (cf. _packetEnd()) : instant de fin des envois, d'après les paquets arrivés à l'heure
        self._nominal   = None                          ##< @brief Durée théorique d'un envoi : nombre de mesures × période (s).
        self._intervals = deque(maxlen=SPAN_WINDOW)     ##< @brief Intervalles entre les réceptions des derniers envois (s).
        self._packets   = deque(maxlen=PHASE_WINDOW)    ##< @brief Derniers envois : (heure de réception en s, créneau).
        self._lastRecv  = None                          ##< @brief Heure de réception du dernier envoi (s).
        self._lastSlot  = 0                             ##< @brief Créneau du dernier envoi (depuis le début du calage).
        self._lastSeq   = None                          ##< @brief Compteur "s" du dernier envoi (le plus récent).
        self._seen      = {}                            ##< @brief Compteurs "s" reçus récemment : {compteur: (heure de réception en s, valeurs)} (doublons).
        self._placed    = {}                            ##< @brief Mesures placées des derniers créneaux : {créneau: (première, dernière) en s}.
        self._received  = deque(maxlen=SEQUENCE_SPAN)   ##< @brief Derniers envois numérotés : (heure de réception en s, créneau).
        self._knownSpan = None                          ##< @brief Dernière durée réelle mesurée d'un envoi (s), conservée si le capteur redémarre.

        self._offset    = 0.0                           ##< @brief Décalage de calibration ajouté à toutes les mesures lues (même unité que les mesures).
        self._floor     = None                          ##< @brief Valeur à laquelle sont ramenées les mesures inférieures au seuil (None : pas de seuillage, cf. configureThreshold()).
        self._threshold = None                          ##< @brief Seuil : les mesures corrigées du décalage qui lui sont inférieures sont ramenées à _floor.
        self._values    = array("d")                    ##< @brief Mesures brutes des statistiques, si un seuillage est configuré (la moyenne des mesures seuillées en dépend).

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
        return self._shifted(self._history[-1][1]) if self._history else None

    ##
    # @brief Retourne la valeur actuelle : maximum des mesures valides du dernier envoi du capteur
    #        (15 mesures en général), depuis la dernière remise à zéro.
    #
    # @return float|None Valeur actuelle, None si aucune mesure depuis la remise à zéro.
    ##
    def getCurrent(self):
        return self._shifted(self._current)

    ##
    # @brief Retourne la moyenne des mesures depuis la dernière remise à zéro.
    #
    # @return float|None Moyenne arrondie au dixième, None si aucune mesure.
    ##
    def getAverage(self):
        if self._count == 0:
            return None

        if self._floor is None:
            return round(self._total / self._count + self._offset, 1)

        # Moyenne des mesures corrigées puis seuillées : le seuillage de chaque mesure dépend de sa valeur
        offset, threshold, floor, total = self._offset, self._threshold, self._floor, 0.0
        for value in self._values:
            corrected = value + offset
            total += floor if corrected < threshold else corrected

        return round(total / len(self._values), 1)

    ##
    # @brief Retourne la valeur minimale depuis la dernière remise à zéro.
    #
    # @return float|None Valeur minimale, None si aucune mesure.
    ##
    def getMinimum(self):
        return self._shifted(self._minimum)

    ##
    # @brief Retourne la valeur maximale depuis la dernière remise à zéro.
    #
    # @return float|None Valeur maximale, None si aucune mesure.
    ##
    def getMaximum(self):
        return self._shifted(self._maximum)

    ##
    # @brief Retourne le dernier envoi de données du capteur.
    #
    # @return list Liste des valeurs du dernier envoi.
    ##
    def getLastData(self):
        return self._lastData

    ##
    # @brief Retourne l'historique horodaté des mesures, corrigé du décalage de calibration.
    #
    # @return list Liste de couples [timestamp en ms, valeur], du plus ancien au plus récent.
    ##
    def getHistory(self):
        if not self._calibrated():
            return list(self._history)

        return [[timestamp, self._shifted(value)] for timestamp, value in self._history]

    ##
    # @brief Retourne le décalage de calibration ajouté aux mesures.
    #
    # @return float Décalage (même unité que les mesures).
    ##
    def getOffset(self):
        return self._offset

# =============================================================================
#  Calibration
# =============================================================================

    ##
    # @brief Fixe le décalage de calibration ajouté aux mesures.
    #
    # Les mesures sont conservées brutes : le décalage est appliqué à la lecture (historique, valeur actuelle,
    # moyenne, minimum, maximum). Le changer corrige donc aussi toutes les mesures déjà enregistrées.
    #
    # @param offset Décalage (même unité que les mesures).
    ##
    def setOffset(self, offset):
        self._offset = float(offset)

    ##
    # @brief Active le seuillage : les mesures corrigées du décalage inférieures au seuil sont ramenées à une valeur plancher.
    #
    # Le seuil ne peut pas être inférieur au plancher, ce qui garde la correction croissante avec la mesure (le minimum
    # et le maximum corrigés sont ceux des mesures minimale et maximale).
    #
    # @param floor     Valeur plancher (ex : 30 dB).
    # @param threshold Seuil initial (plancher par défaut : seules les mesures inférieures au plancher sont relevées).
    ##
    def configureThreshold(self, floor, threshold=None):
        self._floor = float(floor)
        self.setThreshold(threshold if threshold is not None else floor)

    ##
    # @brief Fixe le seuil : les mesures corrigées inférieures à ce seuil sont ramenées au plancher (cf. configureThreshold()).
    #
    # @param threshold Seuil (même unité que les mesures), ramené au plancher s'il lui est inférieur.
    ##
    def setThreshold(self, threshold):
        self._threshold = max(self._floor, float(threshold)) if self._floor is not None else None

    ##
    # @brief Applique une calibration : décalage et/ou seuil (cf. setOffset() et setThreshold()).
    #
    # @param offset    Décalage ajouté aux mesures, None pour ne pas le changer.
    # @param threshold Seuil sous lequel les mesures corrigées sont ramenées au plancher, None pour ne pas le changer.
    ##
    def setCalibration(self, offset=None, threshold=None):
        if offset is not None:
            self.setOffset(offset)
        if threshold is not None:
            self.setThreshold(threshold)

    ##
    # @brief Retourne le seuil.
    #
    # @return float|None Seuil, None si aucun seuillage n'est configuré.
    ##
    def getThreshold(self):
        return self._threshold

    ##
    # @brief Indique si la calibration modifie les mesures lues.
    ##
    def _calibrated(self):
        return bool(self._offset) or self._threshold is not None

    ##
    # @brief Applique la calibration (décalage, puis seuillage) à une valeur brute.
    #
    # @param value Valeur brute (None conservé).
    #
    # @return float|None Valeur corrigée.
    ##
    def _shifted(self, value):
        if value is None:
            return None

        corrected = round(value + self._offset, 6) if self._offset else value

        return self._floor if self._threshold is not None and corrected < self._threshold else corrected

# =============================================================================
#  Méthodes
# =============================================================================

    ##
    # @brief Ajoute un envoi de mesures du capteur.
    #
    # Les mesures d'un envoi sont espacées de la période réelle du capteur (durée réelle d'un envoi / nombre de
    # mesures : environ 1 s, un peu plus selon le capteur), sans compression ; la dernière est placée à la fin de
    # l'envoi, calée sur les paquets arrivés à l'heure (le réseau ne peut que retarder un paquet).
    #   - Avec le compteur d'envois "s" du capteur (cf. _placeSequence()) : chaque envoi est placé dans son créneau,
    #     même arrivé en retard ou après le suivant (il comble alors le trou laissé dans la courbe) ; un doublon
    #     (même compteur et mêmes valeurs dans les 5 dernières minutes) est ignoré.
    #   - Sans compteur (capteur pas encore mis à jour, cf. _packetEnd()) : créneau déduit de l'heure de réception ;
    #     les mesures qui tomberaient avant la dernière enregistrée sont ignorées.
    # L'historique reste dans l'ordre chronologique : la courbe ne revient pas en arrière. Les valeurs None (mesure
    # invalide) et 0 (buffer du capteur pas encore rempli, sauf si ignoreZero=False) sont ignorées.
    #
    # @param values   Liste des valeurs envoyées par le capteur.
    # @param period   Période entre deux mesures en secondes (champ "p" du message), None pour SENSOR_DELAY.
    # @param sequence Compteur d'envois du capteur (champ "s" du message, 0 à 999), None si absent.
    #
    # @return list Liste des couples [timestamp en ms, valeur] ajoutés à l'historique (vide pour un doublon).
    ##
    def addData(self, values, period=None, sequence=None):
        now   = time.time()
        delay = period if period else (Config.SENSOR_DELAY if Config.SENSOR_DELAY > 0 else 1)
        count = len(values)
        added = []

        if count == 0:
            return added

        # Compteur d'envois illisible : envoi traité comme non numéroté
        try:
            sequence = int(sequence) if sequence is not None else None
        except (TypeError, ValueError):
            sequence = None

        # Horodatage de chaque mesure (ms)
        if sequence is not None:
            placement = self._placeSequence(now, count, delay, sequence, values)
            if placement is None:
                return added  # Doublon
            start, step, newest = placement
            lastMs = None
        else:
            end, span = self._packetEnd(now, count * delay)
            step      = span / count
            start     = end - (count - 1) * step
            newest    = True
            # Calage corrigé par un paquet plus ponctuel : mesures qui tomberaient avant la dernière enregistrée ignorées
            lastMs    = self._history[-1][0] if self._history else None

        times = [int((start + index * step) * 1000) for index in range(count)]

        for index, value in enumerate(values):
            if value is None or (self._ignoreZero and value == 0):
                continue
            if lastMs is not None and times[index] <= lastMs:
                continue

            point = [times[index], value]
            self._insert(point)
            added.append(point)

            self._count += 1
            self._total += value
            if self._floor is not None:
                self._values.append(value)

            if self._minimum is None or value < self._minimum:
                self._minimum = value

            if self._maximum is None or value > self._maximum:
                self._maximum = value

        # Valeur actuelle : maximum des mesures valides de l'envoi le plus récent (un envoi arrivé en retard ne la remplace pas)
        if added and newest:
            self._current  = max(point[1] for point in added)
            self._lastData = values

        # Mesures renvoyées corrigées du décalage de calibration (l'historique garde les valeurs brutes)
        return [[timestamp, self._shifted(value)] for timestamp, value in added] if self._calibrated() else added

    ##
    # @brief Insère une mesure dans l'historique à sa place (ordre chronologique).
    #
    # @param point Couple [timestamp en ms, valeur].
    ##
    def _insert(self, point):
        history = self._history
        if not history or history[-1][0] < point[0]:
            history.append(point)
            return

        # Envoi arrivé en retard : mesure insérée à sa place (recherche depuis la fin, où sont les mesures récentes)
        index = len(history)
        while index > 0 and history[index - 1][0] > point[0]:
            index -= 1
        if len(history) == history.maxlen:
            if index == 0:
                return  # Plus ancienne que tout l'historique conservé
            history.popleft()
            index -= 1
        history.insert(index, point)

    ##
    # @brief Recommence le calage des envois (premier envoi, durée théorique changée, capteur redémarré).
    #
    # @param now     Heure de réception (s).
    # @param nominal Durée théorique d'un envoi (s).
    ##
    def _restart(self, now, nominal):
        # Durée réelle mesurée conservée si le capteur redémarre (même période), oubliée si la durée théorique change
        if self._nominal is None or abs(nominal - self._nominal) > 1e-6:
            self._knownSpan = None
        self._nominal = nominal
        self._intervals.clear()
        self._packets.clear()
        self._packets.append((now, 0))
        self._placed.clear()
        self._received.clear()
        self._received.append((now, 0))
        self._lastRecv = now
        self._lastSlot = 0

    ##
    # @brief Durée réelle d'un envoi : médiane des intervalles mesurés (durée théorique tant qu'il y en a moins de 5).
    #
    # Elle diffère un peu de la durée théorique (nombre de mesures × période déclarée) : 15,4 s au lieu de 15 s pour
    # l'acoustique du match FCL-Monaco (mesure toutes les 1,023 s). La médiane n'est pas faussée par les paquets
    # retardés, minoritaires.
    #
    # @param interval Intervalle par créneau entre ce paquet et le précédent (s), None si aucun.
    #
    # @return float Durée réelle d'un envoi (s).
    ##
    def _span(self, interval=None):
        if interval is not None and 0.5 * self._nominal < interval < 1.5 * self._nominal:
            self._intervals.append(interval)

        return sorted(self._intervals)[len(self._intervals) // 2] if len(self._intervals) >= 5 else self._nominal

    ##
    # @brief Instant de fin d'un envoi non numéroté (capteur sans compteur "s"), calé sur les envois arrivés à l'heure.
    #
    # Chaque envoi occupe le créneau suivant le précédent, ou plus loin si des paquets ont été perdus (créneau déduit
    # de l'heure de réception). La fin de l'envoi est la projection des envois récents arrivés à l'heure (la plus
    # petite) : un paquet retardé est placé dans son créneau. Le calage est recommencé si la durée théorique change
    # ou après une interruption (capteur redémarré).
    #
    # @param now     Heure de réception (s).
    # @param nominal Durée théorique de l'envoi (s).
    #
    # @return tuple (instant de fin de l'envoi en s, jamais après sa réception ; durée réelle d'un envoi en s).
    ##
    def _packetEnd(self, now, nominal):
        if (nominal <= 0 or self._nominal is None or abs(nominal - self._nominal) > 1e-6
                or self._lastRecv is None or now - self._lastRecv > 3 * nominal):
            self._restart(now, nominal)
            return now, nominal

        span = self._span(now - self._lastRecv)
        self._lastRecv = now

        # Créneau : un paquet en légère avance (gigue, au plus 2 s) reste dans son créneau ; créneaux sautés = paquets perdus
        tolerance = min(2.0, 0.1 * span)
        expected  = min(recv + (self._lastSlot + 1 - slot) * span for recv, slot in self._packets)
        slot      = self._lastSlot + 1 + max(0, int((now - expected + tolerance) / span))
        self._lastSlot = slot
        self._packets.append((now, slot))

        end = min(recv + (slot - other) * span for recv, other in self._packets)
        return min(now, end), span

    ##
    # @brief Durée réelle d'un envoi, d'après les envois numérotés (compteur "s") des 15 dernières minutes.
    #
    # Le paquet le plus ponctuel des plus anciens et celui des plus récents (heure de réception la plus en avance
    # sur la durée théorique) sont reliés : la gigue du réseau est divisée par le nombre de créneaux qui les
    # séparent (une quarantaine), au lieu de fausser chaque intervalle. Pendant les 6 premiers envois : durée mesurée avant un redémarrage du capteur, sinon durée théorique.
    #
    # @return float Durée réelle d'un envoi (s).
    ##
    def _sequenceSpan(self):
        packets = sorted(self._received, key=lambda packet: packet[1])
        if len(packets) < 6 or packets[-1][1] - packets[0][1] < 5:
            return self._knownSpan or self._nominal

        group = max(2, len(packets) // 3)
        first = min(packets[:group],  key=lambda packet: packet[0] - packet[1] * self._nominal)
        last  = min(packets[-group:], key=lambda packet: packet[0] - packet[1] * self._nominal)
        span  = (last[0] - first[0]) / (last[1] - first[1])

        if not 0.8 * self._nominal < span < 1.2 * self._nominal:
            return self._knownSpan or self._nominal
        self._knownSpan = span
        return span

    ##
    # @brief Place un envoi numéroté par le capteur (compteur "s", de 0 à 999).
    #
    # Le compteur donne le créneau de l'envoi sans ambiguïté : écart au compteur du dernier envoi, ramené entre
    # -500 et 499 (le compteur repart à 0 après 999). Un écart négatif est un envoi arrivé après le suivant, placé
    # dans le trou qu'il avait laissé. La fin de l'envoi est la projection des envois récents arrivés à l'heure (la
    # plus petite) ; ses mesures ne commencent jamais avant celles d'un créneau précédent déjà placé.
    # Le calage est recommencé si la durée théorique change ou si le compteur ne correspond pas aux envois reçus
    # (capteur redémarré : le compteur repart à 0) : compteur déjà reçu avec d'autres valeurs, retard de plus de
    # MAX_LATE_SLOTS créneaux, ou avance plus grande que le temps écoulé.
    #
    # @param now      Heure de réception (s).
    # @param count    Nombre de mesures de l'envoi.
    # @param delay    Période déclarée entre deux mesures (s).
    # @param sequence Compteur de l'envoi.
    # @param values   Valeurs de l'envoi (reconnaissance des doublons).
    #
    # @return tuple|None (heure de la première mesure en s, période en s, envoi le plus récent), None pour un doublon.
    ##
    def _placeSequence(self, now, count, delay, sequence, values):
        nominal = count * delay
        content = tuple(values)

        # Doublon : même compteur et mêmes valeurs dans les 5 dernières minutes (paquet retransmis)
        self._seen = {seq: seen for seq, seen in self._seen.items() if now - seen[0] <= DUPLICATE_WINDOW}
        reused = sequence in self._seen
        if reused and self._seen[sequence][1] == content:
            return None
        self._seen[sequence] = (now, content)

        slot   = None
        newest = True
        if not reused and self._lastSeq is not None and self._nominal is not None and abs(nominal - self._nominal) <= 1e-6:
            shift   = (sequence - self._lastSeq) % SEQUENCE_MODULO
            shift   = shift - SEQUENCE_MODULO if shift >= SEQUENCE_MODULO // 2 else shift
            elapsed = (now - self._lastRecv) / self._sequenceSpan()
            # Compteur cohérent avec les envois reçus (sinon capteur redémarré)
            if (shift < 0 and -shift <= MAX_LATE_SLOTS) or (0 < shift <= 1.5 * elapsed + 3):
                slot = self._lastSlot + shift

        if slot is None:
            self._restart(now, nominal)
            self._seen    = {sequence: (now, content)}
            self._lastSeq = sequence
            span, slot    = self._knownSpan or nominal, 0
        else:
            newest = slot > self._lastSlot
            if newest:
                self._lastSlot = slot
                self._lastSeq  = sequence
                self._lastRecv = now
            self._packets.append((now, slot))
            self._received.append((now, slot))
            span = self._sequenceSpan()

        # Fin de l'envoi : projection des envois arrivés à l'heure, jamais après la réception
        step  = span / count
        end   = min(recv + (slot - other) * span for recv, other in self._packets)
        start = end - (count - 1) * step

        # Pas avant les mesures d'un créneau précédent déjà placé (calage abaissé par un paquet plus ponctuel, de
        # la gigue du réseau) : envoi décalé à leur suite, sans compression. Au-delà de cette gigue (2 s), c'est le
        # créneau précédent qui était mal placé (envoi de référence très retardé, au démarrage) : l'envoi garde sa
        # place, sinon tous les suivants seraient décalés dans le futur
        previous = [last for other, (first, last) in self._placed.items() if other < slot]
        if previous and start <= max(previous) < start + min(2.0, 0.1 * span):
            start = max(previous) + step

        self._placed[slot] = (start, start + (count - 1) * step)
        self._placed = {other: bounds for other, bounds in self._placed.items() if other > self._lastSlot - 2 * PHASE_WINDOW}

        return start, step, newest

    ##
    # @brief Remet à zéro la valeur actuelle, la moyenne, le minimum et le maximum, sans effacer l'historique.
    ##
    def resetStatistics(self):
        self._current = None
        self._count   = 0
        self._total   = 0
        self._values  = array("d")
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
