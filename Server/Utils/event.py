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
from datetime import datetime

from Server.Config.setting import Config
from Server.Utils.logger import Logger

# =============================================================================
#  Création du logger
# =============================================================================

logger = Logger("Serveur/Event")

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
    matchId = postgresqlClient.fetch("SELECT id FROM match ORDER BY ts DESC LIMIT 1")
    if matchId:
        matchId = matchId[0]["id"]
        event = postgresqlClient.fetch("SELECT code FROM event WHERE match = %s ORDER BY ts DESC LIMIT 1", (matchId,))
        lastInformation = True if not event or event[0]["code"] != 12 else False
    if not matchId or not lastInformation:
        # Création d'un nouveaux match
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
        lastInformation = False;

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
# @return dict {"id": …, "ts": datetime, "domicile": {"id": …, "team": …}, "exterieur": {"id": …, "team": …}}.
##
def getCurrentMatch(postgresqlClient):
    match = postgresqlClient.fetch("SELECT id, ts FROM match ORDER BY ts DESC LIMIT 1")
    if not match:
        loadMatchInformation(postgresqlClient)
        match = postgresqlClient.fetch("SELECT id, ts FROM match ORDER BY ts DESC LIMIT 1")

    matchId = match[0]["id"]

    teams = {}
    for side in ["domicile", "exterieur"]:
        team = postgresqlClient.fetch(f"SELECT team.id, team.name FROM team, match WHERE match.id = %s AND match.{side} = team.id", (matchId,))
        teams[side] = {"id": team[0]["id"], "team": team[0]["name"]} if team else {"id": None, "team": None}

    return {"id": matchId, "ts": match[0].get("ts"), "domicile": teams["domicile"], "exterieur": teams["exterieur"]}



##
# @brief Retourne les évènements d'un match, horodatés en millisecondes et nommés d'après event.json.
#
# @param postgresqlClient Client PostgreSQL.
# @param matchId          Identifiant du match.
#
# @return list Liste de {"id", "code", "name", "team", "t"} triée par date.
##
def getMatchEventList(postgresqlClient, matchId):
    names = {}
    for category in loadConfigurationInformation():
        for event in category["event"]:
            names[event["code"]] = event["name"]

    events = postgresqlClient.fetch("SELECT id, code, ts, team FROM event WHERE match = %s ORDER BY ts", (matchId,))

    return [{"id": e["id"], "code": e["code"], "name": names.get(e["code"], f"Évènement {e['code']}"), "team": e["team"], "t": int(e["ts"].timestamp() * 1000)} for e in events]



##
# @brief Minute de jeu à un instant donné, d'après les évènements de phase de jeu.
#
# Même calcul que l'interface web : temps écoulé depuis le coup d'envoi (0'), depuis
# la reprise à partir de 45', puis depuis les prolongations à partir de 90' et 105'.
# Le temps additionnel s'écrit "45+2'". Entre deux périodes : "Mi-temps" ou "Pause".
#
# @param events Évènements du match (cf. getMatchEventList()), triés par date.
# @param t      Timestamp en millisecondes.
#
# @return str Minute de jeu, chaîne vide avant le coup d'envoi ou après la fin du match.
##
def matchMinute(events, t):
    starts = {1: 0, 3: 45, 5: 90, 7: 105}
    ends = {1: 45, 3: 90, 5: 105, 7: 120}
    reference = None
    base = 0
    state = None

    for event in events:
        if event["t"] > t:
            break

        if event["code"] in starts:
            reference = event["t"]
            base = starts[event["code"]]
            state = event["code"]
        elif event["code"] in (2, 6):
            state = "Mi-temps" if event["code"] == 2 else "Pause"
        elif event["code"] in (4, 8, 9, 10, 12):
            state = None

    if isinstance(state, str):
        return state
    if state is None or reference is None:
        return ""

    minute = base + int((t - reference) // 60000)
    end = ends[state]

    return f"{end}+{minute - end}'" if minute >= end else f"{minute}'"
