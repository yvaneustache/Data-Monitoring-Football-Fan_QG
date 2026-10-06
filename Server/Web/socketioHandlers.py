##
# @file socketioHandlers.py
#
# @brief Enregistrement des gestionnaires d'événements SocketIO de l'interface web.
#
# Déclare les handlers pour les événements "getSupporter", "getSupporterData" et "getSupporterDataAll" émis par les clients web.
##

# =============================================================================
#  Import des bibliothèques
# =============================================================================

import json
from flask_socketio import emit
from datetime import datetime, timedelta

from Server.Config.setting import Config
from Server.Utils.data import createSupporterHeartRateForClient, getNameOfSupporter, getColorOfSupporter, createStadiumBleacherAccelerometerForClient, createStadiumBleacherAcousticForClient, getNameOfStadiumBleacher, getColorOfStadiumBleacher, createTrackerPositionForClient, getNameOfTracker, getColorOfTracker, getZoneOfTracker
from Server.Utils.event import createNewEventConfiguration, getCurrentMatch, getMatchEventList
from Server.Utils.logger import Logger

# =============================================================================
#  Création du logger
# =============================================================================

logger = Logger("Serveur/SocketIO")

PHASE_EVENT_CODES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 32, 33, 34, 35, 36, 37, 38] ##< @brief Codes des évènements sans minute de jeu (phases de jeu, interventions extérieures).

# =============================================================================
#  Enregistrement des gestionnaires SocketIO
# =============================================================================

##
# @brief Enregistre tous les gestionnaires d'événements SocketIO.
#
# @param socketio            Instance SocketIO de l'application.
# @param supporterList       Liste partagée des objets Supporter actifs.
# @param stadiumBleacherList Liste partagée des objets StadiumBleacher actifs.
# @param trackerList         Liste partagée des objets Tracker actifs.
# @param postgresqlClient    Client PosgreSQL.
##
def registerSocketioHandlers(socketio, supporterList, stadiumBleacherList, trackerList, postgresqlClient):

# =============================================================================
#  Liste des supporters
# =============================================================================

    ##
    # @brief Envoie la liste de tous les supporters actifs au client.
    ##
    @socketio.on("getSupporter")
    def handleGetSupporter():
        logger.info("[SocketIO] Réception de 'getSupporter'")

        payload = [{"id": s.supporterId, "name": s.name, "color": getColorOfSupporter(s.supporterId)} for s in supporterList]
        emit("getSupporterResponse", payload)

        return

# =============================================================================
#  Données d'un supporter spécifique
# =============================================================================

    ##
    # @brief Envoie les données complètes d'un supporter (heartRate, average, minimum, maximum).
    #
    # @param supporterId Identifiant du supporter demandé.
    ##
    @socketio.on("getSupporterHeartRate")
    def handleGetSupporterHeartRate(supporterId):
        logger.info(f"[SocketIO] Réception de 'getSupporterHeartRate' pour le supporter id={supporterId}")

        name  = getNameOfSupporter(supporterId)
        color = getColorOfSupporter(supporterId)

        for supporter in supporterList:
            if supporter.getId() == int(supporterId):
                payload = createSupporterHeartRateForClient(supporterId, name, color, supporter.heartRate.getHeartRate())
                payload.update({
                    "average": supporter.heartRate.getAverage(),
                    "minimum": supporter.heartRate.getMinimum(),
                    "maximum": supporter.heartRate.getMaximum(),
                    "history": supporter.heartRate.getHistory(),
                })

                emit("getSupporterHeartRateResponse", payload)
                return

        logger.warning(f"[SocketIO] Aucun supporter trouvé avec l'id={supporterId}")

        return

# =============================================================================
#  Données de tous les supporters
# =============================================================================

    ##
    # @brief Envoie la liste des dernières fréquences cardiaques de tous les supporters actifs.
    ##
    @socketio.on("getSupporterHeartRateAll")
    def handleGetSupporterHeartRateAll():
        logger.info("[SocketIO] Réception de 'getSupporterHeartRateAll'")

        payload = []
        for supporter in supporterList:
            name  = getNameOfSupporter(supporter.getId())
            color = getColorOfSupporter(supporter.getId())
            data  = createSupporterHeartRateForClient(supporter.getId(), name, color, supporter.heartRate.getHeartRate())
            data["history"] = supporter.heartRate.getHistory()
            payload.append(data)

        emit("getSupporterHeartRateAllResponse", payload)

        return

