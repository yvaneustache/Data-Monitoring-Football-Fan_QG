##
# @file replay.py
#
# @brief Rejeu d'un match à partir de son archive ZIP (cf. export.buildZip()).
#
# Lit les fichiers CSV de l'archive (vibration, cardiaque, acoustique, température, évènements)
# et, s'il est présent, le fichier match.json (équipes, codes des évènements, couleurs).
# Les matchs chargés sont conservés en mémoire, à part des données en direct. Leurs évènements
# peuvent être modifiés (ajout, déplacement, suppression) et le match réexporté en ZIP.
##

# =============================================================================
#  Import des bibliothèques
# =============================================================================

import csv
import io
import json
import uuid
import zipfile
from datetime import datetime

from Server.Utils.data import getColorOfSupporter, getColorOfStadiumBleacher
from Server.Utils.event import loadConfigurationInformation, TEXT_EVENT_CODES

# =============================================================================
#  Configuration
# =============================================================================

MAX_REPLAYS = 10 ##< @brief Nombre maximal de matchs chargés en mémoire (les plus anciens sont oubliés).

##
# @brief Fichiers de mesures de l'archive : type de données rejouées, type de source.
##
MEASURE_FILES = {
    "vibration":   ("accelerometer", "stadiumBleacher"),
    "acoustique":  ("acoustic",      "stadiumBleacher"),
    "temperature": ("temperature",   "stadiumBleacher"),
    "cardiaque":   ("heart_rate",    "supporter"),
}

PALETTE = ["#EA670B", "#2E86DE", "#27AE60", "#8E44AD", "#C0392B", "#16A085", "#D4AC0D", "#7F8C8D"] ##< @brief Couleurs des courbes dont la couleur est inconnue.

# =============================================================================
#  Matchs chargés
# =============================================================================

_replays = {} ##< @brief Matchs chargés : identifiant → données du rejeu.

# =============================================================================
#  Exception
# =============================================================================

##
# @class ReplayError
#
# @brief Archive de match illisible.
##
class ReplayError(Exception):
    pass

# =============================================================================
#  Fonctions internes
# =============================================================================

##
# @brief Lit un fichier CSV de l'archive (séparateur ";", virgule décimale).
#
# @return list Lignes sous forme de dictionnaires (clé = en-tête de colonne).
##
def _readCsv(archive, name):
    text = archive.read(name).decode("utf-8-sig")

    return list(csv.DictReader(io.StringIO(text), delimiter=";"))



##
# @brief Convertit une valeur du CSV en nombre (virgule décimale), None si la cellule est vide.
##
def _number(value):
    if value is None or value.strip() == "":
        return None

    return float(value.replace(",", "."))



##
# @brief Cherche le fichier de l'archive dont le nom se termine par le suffixe donné.
##
def _find(names, suffix):
    for name in names:
        if name.endswith(suffix):
            return name

    return None



##
# @brief Couleur d'une tribune ou d'un supporter : celle de match.json, sinon celle de la configuration, sinon une couleur de la palette.
##
def _color(colors, source, idf, index):
    if colors.get((source, idf)):
        return colors[(source, idf)]

    try:
        return getColorOfStadiumBleacher(idf) if source == "stadiumBleacher" else getColorOfSupporter(idf)
    except RuntimeError:
        return PALETTE[index % len(PALETTE)]



##
# @brief Lit les mesures d'un fichier CSV.
#
# @return list Liste de {"id", "name", "color", "history": [[timestamp en ms, valeur], …]} triée par identifiant.
##
def _readMeasures(rows, source, colors):
    series = {}

    for row in rows:
        values = list(row.values())
        if len(values) < 7:
            continue

        idf, name, value = int(values[4]), values[5], _number(values[6])
        if value is None:
            continue

        entry = series.setdefault(idf, {"id": idf, "name": name, "history": []})
        entry["history"].append([int(values[2]), value])

    result = sorted(series.values(), key=lambda entry: entry["id"])
    for index, entry in enumerate(result):
        entry["color"] = _color(colors, source, entry["id"], index)
        entry["history"].sort(key=lambda point: point[0])

    return result



##
# @brief Lit les évènements de evenements.csv (si match.json est absent).
#
# Les équipes ne sont connues que par leur nom : les buts sont rattachés à l'équipe par son nom.
##
def _readEvents(rows):
    names = {}
    for category in loadConfigurationInformation():
        for event in category["event"]:
            names[event["code"]] = event["name"]

    events = []
    for index, row in enumerate(rows):
        values = list(row.values())
        if len(values) < 6:
            continue

        code = int(values[4])
        events.append({"id": index + 1, "code": code, "name": values[5] or names.get(code, f"Évènement {code}"), "team": values[6] if len(values) > 6 and values[6] else None, "t": int(values[2])})

    return events

