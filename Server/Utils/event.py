##
# @file event.py
#
# @brief Gestion des évènements.
##

# =============================================================================
#  Import des bibliothèques
# =============================================================================

import json
import os
import threading
from datetime import datetime

from Server.Config.setting import Config
from Server.Utils.logger import Logger

# =============================================================================
#  Création du logger
# =============================================================================

logger = Logger("Serveur/Event")

_matchLock = threading.Lock() ##< @brief Empêche deux requêtes simultanées de créer chacune un nouveau match.

# =============================================================================
#  Configuration
# =============================================================================

##
# @brief Charge une configuration de contôle d'évènement.
#
# @param config Le nom de la configuration à charger.
#
# @return La configuration de contrôle d'évènement.
##
def loadConfiguration(config):
    filePath = Config.PATH["data"] + "Event-Configuration/" + config + ".json"

    try:
        logger.info(f"[Event] Lecture du fichier de configuration : '{filePath}'")

        with open(filePath, "r") as file:
            return json.load(file)

    except FileNotFoundError:
        message = f"[Event] Fichier de configuration introuvable : '{filePath}'"
        logger.error(message)
        raise RuntimeError(message)

    except json.JSONDecodeError as e:
        message = f"[Event] Fichier de configuration invalide (JSON malformé) : '{filePath}'"
        logger.error(message)
        raise RuntimeError(message) from e

    return ""



##
# @brief Charge les information des configurations de contôle d'évènement.
#
# @return Les information des configurations de contrôle d'évènement.
##
def loadConfigurationInformation():
    filePath = Config.PATH["data"] + "event.json"

    try:
        logger.info(f"[Event] Lecture du fichier d'information des configuration : '{filePath}'")

        with open(filePath, "r") as file:
            return json.load(file)

    except FileNotFoundError:
        message = f"[Event] Fichier d'information des configuration introuvable : '{filePath}'"
        logger.error(message)
        raise RuntimeError(message)

    except json.JSONDecodeError as e:
        message = f"[Event] Fichier d'information des configuration invalide (JSON malformé) : '{filePath}'"
        logger.error(message)
        raise RuntimeError(message) from e

    return ""



##
# @brief Renvoi la liste des configurations de contrôle d'évènement.
#
# @return La liste des configurations de contrôle d'évènement.
##
def getConfigurationList():
	configurationList = []
	
	for file in os.listdir(Config.PATH["data"] + "Event-Configuration"):
		config = loadConfiguration(file.replace(".json", ""))
		configurationList.append(config["name"])

	logger.info(f"[Event] Liste des configuration: {configurationList}")

	return configurationList



##
# @brief Créer une nouvelle configuration d'évènement.
#
# @param confg            Nouvelle configuration à créé.
# @param matchInformation Enregistre des informations d'avant match.
#
# @return True si la nouvelle configuration à été créé.
# @retrun False sinon.
##
def createNewEventConfiguration(config, matchInfomation):
    configurationList = getConfigurationList()

    name = json.loads(config)["name"]
    for configuration in configurationList:
        if configuration == name:
            return False

    logger.info(f"[Event] Configuration à sauvegarder: {config}")

    filePath = Config.PATH["data"] + "Event-Configuration/" + name + ".json"
    with open(filePath, 'w') as f:
        f.write(config)

    matchInfomation["config"] = name;

    return True

# =============================================================================
#  Données d'avant match
# =============================================================================

##
# @brief Charge les informations d'avant match.
#
# @param postgresqlClient Client PostgreSQL.
#
# @return Les informations d'avant match et si les dernières informatons sont valide.
##
def loadMatchInformation(postgresqlClient):
    with _matchLock:
        return _loadMatchInformation(postgresqlClient)



##
# @brief Crée un match vide (deux équipes et leurs joueurs, sans nom), qui devient le match en cours.
#
# @param postgresqlClient Client PostgreSQL.
#
# @return int Identifiant du match créé.
##
def _createMatch(postgresqlClient):
    matchId = postgresqlClient.execute("INSERT INTO match (ts) VALUES (%s) RETURNING id", (datetime.now().strftime("%Y/%m/%d %H:%M:%S"),), returning=True)["id"]
    domicileId = postgresqlClient.execute("INSERT INTO team (name) VALUES (NULL) RETURNING id", returning=True)["id"]
    exterieurId = postgresqlClient.execute("INSERT INTO team (name) VALUES (NULL) RETURNING id", returning=True)["id"]
    domicilePlayerId = []
    for _ in range(20):
        domicilePlayerId.append(postgresqlClient.execute("INSERT INTO player (name) VALUES (NULL) RETURNING id", returning=True)["id"])
    exterieurPlayerId = []
    for _ in range(20):
        exterieurPlayerId.append(postgresqlClient.execute("INSERT INTO player (name) VALUES (NULL) RETURNING id", returning=True)["id"])
    postgresqlClient.execute("UPDATE match SET domicile = %s, exterieur = %s WHERE id = %s", (domicileId, exterieurId, matchId))
    for idf in domicilePlayerId:
        postgresqlClient.execute("UPDATE player SET team = %s WHERE id = %s", (domicileId, idf))
    for idf in exterieurPlayerId:
        postgresqlClient.execute("UPDATE player SET team = %s WHERE id = %s", (exterieurId, idf))

    logger.info(f"[Event] Création du match id={matchId}")

    return matchId