# =============================================================================
#  Liste des tribunes
# =============================================================================

    ##
    # @brief Envoie la liste de toutes les tribunes actives au client.
    ##
    @socketio.on("getStadiumBleacher")
    def handleGetStadiumBleacher():
        logger.info("[SocketIO] Réception de 'getStadiumBleacher'")

        payload = [{"id": b.stadiumBleacherId, "name": b.name, "color": getColorOfStadiumBleacher(b.stadiumBleacherId)} for b in stadiumBleacherList]
        emit("getStadiumBleacherResponse", payload)

        return

# =============================================================================
#  Données d'une tribune spécifique
# =============================================================================

    ##
    # @brief Envoie les données complètes d'une tribune (accelerometer, average, minimum, maximum).
    #
    # @param stadiumBleacherId Identifiant de la tribune demandé.
    ##
    @socketio.on("getStadiumBleacherAccelerometer")
    def handleGetStadiumBleacherAccelerometer(stadiumBleacherId):
        logger.info(f"[SocketIO] Réception de 'getStadiumBleacherAccelerometer' pour la tribune id={stadiumBleacherId}")

        name  = getNameOfStadiumBleacher(stadiumBleacherId)
        color = getColorOfStadiumBleacher(stadiumBleacherId)

        for stadiumBleacher in stadiumBleacherList:
            if stadiumBleacher.getId() == int(stadiumBleacherId):
                payload = createStadiumBleacherAccelerometerForClient(stadiumBleacherId, name, color, stadiumBleacher.accelerometer.getAccelerometer())
                payload.update({
                    "average": stadiumBleacher.accelerometer.getAverage(),
                    "minimum": stadiumBleacher.accelerometer.getMinimum(),
                    "maximum": stadiumBleacher.accelerometer.getMaximum(),
                    "history": stadiumBleacher.accelerometer.getHistory(),
                })

                emit("getStadiumBleacherAccelerometerResponse", payload)
                return

        logger.warning(f"[SocketIO] Aucune tribune trouvé avec l'id={stadiumBleacherId}")

        return



    ##
    # @brief Envoie les données complètes d'une tribune (acoustic, average, minimum, maximum).
    #
    # @param stadiumBleacherId Identifiant de la tribune demandé.
    ##
    @socketio.on("getStadiumBleacherAcoustic")
    def handleGetStadiumBleacherAcoustic(stadiumBleacherId):
        logger.info(f"[SocketIO] Réception de 'getStadiumBleacherAcoustic' pour la tribune id={stadiumBleacherId}")

        name  = getNameOfStadiumBleacher(stadiumBleacherId)
        color = getColorOfStadiumBleacher(stadiumBleacherId)

        for stadiumBleacher in stadiumBleacherList:
            if stadiumBleacher.getId() == int(stadiumBleacherId):
                payload = createStadiumBleacherAcousticForClient(stadiumBleacherId, name, color, stadiumBleacher.acoustic.getAcoustic())
                payload.update({
                    "average": stadiumBleacher.acoustic.getAverage(),
                    "minimum": stadiumBleacher.acoustic.getMinimum(),
                    "maximum": stadiumBleacher.acoustic.getMaximum(),
                    "history": stadiumBleacher.acoustic.getHistory(),
                })

                emit("getStadiumBleacherAcousticResponse", payload)
                return

        logger.warning(f"[SocketIO] Aucune tribune trouvé avec l'id={stadiumBleacherId}")

        return