# =============================================================================
#  Fonctions
# =============================================================================

##
# @brief Charge l'archive ZIP d'un match et la garde en mémoire pour le rejeu.
#
# @param content  Contenu de l'archive (bytes).
# @param filename Nom du fichier chargé.
#
# @return str Identifiant du rejeu.
#
# @throws ReplayError Si l'archive n'est pas un ZIP de match lisible.
##
def loadReplay(content, filename):
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as e:
        raise ReplayError("Le fichier n'est pas une archive ZIP.") from e

    names = archive.namelist()

    try:
        information = {}
        infoName = _find(names, "match.json")
        if infoName:
            information = json.loads(archive.read(infoName).decode("utf-8"))

        colors = {}
        for item in information.get("stadiumBleachers", []):
            colors[("stadiumBleacher", item["id"])] = item.get("color")
        for item in information.get("supporters", []):
            colors[("supporter", item["id"])] = item.get("color")

        data = {}
        for kind, (dataType, source) in MEASURE_FILES.items():
            name = _find(names, f"_{kind}.csv")
            if name:
                series = _readMeasures(_readCsv(archive, name), source, colors)
                if series:
                    data[dataType] = series

        if "events" in information:
            events = information["events"]
        else:
            name = _find(names, "_evenements.csv")
            events = _readEvents(_readCsv(archive, name)) if name else []

    except (KeyError, ValueError, IndexError, UnicodeDecodeError) as e:
        raise ReplayError(f"Archive de match illisible : {e}") from e

    if not data and not events:
        raise ReplayError("L'archive ne contient aucune donnée de match (fichiers CSV de l'export).")

    events.sort(key=lambda event: event["t"])

    # Bornes du match : toutes les mesures et tous les évènements
    times = [event["t"] for event in events]
    for series in data.values():
        for entry in series:
            if entry["history"]:
                times += [entry["history"][0][0], entry["history"][-1][0]]

    replayId = uuid.uuid4().hex[:12]
    _replays[replayId] = {
        "id":        replayId,
        "filename":  filename,
        "loadedAt":  datetime.now().strftime("%d/%m/%Y %H:%M"),
        "match":     information.get("match"),
        "domicile":  information.get("domicile"),
        "exterieur": information.get("exterieur"),
        "date":      datetime.fromtimestamp(min(times) / 1000).strftime("%d/%m/%Y à %H:%M"),
        "start":     min(times),
        "end":       max(times),
        "events":    events,
        "data":      data,
    }

    # Les matchs les plus anciens sont oubliés
    while len(_replays) > MAX_REPLAYS:
        del _replays[next(iter(_replays))]

    return replayId



##
# @brief Retourne un match chargé.
#
# @param replayId Identifiant du rejeu.
#
# @return dict|None Données du rejeu, None s'il n'existe pas (ou plus).
##
def getReplay(replayId):
    return _replays.get(replayId)



##
# @brief Liste les matchs chargés, du plus récent au plus ancien.
#
# @return list Liste de {"id", "filename", "loadedAt", "match", "domicile", "exterieur", "date", "start", "end"}.
##
def getReplayList():
    keys = ["id", "filename", "loadedAt", "match", "domicile", "exterieur", "date", "start", "end"]

    return [{key: replay[key] for key in keys} for replay in reversed(list(_replays.values()))]



##
# @brief Noms des évènements, d'après event.json.
#
# @return dict Code → nom.
##
def _eventNames():
    names = {}
    for category in loadConfigurationInformation():
        for event in category["event"]:
            names[event["code"]] = event["name"]

    return names