##
# @brief Crée un nouveau match, qui devient le match en cours (bouton « Nouveau match » de la préparation).
#
# Le match précédent et ses évènements sont conservés dans la base.
#
# @param postgresqlClient Client PostgreSQL.
#
# @return int Identifiant du match créé.
##
def createNewMatch(postgresqlClient):
    with _matchLock:
        return _createMatch(postgresqlClient)



##
# @brief Corps de loadMatchInformation(), exécuté sous verrou.
##
def _loadMatchInformation(postgresqlClient):
    # Dernier match : à date égale, le plus récent identifiant
    matchId = postgresqlClient.fetch("SELECT id FROM match ORDER BY ts DESC, id DESC LIMIT 1")
    if matchId:
        matchId = matchId[0]["id"]
        event = postgresqlClient.fetch("SELECT code FROM event WHERE match = %s ORDER BY ts DESC LIMIT 1", (matchId,))
        lastInformation = True if not event or event[0]["code"] != 12 else False
    if not matchId or not lastInformation:
        matchId = _createMatch(postgresqlClient)
        lastInformation = False

    matchInformation = {"domicile": {"player": []}, "exterieur": {"player": []}}
    matchInformation["id"] = matchId
    config = postgresqlClient.fetch("SELECT config FROM match WHERE id = %s", (matchId,))
    matchInformation["config"] = config[0]["config"] if config and config[0]["config"] else "Default"
    stadium = postgresqlClient.fetch("SELECT stadium FROM match WHERE id = %s", (matchId,))
    matchInformation["stadium"] = stadium[0]["stadium"]
    domicileTeam = postgresqlClient.fetch("SELECT team.name, team.id FROM team, match WHERE match.id = %s AND match.domicile = team.id", (matchId,))
    matchInformation["domicile"]["team"] = domicileTeam[0]["name"]
    matchInformation["domicile"]["id"] = domicileTeam[0]["id"]
    domicileCoach = postgresqlClient.fetch("SELECT team.coach FROM team, match WHERE match.id = %s AND match.domicile = team.id", (matchId,))
    matchInformation["domicile"]["coach"] = domicileCoach[0]["coach"]
    exterieurTeam = postgresqlClient.fetch("SELECT team.name, team.id FROM team, match WHERE match.id = %s AND match.exterieur = team.id", (matchId,))
    matchInformation["exterieur"]["team"] = exterieurTeam[0]["name"]
    matchInformation["exterieur"]["id"] = exterieurTeam[0]["id"]
    exterieurCoach = postgresqlClient.fetch("SELECT team.coach FROM team, match WHERE match.id = %s AND match.exterieur = team.id", (matchId,))
    matchInformation["exterieur"]["coach"] = exterieurCoach[0]["coach"]
    domicilePlayer = postgresqlClient.fetch("SELECT player.name, player.player_number, player.id FROM player, team, match WHERE match.id = %s AND match.domicile = team.id AND team.id = player.team", (matchId,))
    exterieurPlayer = postgresqlClient.fetch("SELECT player.name, player.player_number, player.id FROM player, team, match WHERE match.id = %s AND match.exterieur = team.id AND team.id = player.team", (matchId,))
    for i in range(20):
        matchInformation["domicile"]["player"].append({"name": domicilePlayer[i]["name"], "number": domicilePlayer[i]["player_number"], "id": domicilePlayer[i]["id"]})
    for i in range(20):
        matchInformation["exterieur"]["player"].append({"name": exterieurPlayer[i]["name"], "number": exterieurPlayer[i]["player_number"], "id": exterieurPlayer[i]["id"]})

    logger.info(f"[Event] Chargement des informations du match: {matchInformation}")

    return matchInformation, lastInformation




##
# @brief Retourne le match affiché sur les graphiques : le dernier match enregistré.
#
# Contrairement à loadMatchInformation(), aucun nouveau match n'est créé quand le
# dernier est terminé (évènement "Fin du match") : ses évènements restent affichés.
# Un nouveau match est créé seulement s'il n'en existe aucun, ou depuis la page /event.
#
# @param postgresqlClient Client PostgreSQL.
#
# @return dict {"id": …, "ts": datetime, "stadium": str|None, "domicile": {"id": …, "team": …}, "exterieur": {"id": …, "team": …}}.
##
def getCurrentMatch(postgresqlClient):
    match = postgresqlClient.fetch("SELECT id, ts, stadium FROM match ORDER BY ts DESC, id DESC LIMIT 1")
    if not match:
        loadMatchInformation(postgresqlClient)
        match = postgresqlClient.fetch("SELECT id, ts, stadium FROM match ORDER BY ts DESC, id DESC LIMIT 1")

    matchId = match[0]["id"]

    teams = {}
    for side in ["domicile", "exterieur"]:
        team = postgresqlClient.fetch(f"SELECT team.id, team.name FROM team, match WHERE match.id = %s AND match.{side} = team.id", (matchId,))
        teams[side] = {"id": team[0]["id"], "team": team[0]["name"]} if team else {"id": None, "team": None}

    return {"id": matchId, "ts": match[0].get("ts"), "stadium": match[0].get("stadium"), "domicile": teams["domicile"], "exterieur": teams["exterieur"]}