# =============================================================================
#  Données de toutes les tribunes
# =============================================================================

    ##
    # @brief Envoie la liste des dernières mesure de l'accéléromètre de toutes les tribunes actives.
    ##
    @socketio.on("getStadiumBleacherAccelerometerAll")
    def handleGetStadiumBleacherAccelerometerAll():
        logger.info("[SocketIO] Réception de 'getStadiumBleacherAccelerometerAll'")

        payload = []
        for stadiumBleacher in stadiumBleacherList:
            name  = getNameOfStadiumBleacher(stadiumBleacher.getId())
            color = getColorOfStadiumBleacher(stadiumBleacher.getId())
            data  = createStadiumBleacherAccelerometerForClient(stadiumBleacher.getId(), name, color, stadiumBleacher.accelerometer.getAccelerometer())
            data["history"] = stadiumBleacher.accelerometer.getHistory()
            payload.append(data)

        emit("getStadiumBleacherAccelerometerAllResponse", payload)

        return



    ##
    # @brief Envoie la liste des dernières mesure acoustique de toutes les tribunes actives.
    ##
    @socketio.on("getStadiumBleacherAcousticAll")
    def handleGetStadiumBleacherAcousticAll():
        logger.info("[SocketIO] Réception de 'getStadiumBleacherAcousticAll'")

        payload = []
        for stadiumBleacher in stadiumBleacherList:
            name  = getNameOfStadiumBleacher(stadiumBleacher.getId())
            color = getColorOfStadiumBleacher(stadiumBleacher.getId())
            data  = createStadiumBleacherAcousticForClient(stadiumBleacher.getId(), name, color, stadiumBleacher.acoustic.getAcoustic())
            data["history"] = stadiumBleacher.acoustic.getHistory()
            payload.append(data)

        emit("getStadiumBleacherAcousticAllResponse", payload)

        return

# =============================================================================
#  Liste des trackers
# =============================================================================

    ##
    # @brief Envoie la liste de tous les trackers actifs au client.
    ##
    @socketio.on("getTracker")
    def handleGetTracker():
        logger.info("[SocketIO] Réception de 'getTracker'")

        payload = [{"id": t.trackerId, "name": t.trackingName, "color": getColorOfTracker(t.trackerId)} for t in trackerList]
        socketio.emit("getTrackerResponse", payload)

        return

# =============================================================================
#  Données d'un tracker spécifique
# =============================================================================

    ##
    # @brief Envoie les données complètes d'un tracker (position, zone, lastPositions).
    #
    # @param trackerId Identifiant du tracker demandé.
    ##
    @socketio.on("getTrackerPosition")
    def handleGetTrackerPosition(trackerId):
        logger.info(f"[SocketIO] Réception de 'getTrackerPosition' pour le tracker id={trackerId}")

        name  = getNameOfTracker(trackerId)
        color = getColorOfTracker(trackerId)
        zone  = getZoneOfTracker(trackerId)

        for tracker in trackerList:
            if tracker.getId() == int(trackerId):
                payload = createTrackerPositionForClient(trackerId, name, color, tracker.getPosition())
                payload.update({
                    "zone": zone,
                    "lastPositions": tracker.getLastPositions(),
                })
                socketio.emit("getTrackerPositionResponse", payload)
                return

        logger.warning(f"[SocketIO] Aucun tracker trouvé avec l'id={trackerId}")

        return

# =============================================================================
#  Données d'avant match
# =============================================================================
    
    ##
    # @brief Réception des infomations d'avant match
    #
    # @param data  Informations d'avant match.
    ##
    @socketio.on("matchInformation")
    def handleMatchInformation(data):
        logger.info("[SocketIO] Réception de 'matchInformation'")
        logger.info(f"[SocketIO] Mise à jour des données d'avant match : {data}")
        data = json.loads(data)

        for player in data["domicile"]["player"]:
            try:
                player["number"] = int(player["number"])
            except:
                player["number"] = 0
            postgresqlClient.execute("UPDATE player SET team = %s, name = %s, player_number = %s WHERE id = %s", (int(data["domicile"]["id"]), player["name"], player["number"], int(player["id"])))
        for player in data["exterieur"]["player"]:
            try:
                player["number"] = int(player["number"])
            except:
                player["number"] = 0
            postgresqlClient.execute("UPDATE player SET team = %s, name = %s, player_number = %s WHERE id = %s", (int(data["exterieur"]["id"]), player["name"], player["number"], int(player["id"])))
        postgresqlClient.execute("UPDATE team SET name = %s, coach = %s WHERE id = %s", (data["domicile"]["team"], data["domicile"]["coach"], int(data["domicile"]["id"])))
        postgresqlClient.execute("UPDATE team SET name = %s, coach = %s WHERE id = %s", (data["exterieur"]["team"], data["exterieur"]["coach"], int(data["exterieur"]["id"])))
        postgresqlClient.execute("UPDATE match SET domicile = %s, exterieur = %s, config = %s, stadium = %s WHERE id = %s", (int(data["domicile"]["id"]), int(data["exterieur"]["id"]), data["config"], data["stadium"], int(data["id"])));

        return



    ##
    # @brief Réception d'une nouvelle configuration d'évènements.
    #
    # @param config Configuration à enregistrer.
    ##
    @socketio.on("saveConfiguration")
    def handleSaveConfiguration(config):
        logger.info("[SocketIO] Réception de 'saveConfiguration'");

        if createNewEventConfiguration(config, matchInformation):
            socketio.emit("getSaveConfiguration");
        else:
            socketio.emit("getSaveConfigurationError");

        return

