##
# @file export.py
#
# @brief Export CSV des données et des évènements du match.
#
# Cinq fichiers, au format CSV français (séparateur ";", virgule décimale, UTF-8), triés par date :
#   - vibration.csv  : vibration des tribunes (max de |‖a‖ - g| par seconde, en m/s²) ;
#   - cardiaque.csv  : fréquence cardiaque des supporters (en bpm) ;
#   - acoustique.csv : niveau sonore des tribunes (LAeq en dB(A)) ;
#   - evenements.csv : évènements du match ;
#   - ensemble.csv   : toutes les données et tous les évènements, une ligne par seconde.
##

# =============================================================================
#  Import des bibliothèques
# =============================================================================

import csv
import io
from datetime import datetime

from Server.Utils.event import matchMinute

# =============================================================================
#  Configuration
# =============================================================================

##
# @brief Types d'export : nom du fichier, colonne de la source, colonne de la valeur.
##
EXPORTS = {
    "vibration":  {"source": "Tribune",   "value": "Vibration (m/s²)"},
    "cardiaque":  {"source": "Supporter", "value": "Fréquence cardiaque (bpm)"},
    "acoustique": {"source": "Tribune",   "value": "Acoustique (dB(A))"},
    "evenements": None,
    "ensemble":   None,
}

# =============================================================================
#  Fonctions internes
# =============================================================================

##
# @brief Formate une valeur pour le CSV : virgule décimale pour les nombres réels.
#
# @param value Valeur à écrire.
#
# @return Valeur formatée.
##
def _format(value):
    if isinstance(value, float):
        return repr(value).replace(".", ",")

    return value



##
# @brief Colonnes de date communes à tous les fichiers.
#
# @param t      Timestamp en millisecondes.
# @param events Évènements du match (pour la minute de jeu).
#
# @return list [date, heure, timestamp, minute de jeu].
##
def _timeColumns(t, events):
    date = datetime.fromtimestamp(t / 1000)

    return [date.strftime("%d/%m/%Y"), date.strftime("%H:%M:%S"), t, matchMinute(events, t)]



##
# @brief Retourne les historiques d'un type de mesure.
#
# @return list Liste de (identifiant, nom, historique [[timestamp, valeur], …]).
##
def _measures(kind, supporterList, stadiumBleacherList):
    if kind == "cardiaque":
        return [(s.getId(), s.getName(), s.heartRate.getHistory()) for s in supporterList]
    if kind == "vibration":
        return [(b.getId(), b.getName(), b.accelerometer.getHistory()) for b in stadiumBleacherList]
    if kind == "acoustique":
        return [(b.getId(), b.getName(), b.acoustic.getHistory()) for b in stadiumBleacherList]

    return []



##
# @brief Nom affiché d'un évènement (avec l'équipe pour un but).
##
def _eventLabel(event, teams):
    team = teams.get(event["team"]) if event["team"] is not None else None

    return f"{event['name']} ({team})" if team else event["name"]



##
# @brief Écrit le fichier "ensemble" : une ligne par seconde, une colonne par donnée de chaque tribune et de chaque supporter, et une colonne des évènements.
#
# Si plusieurs mesures tombent dans la même seconde, la dernière est conservée.
# Une cellule vide signifie qu'aucune mesure n'a été reçue pour cette seconde.
##
def _writeTimeline(writer, supporterList, stadiumBleacherList, events, teams):
    columns = []
    for stadiumBleacher in sorted(stadiumBleacherList, key=lambda b: b.getId()):
        columns.append((f"Vibration {stadiumBleacher.getName()} (m/s²)", stadiumBleacher.accelerometer.getHistory()))
        columns.append((f"Acoustique {stadiumBleacher.getName()} (dB(A))", stadiumBleacher.acoustic.getHistory()))
    for supporter in sorted(supporterList, key=lambda s: s.getId()):
        columns.append((f"Cardiaque {supporter.getName()} (bpm)", supporter.heartRate.getHistory()))

    # Valeurs indexées par seconde
    values = []
    seconds = set()
    for _, history in columns:
        bySecond = {}
        for t, value in history:
            bySecond[t // 1000] = value
        values.append(bySecond)
        seconds.update(bySecond)

    eventsBySecond = {}
    for event in events:
        eventsBySecond.setdefault(event["t"] // 1000, []).append(_eventLabel(event, teams))
    seconds.update(eventsBySecond)

    writer.writerow(["Date", "Heure", "Timestamp (ms)", "Minute de jeu"] + [name for name, _ in columns] + ["Évènements"])

    if not seconds:
        return

    for second in range(min(seconds), max(seconds) + 1):
        row = _timeColumns(second * 1000, events)
        row += [_format(bySecond.get(second, "")) for bySecond in values]
        row.append(" / ".join(eventsBySecond.get(second, [])))
        writer.writerow(row)

    return

# =============================================================================
#  Fonctions
# =============================================================================

##
# @brief Construit le contenu d'un fichier CSV.
#
# @param kind                Type d'export (clé de EXPORTS).
# @param supporterList       Liste des supporters actifs.
# @param stadiumBleacherList Liste des tribunes actives.
# @param match               Match en cours (cf. getCurrentMatch()).
# @param events              Évènements du match (cf. getMatchEventList()).
#
# @return str Contenu du fichier CSV.
##
def buildCsv(kind, supporterList, stadiumBleacherList, match, events):
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";", lineterminator="\n")
    teams = {match["domicile"]["id"]: match["domicile"]["team"], match["exterieur"]["id"]: match["exterieur"]["team"]}

    if kind == "ensemble":
        _writeTimeline(writer, supporterList, stadiumBleacherList, events, teams)

    elif kind == "evenements":
        writer.writerow(["Date", "Heure", "Timestamp (ms)", "Minute de jeu", "Code", "Évènement", "Équipe"])
        for event in events:
            team = teams.get(event["team"]) if event["team"] is not None else None
            writer.writerow(_timeColumns(event["t"], events) + [event["code"], event["name"], team or ""])

    else:
        config = EXPORTS[kind]
        rows = []
        for idf, name, history in _measures(kind, supporterList, stadiumBleacherList):
            for t, value in history:
                rows.append((t, idf, name, value))
        rows.sort(key=lambda row: (row[0], row[1]))

        writer.writerow(["Date", "Heure", "Timestamp (ms)", "Minute de jeu", f"{config['source']} (id)", config["source"], config["value"]])
        for t, idf, name, value in rows:
            writer.writerow(_timeColumns(t, events) + [idf, name, _format(value)])

    return output.getvalue()