##
# @brief Retourne les évènements d'un match, horodatés en millisecondes et nommés d'après event.json.
#
# @param postgresqlClient Client PostgreSQL.
# @param matchId          Identifiant du match.
#
# @return list Liste de {"id", "code", "name", "team", "t"} triée par date.
##
FREE_EVENT_CODE = 99 ##< @brief Code d'un évènement libre : son nom est le texte saisi (colonne "detail").
SYNC_EVENT_CODE = 98 ##< @brief Code d'un recalage vidéo (rejeu) : son texte est le temps de la vidéo à cet instant.
TEXT_EVENT_CODES = (FREE_EVENT_CODE, SYNC_EVENT_CODE) ##< @brief Évènements dont le texte est saisi.



def getMatchEventList(postgresqlClient, matchId):
    names = {}
    for category in loadConfigurationInformation():
        for event in category["event"]:
            names[event["code"]] = event["name"]

    events = postgresqlClient.fetch("SELECT id, code, ts, team, detail FROM event WHERE match = %s ORDER BY ts", (matchId,))

    return [{"id": e["id"], "code": e["code"], "name": _eventName(names, e["code"], e.get("detail")), "team": e["team"], "t": int(e["ts"].timestamp() * 1000)} for e in events]



##
# @brief Nom affiché d'un évènement : texte saisi pour un évènement libre, sinon nom de la configuration.
##
def _eventName(names, code, detail):
    if code in TEXT_EVENT_CODES:
        return detail or ""

    return names.get(code, f"Évènement {code}")



PERIOD_STARTS = {1: 0, 3: 45, 5: 90, 7: 105}   ##< @brief Coups d'envoi des périodes et minute de départ.
PERIOD_ENDS   = {1: 45, 3: 90, 5: 105, 7: 120} ##< @brief Minute de fin réglementaire de chaque période.
STOP_CODE     = 34                              ##< @brief Code de l'évènement "Arrêt du jeu" (chrono arrêté).
RESTART_CODE  = 35                              ##< @brief Code de l'évènement "Reprise du jeu" (chrono relancé).



##
# @brief État du chrono du match à un instant donné, d'après les évènements de phase de jeu.
#
# Même calcul que l'interface web : temps écoulé depuis le coup d'envoi de la période en cours,
# sans les arrêts de jeu (entre "Arrêt du jeu" et "Reprise du jeu").
#
# @param events Évènements du match (cf. getMatchEventList()), triés par date.
# @param t      Timestamp en millisecondes.
#
# @return dict {"state": code du coup d'envoi de la période en cours, "Mi-temps", "Pause" ou None,
#               "base": minute de départ de la période, "elapsed": temps joué dans la période (ms),
#               "stopped": chrono arrêté}.
##
def matchClock(events, t):
    reference = None
    base      = 0
    state     = None
    paused    = 0
    stopStart = None

    for event in events:
        if event["t"] > t:
            break

        code = event["code"]
        if code in PERIOD_STARTS:
            reference = event["t"]
            base      = PERIOD_STARTS[code]
            state     = code
            paused    = 0
            stopStart = None
        elif code == STOP_CODE and isinstance(state, int) and stopStart is None:
            stopStart = event["t"]
        elif code == RESTART_CODE and stopStart is not None:
            paused   += event["t"] - stopStart
            stopStart = None
        elif code in (2, 6):
            state     = "Mi-temps" if code == 2 else "Pause"
            stopStart = None
        elif code in (4, 8, 9, 10, 12):
            state     = None
            stopStart = None

    elapsed = 0
    if isinstance(state, int) and reference is not None:
        elapsed = (stopStart if stopStart is not None else t) - reference - paused

    return {"state": state, "base": base, "elapsed": elapsed, "stopped": stopStart is not None}



##
# @brief Minute de jeu à un instant donné, d'après les évènements de phase de jeu.
#
# Temps joué depuis le coup d'envoi (0'), depuis la reprise à partir de 45', puis depuis les
# prolongations à partir de 90' et 105', sans les arrêts de jeu (la minute est figée pendant un arrêt).
# Le temps additionnel s'écrit "45+2'". Entre deux périodes : "Mi-temps" ou "Pause".
#
# @param events Évènements du match (cf. getMatchEventList()), triés par date.
# @param t      Timestamp en millisecondes.
#
# @return str Minute de jeu, chaîne vide avant le coup d'envoi ou après la fin du match.
##
def matchMinute(events, t):
    clock = matchClock(events, t)
    state = clock["state"]

    if isinstance(state, str):
        return state
    if state is None:
        return ""

    minute = clock["base"] + int(clock["elapsed"] // 60000)
    end    = PERIOD_ENDS[state]

    return f"{end}+{minute - end}'" if minute >= end else f"{minute}'"