# =============================================================================
#  Données d'évènements
# =============================================================================

    ##
    # @brief Envoi les données complètes des évènements du match.
    ##
    @socketio.on("getEventAll")
    def handleGetEventAll(matchId):
        logger.info("[SocketIO] Réception de 'getEventAll'")

        events = postgresqlClient.fetch("SELECT * FROM event WHERE match = %s ORDER BY ts", (matchId,))

        for event in events:
            event["ts"] = event["ts"].strftime("%Y/%m/%d %H:%M:%S");

        socketio.emit("getEventAllResponse", events);
        
        return

    ##
    # @brief Réception d'un nouvel évènement.
    ##
    @socketio.on("newEvent")
    def handleNewEvent(code, matchId):
        logger.info(f"[SocketIO] Réception de 'newEvent': code:{code}, matchId:{matchId}")

        ts = datetime.now().strftime("%Y/%m/%d %H:%M:%S")

        # Calcul de la minute de jeu
        reference = None
        if code not in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 32, 33, 34, 35, 36, 37, 38]:
            events = postgresqlClient.fetch("SELECT code, ts FROM event WHERE match = %s ORDER BY ts DESC", (matchId,))
            for event in events:
                delta = datetime.strptime(ts, "%Y/%m/%d %H:%M:%S") - event["ts"]
                minute =  delta.total_seconds() // 60
                if event["code"] == 7:
                    reference = 106 + minute
                    break
                elif event["code"] == 5:
                    reference = 91 + minute
                    break
                elif event["code"] == 3:
                    reference = 46 + minute
                    break
                elif event["code"] == 1:
                    reference = 1 + minute
                    break

        idf = postgresqlClient.execute("INSERT INTO event (code, ts, match_minute, match) VALUES (%s, %s, %s, %s) RETURNING id", (code, ts, reference, matchId), returning=True)["id"]

        socketio.emit("newEventResponse", {"id": idf, "ts": ts, "match_minute": reference})

        return




    ##
    # @brief Suppression d'un évènement.
    #
    # @param idf Identifiant de l'évènement.
    ##
    @socketio.on("deleteEvent")
    def handleDeleteEvent(idf):
        logger.info(f"[SocketIO] Réception de 'deleteEvent': id:{idf}")

        postgresqlClient.execute("DELETE FROM event WHERE id = %s", (idf,))

        return



    ##
    # @brief Modification d'un évènement.
    #
    # @param idf  Identifiant de l'évènement.
    # @param data Données modifiées.
    ##
    @socketio.on("modifyEvent")
    def handleModifyEvent(idf, data):
        def toInt(value):
            try:
                return int(value)
            except (TypeError, ValueError):
                return None

        logger.info(f"[SocketIO] Réception de 'modifyEvent': id:{idf} données:{data}")
        data = json.loads(data)

        # Vérifie la cohérence entre le timestamp et la minute de jeu
        lastData = postgresqlClient.fetch("SELECT ts, match_minute FROM event WHERE id = %s", (idf,))
        logger.warning(f"{lastData}")
        events = postgresqlClient.fetch("SELECT code, ts FROM event WHERE match = %s ORDER BY ts DESC", (toInt(data["match"]),))

        if lastData[0]["match_minute"] != toInt(data["match_minute"]) and toInt(data["match_minute"]):
            for event in events:
                if event["code"] == 7:
                    data["ts"] = (event["ts"] + timedelta(minutes=toInt(data["match_minute"]) - 106)).strftime("%Y/%m/%d %H:%M:%S")
                    break
                elif event["code"] == 5:
                    data["ts"] = (event["ts"] + timedelta(minutes=toInt(data["match_minute"]) - 91)).strftime("%Y/%m/%d %H:%M:%S")
                    break
                elif event["code"] == 3:
                    data["ts"] = (event["ts"] + timedelta(minutes=toInt(data["match_minute"]) - 46)).strftime("%Y/%m/%d %H:%M:%S")
                    break
                elif event["code"] == 1:
                    data["ts"] = (event["ts"] + timedelta(minutes=toInt(data["match_minute"]) - 1)).strftime("%Y/%m/%d %H:%M:%S")
                    break

        elif lastData[0]["ts"].strftime("%Y/%m/%d %H:%M:%S") != data["ts"]:
            for event in events:
                delta = datetime.strptime(data["ts"], "%Y/%m/%d %H:%M:%S") - event["ts"]
                minute =  delta.total_seconds() // 60
                if event["code"] == 7:
                    data["match_minute"] = 106 + minute
                    break
                elif event["code"] == 5:
                    data["match_minute"] = 91 + minute
                    break
                elif event["code"] == 3:
                    data["match_minute"] = 46 + minute
                    break
                elif event["code"] == 1:
                    data["match_minute"] = 1 + minute
                    break

        logger.warning(f"{data['ts']}")
        logger.warning(f"{data['match_minute']}")

        postgresqlClient.execute("UPDATE event SET ts = %s, minute_number = %s, match_minute = %s, team = %s, player = %s, offending_player = %s, victim_player = %s, out_player = %s, in_player = %s, detail = %s, match = %s WHERE id = %s",(data["ts"], toInt(data["minute_number"]), toInt(data["match_minute"]), toInt(data["team"]), toInt(data["player"]), toInt(data["offending_player"]), toInt(data["victim_player"]), toInt(data["out_player"]), toInt(data["in_player"]), data["detail"], toInt(data["match"]), idf))

        a = postgresqlClient.fetch("SELECT * FROM event WHERE id = %s", (idf,))
        logger.warning(f"{a}")

        socketio.emit("modifyEventResponse", {"id": idf, "ts": data["ts"], "match_minute": data["match_minute"]})

        return