##
# @brief Modifie les évènements d'un match chargé (sans toucher au match en cours).
#
# @param replayId Identifiant du rejeu.
# @param action   "addMatchEvent" ({"code", "t", "team", "name"}), "moveMatchEvent" ({"id", "t"}), "renameMatchEvent" ({"id", "name"}),
#                 "setMatchEventTeam" ({"id", "team"}) ou "deleteMatchEvent" (id).
# @param payload  Données de la modification.
#
# @return dict|None {"domicile", "exterieur", "events"} après modification, None si le rejeu n'existe pas.
#
# @throws ReplayError Si l'action est inconnue.
##
def modifyReplayEvents(replayId, action, payload):
    replay = _replays.get(replayId)
    if replay is None:
        return None

    events = replay["events"]

    if action == "addMatchEvent":
        code = int(payload["code"])
        team = payload.get("team")
        events.append({
            "id":   max((event["id"] for event in events), default=0) + 1,
            "code": code,
            "name": str(payload.get("name") or "") if code in TEXT_EVENT_CODES else _eventNames().get(code, f"Évènement {code}"),
            "team": int(team) if isinstance(team, (int, float)) else team,
            "t":    int(payload["t"]) // 1000 * 1000,
        })
    elif action == "moveMatchEvent":
        for event in events:
            if event["id"] == int(payload["id"]):
                event["t"] = int(payload["t"]) // 1000 * 1000
    elif action == "setMatchEventTeam":
        for event in events:
            if event["id"] == int(payload["id"]):
                event["team"] = payload.get("team")
    elif action == "renameMatchEvent":
        for event in events:
            if event["id"] == int(payload["id"]) and event["code"] in TEXT_EVENT_CODES:
                event["name"] = str(payload.get("name") or "")[:200]
    elif action == "deleteMatchEvent":
        replay["events"] = events = [event for event in events if event["id"] != int(payload)]
    else:
        raise ReplayError(f"Action inconnue : '{action}'")

    events.sort(key=lambda event: event["t"])

    return {"domicile": replay["domicile"], "exterieur": replay["exterieur"], "events": events}

##
# @brief Seuille une donnée d'un match chargé : les valeurs hors de [minimum, maximum] sont ramenées à ces bornes.
#
# Les données modifiées sont celles du rejeu en mémoire : le prochain téléchargement du ZIP les contient.
#
# @param replayId Identifiant du rejeu.
# @param dataType Type de données ("accelerometer", "acoustic", "temperature" ou "heart_rate").
# @param minimum  Borne basse.
# @param maximum  Borne haute.
#
# @return int|None Nombre de valeurs modifiées, None si le rejeu n'existe pas.
#
# @throws ReplayError Si les bornes sont invalides.
##
def clipReplayData(replayId, dataType, minimum, maximum):
    replay = _replays.get(replayId)
    if replay is None:
        return None

    minimum, maximum = float(minimum), float(maximum)
    if not minimum < maximum:
        raise ReplayError("La borne Min doit être inférieure à la borne Max.")

    modified = 0
    for entry in replay["data"].get(dataType, []):
        for point in entry["history"]:
            value = min(maximum, max(minimum, point[1]))
            if value != point[1]:
                point[1] = value
                modified += 1

    return modified

# =============================================================================
#  Réexport d'un match chargé
# =============================================================================

##
# @class _ReplayHistory
#
# @brief Historique d'une donnée rejouée, avec l'interface de MeasureHistory utilisée par l'export.
##
class _ReplayHistory:
    def __init__(self, history):
        self._history = history

    def getHistory(self):
        return self._history



##
# @class _ReplaySource
#
# @brief Tribune ou supporter d'un match rejoué, avec l'interface utilisée par l'export.
##
class _ReplaySource:
    def __init__(self, idf, name, color):
        self._id           = idf
        self._name         = name
        self._color        = color
        self.accelerometer = _ReplayHistory([])
        self.acoustic      = _ReplayHistory([])
        self.temperature   = _ReplayHistory([])
        self.heartRate     = _ReplayHistory([])

    def getId(self):
        return self._id

    def getName(self):
        return self._name

    def getColor(self):
        return self._color



##
# @brief Reconstruit les tribunes, les supporters et le match d'un rejeu pour l'export.
#
# @param replayId Identifiant du rejeu.
#
# @return tuple|None (supporters, tribunes, match, évènements), None si le rejeu n'existe pas.
##
def getReplayExport(replayId):
    replay = _replays.get(replayId)
    if replay is None:
        return None

    attributes = {"accelerometer": "accelerometer", "acoustic": "acoustic", "temperature": "temperature", "heart_rate": "heartRate"}
    sources = {"stadiumBleacher": {}, "supporter": {}}

    for dataType, series in replay["data"].items():
        kind = "supporter" if dataType == "heart_rate" else "stadiumBleacher"
        for entry in series:
            source = sources[kind].setdefault(entry["id"], _ReplaySource(entry["id"], entry["name"], entry["color"]))
            setattr(source, attributes[dataType], _ReplayHistory(entry["history"]))

    match = {
        "id":        replay["match"] if replay["match"] is not None else 0,
        "domicile":  replay["domicile"] or {"id": None, "team": None},
        "exterieur": replay["exterieur"] or {"id": None, "team": None},
    }

    return list(sources["supporter"].values()), list(sources["stadiumBleacher"].values()), match, replay["events"]