# =============================================================================
#  Remise à zéro des statistiques
# =============================================================================

    ##
    # @brief Remet à zéro la moyenne, le minimum et le maximum de la fréquence cardiaque d'un supporter.
    #
    # @param supporterId Identifiant du supporter.
    ##
    @socketio.on("resetSupporterStatistics")
    def handleResetSupporterStatistics(supporterId):
        logger.info(f"[SocketIO] Réception de 'resetSupporterStatistics' pour le supporter id={supporterId}")

        for supporter in supporterList:
            if supporter.getId() == int(supporterId):
                supporter.heartRate.resetStatistics()
                socketio.emit("statisticsReset", {"kind": "supporter", "id": supporter.getId(), "dataType": "heart_rate"})
                return

        logger.warning(f"[SocketIO] Aucun supporter trouvé avec l'id={supporterId}")

        return



    ##
    # @brief Remet à zéro la moyenne, le minimum et le maximum d'une donnée d'une tribune.
    #
    # @param stadiumBleacherId Identifiant de la tribune.
    # @param dataType          Type de données ("accelerometer" ou "acoustic").
    ##
    @socketio.on("resetStadiumBleacherStatistics")
    def handleResetStadiumBleacherStatistics(stadiumBleacherId, dataType):
        logger.info(f"[SocketIO] Réception de 'resetStadiumBleacherStatistics' pour la tribune id={stadiumBleacherId} ({dataType})")

        for stadiumBleacher in stadiumBleacherList:
            if stadiumBleacher.getId() == int(stadiumBleacherId):
                if dataType == "accelerometer":
                    stadiumBleacher.accelerometer.resetStatistics()
                elif dataType == "acoustic":
                    stadiumBleacher.acoustic.resetStatistics()
                else:
                    logger.warning(f"[SocketIO] Type de données inconnu : '{dataType}'")
                    return

                socketio.emit("statisticsReset", {"kind": "stadiumBleacher", "id": stadiumBleacher.getId(), "dataType": dataType})
                return

        logger.warning(f"[SocketIO] Aucune tribune trouvé avec l'id={stadiumBleacherId}")

        return

# =============================================================================
#  Évènements du match affichés sur les graphiques
# =============================================================================

    ##
    # @brief Calcule la minute de jeu d'un évènement à partir du dernier coup d'envoi.
    #
    # @param matchId Identifiant du match.
    # @param code    Code de l'évènement.
    # @param ts      Date et heure de l'évènement (datetime).
    #
    # @return int|None Minute de jeu, None pour les évènements de phase de jeu.
    ##
    def _computeMatchMinute(matchId, code, ts):
        if code in PHASE_EVENT_CODES:
            return None

        events = postgresqlClient.fetch("SELECT code, ts FROM event WHERE match = %s AND ts <= %s ORDER BY ts DESC", (matchId, ts))
        for event in events:
            minute = (ts - event["ts"]).total_seconds() // 60
            if event["code"] == 7:
                return 106 + minute
            elif event["code"] == 5:
                return 91 + minute
            elif event["code"] == 3:
                return 46 + minute
            elif event["code"] == 1:
                return 1 + minute

        return None



    ##
    # @brief Envoie au client les évènements du match en cours, horodatés en millisecondes.
    ##
    @socketio.on("getMatchEvents")
    def handleGetMatchEvents():
        logger.info("[SocketIO] Réception de 'getMatchEvents'")

        match = getCurrentMatch(postgresqlClient)
        payload = {
            "matchId":   match["id"],
            "domicile":  match["domicile"],
            "exterieur": match["exterieur"],
            "events":    getMatchEventList(postgresqlClient, match["id"]),
        }

        emit("getMatchEventsResponse", payload)

        return



    ##
    # @brief Ajoute un évènement au match en cours à l'heure donnée.
    #
    # @param data Dictionnaire {"code": int, "t": timestamp en ms, "team": id d'équipe ou None}.
    ##
    @socketio.on("addMatchEvent")
    def handleAddMatchEvent(data):
        logger.info(f"[SocketIO] Réception de 'addMatchEvent': {data}")

        matchId = getCurrentMatch(postgresqlClient)["id"]
        code = int(data["code"])
        ts = datetime.fromtimestamp(int(data["t"]) / 1000).replace(microsecond=0)
        team = int(data["team"]) if data.get("team") is not None else None
        minute = _computeMatchMinute(matchId, code, ts)

        postgresqlClient.execute("INSERT INTO event (code, ts, match_minute, team, match) VALUES (%s, %s, %s, %s, %s) RETURNING id", (code, ts.strftime("%Y/%m/%d %H:%M:%S"), minute, team, matchId), returning=True)
        socketio.emit("matchEventsChanged")

        return



    ##
    # @brief Déplace un évènement du match dans le temps.
    #
    # @param data Dictionnaire {"id": id de l'évènement, "t": nouveau timestamp en ms}.
    ##
    @socketio.on("moveMatchEvent")
    def handleMoveMatchEvent(data):
        logger.info(f"[SocketIO] Réception de 'moveMatchEvent': {data}")

        event = postgresqlClient.fetch("SELECT code, match FROM event WHERE id = %s", (int(data["id"]),))
        if not event:
            logger.warning(f"[SocketIO] Aucun évènement trouvé avec l'id={data['id']}")
            return

        ts = datetime.fromtimestamp(int(data["t"]) / 1000).replace(microsecond=0)
        minute = _computeMatchMinute(event[0]["match"], event[0]["code"], ts)

        postgresqlClient.execute("UPDATE event SET ts = %s, match_minute = %s WHERE id = %s", (ts.strftime("%Y/%m/%d %H:%M:%S"), minute, int(data["id"])))
        socketio.emit("matchEventsChanged")

        return



    ##
    # @brief Supprime un évènement du match.
    #
    # @param idf Identifiant de l'évènement.
    ##
    @socketio.on("deleteMatchEvent")
    def handleDeleteMatchEvent(idf):
        logger.info(f"[SocketIO] Réception de 'deleteMatchEvent': id:{idf}")

        postgresqlClient.execute("DELETE FROM event WHERE id = %s", (int(idf),))
        socketio.emit("matchEventsChanged")

        return



    return
