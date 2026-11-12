##
# @file setting.py
#
# @brief Configuration globale de l'application.
#
# Charge les variables d'environnement depuis le fichier .env situé à la racine du projet et les expose via la classe Config. Appeler Config.validate() au démarrage pour s'assurer que toutes les variables requises sont définies.
##


# =============================================================================
#  Import des bibliothèques
# =============================================================================

import os
from pathlib import Path
from dotenv import load_dotenv

from Server.Core.exception import EnvironmentVariableError

# =============================================================================
#  Chargement du fichier .env
# =============================================================================

_current_dir  = Path(__file__).parent      ##< @brief Répertoire contenant ce fichier.
_project_path = _current_dir.parent.parent ##< @brief Racine du projet.
_env_path     = _project_path / ".env"     ##< @brief Chemin absolu vers le fichier .env à la racine du projet.

load_dotenv(dotenv_path=_env_path)

# =============================================================================
#  Fonction utilitaire
# =============================================================================

##
# @brief Lit une variable d'environnement et la convertit en booléen.
#
# @param key     Nom de la variable d'environnement.
# @param default Valeur par défaut si la variable est absente (défaut : "false").
#
# @return bool True si la valeur vaut "true" ou "1" (insensible à la casse), False sinon.
##
def _get_bool(key, default="false"):
    return os.getenv(key, default).strip().lower() in ("true", "1")


# =============================================================================
#  Configuration
# =============================================================================

##
# @class Config
#
# @brief Centralise tous les paramètres de l'application chargés depuis le fichier .env.
##
class Config:

# =============================================================================
#  Général
# =============================================================================

    APP     = os.getenv("APP",     None)  ##< @brief Nom de l'application.
    ENV     = os.getenv("ENV",     None)  ##< @brief Environnement d'exécution.
    VERSION = os.getenv("VERSION", None)  ##< @brief Version de l'application.
    DEBUG   = _get_bool("DEBUG")          ##< @brief Activation du mode debug.

# =============================================================================
#  Chemins
# =============================================================================

    ## @brief Chemins absolus vers les répertoires utilisés par l'application.
    PATH = {
        "/":             _project_path,
        "documentation": os.path.join(_project_path, os.getenv("DOCUMENTATION_PATH", "")),
        "data":          os.path.join(_project_path, os.getenv("DATA_PATH", "")),
        "image":         os.path.join(_project_path, os.getenv("IMAGE_PATH", "")),
        "log":           os.path.join(_project_path, os.getenv("LOG_PATH", "")),
        "video":         os.path.join(_project_path, os.getenv("VIDEO_PATH", "Resources/Video/")),
    }

# =============================================================================
#  Interface Web
# =============================================================================

    SECRET_KEY = os.getenv("SECRET_KEY", None) ##< @brief Clé secrète Flask.
    WEB_HOST   = os.getenv("WEB_HOST", None)   ##< @brief Hôte d'écoute de l'interface web.
    WEB_PORT   = int(os.getenv("WEB_PORT", 0)) ##< @brief Port d'écoute de l'interface web.

# =============================================================================
#  MQTT
# =============================================================================

    MQTT_BROKER_HOST         = os.getenv("MQTT_BROKER_HOST", None)            ##< @brief Hôte du broker MQTT.
    MQTT_BROKER_PORT         = int(os.getenv("MQTT_BROKER_PORT", 0))          ##< @brief Port du broker MQTT.
    MQTT_BROKER_TOPICS_DATA  = os.getenv("MQTT_BROKER_TOPICS_DATA", "").split(",") ##< @brief Liste des topics MQTT de données souscrits.
    MQTT_BROKER_TOPICS_EVENT = os.getenv("MQTT_BROKER_TOPICS_DATA", "").split(",") ##< @brief Liste des topics MQTT d'évènements souscrits.
    MQTT_BROKER_KEEPALIVE    = int(os.getenv("MQTT_BROKER_KEEPALIVE", 0))     ##< @brief Intervalle de keep-alive MQTT en secondes.
    MQTT_BROKER_QOS          = int(os.getenv("MQTT_BROKER_QOS", 0))           ##< @brief Niveau de qualité de service MQTT (0, 1 ou 2).

# =============================================================================
#  InfluxDB
# =============================================================================

    INFLUXDB_HOST     = os.getenv("INFLUXDB_HOST", None)    ##< @brief Hôte du serveur InfluxDB (pour les messages d'erreur).
    INFLUXDB_PORT     = int(os.getenv("INFLUXDB_PORT", 0))  ##< @brief Port du serveur InfluxDB (pour les messages d'erreur).
    INFLUXDB_ADDRESS  = os.getenv("INFLUXDB_ADDRESS", None) ##< @brief URL complète du serveur InfluxDB (ex : http://localhost:8086).
    INFLUXDB_TOKEN    = os.getenv("INFLUXDB_TOKEN", None)   ##< @brief Token d'authentification InfluxDB.
    INFLUXDB_ORG      = os.getenv("INFLUXDB_ORG", None)     ##< @brief Organisation InfluxDB cible.
    INFLUXDB_BUCKET   = os.getenv("INFLUXDB_BUCKET", None)  ##< @brief Bucket InfluxDB cible pour l'écriture.

# =============================================================================
#  Meshtastic
# =============================================================================

    MESHTASTIC_PORT        = os.getenv("MESHTASTIC_PORT", None)                 ##< @brief Port série du nœud Meshtastic (inutilisé si détection automatique).
    MESHTASTIC_HOST        = os.getenv("MESHTASTIC_HOST", None)                 ##< @brief Hôte du nœud Meshtastic (pour les messages d'erreur).
    MESHTASTIC_TOPIC       = os.getenv("MESHTASTIC_TOPIC", None)                ##< @brief Topic pubsub Meshtastic (ex : "meshtastic.receive.text").
    MESHTASTIC_DESCRIPTION = os.getenv("MESHTASTIC_DESCRIPTION", "").split(",") ##< @brief Mots-clés de description de port série pour la détection automatique du noeud.

# =============================================================================
#  Meshcore
# =============================================================================

    MESHCORE_DESCRIPTION = os.getenv("MESHCORE_DESCRIPTION", "").split(",") ##< @brief Mots-clés de description de port série pour la détection automatique du noeud.

# =============================================================================
#  Grafana
# =============================================================================

    GRAFANA_HOST = os.getenv("GRAFANA_HOST", None)   ##< @brief Hôte du serveur Grafana.
    GRAFANA_PORT = int(os.getenv("GRAFANA_PORT", 0)) ##< @brief Port du serveur Grafana.

# =============================================================================
#  PostgreSQL
# =============================================================================

    POSTGRESQL_HOST          = os.getenv("POSTGRESQL_HOST", None)     ##< @brief Hôte du serveur PostgreSQL.
    POSTGRESQL_PORT          = int(os.getenv("POSTGRESQL_PORT", 0))   ##< @brief Port du seveur PostgreSQL.
    POSTGRESQL_USER          = os.getenv("POSTGRESQL_USER", None)     ##< @brief Nom d'utilisateur de la base de données PostgreSQL.
    POSTGRESQL_PASSWORD      = os.getenv("POSTGRESQL_PASSWORD", None) ##< @brief Mot de passe de la base de données PostgreSQL.
    POSTGRESQL_DATABASE      = os.getenv("POSTGRESQL_DATABASE", None) ##< @brief Base de données PostgreSQL.
    POSTGRESQL_DATABASE_FILE = os.getenv("POSTGRESQL_DATABASE_FILE", None) ##< @brief Fichier de construction de la base de données.

# =============================================================================
#  Délais d'échantillonage des capteurs
# =============================================================================

    SENSOR_DELAY = float(os.getenv("SENSOR_DELAY", 0)) ##< @brief Délais d'échantillonage des capteurs.

# =============================================================================
#  Tracking
# =============================================================================

    MAX_POINTS_TRACKING = int(os.getenv("MAX_POINTS_TRACKING", 0)) ##< @brief Nombre maximum de points dans l'historique des positions trackées.



    ##
    # @brief Vérifie que toutes les variables d'environnement requises sont définies et non vides.
    #
    # @throws EnvironmentVariableError À la première variable manquante ou vide détectée.
    ##
    @classmethod
    def validate(cls):
        required = {
            # Général
            "APP":     cls.APP,
            "ENV":     cls.ENV,
            "VERSION": cls.VERSION,

            # Chemins
            "DOCUMENTATION_PATH": cls.PATH["documentation"],
            "DATA_PATH":          cls.PATH["data"],
            "IMAGE_PATH":         cls.PATH["image"],
            "LOG_PATH":           cls.PATH["log"],

            # Interface Web
            "SECRET_KEY": cls.SECRET_KEY,
            "WEB_HOST":   cls.WEB_HOST,
            "WEB_PORT":   cls.WEB_PORT,

            # MQTT
            "MQTT_BROKER_HOST":         cls.MQTT_BROKER_HOST,
            "MQTT_BROKER_PORT":         cls.MQTT_BROKER_PORT,
            "MQTT_BROKER_TOPICS_DATA":  cls.MQTT_BROKER_TOPICS_DATA,
            "MQTT_BROKER_TOPICS_EVENT": cls.MQTT_BROKER_TOPICS_EVENT,
            "MQTT_BROKER_KEEPALIVE":    cls.MQTT_BROKER_KEEPALIVE,
            "MQTT_BROKER_QOS":          cls.MQTT_BROKER_QOS,

            # InfluxDB
            "INFLUXDB_HOST":    cls.INFLUXDB_HOST,
            "INFLUXDB_PORT":    cls.INFLUXDB_PORT,
            "INFLUXDB_ADDRESS": cls.INFLUXDB_ADDRESS,
            "INFLUXDB_TOKEN":   cls.INFLUXDB_TOKEN,
            "INFLUXDB_ORG":     cls.INFLUXDB_ORG,
            "INFLUXDB_BUCKET":  cls.INFLUXDB_BUCKET,

            # Meshtastic
            "MESHTASTIC_PORT":        cls.MESHTASTIC_PORT,
            "MESHTASTIC_HOST":        cls.MESHTASTIC_HOST,
            "MESHTASTIC_TOPIC":       cls.MESHTASTIC_TOPIC,
            "MESHTASTIC_DESCRIPTION": cls.MESHTASTIC_DESCRIPTION,

            # Meshcore
            "MESHCORE_DESCRIPTION": cls.MESHCORE_DESCRIPTION,

            # Grafana
            "GRAFANA_HOST": cls.GRAFANA_HOST,
            "GRAFANA_PORT": cls.GRAFANA_PORT,

            # PostgreSQL
            "POSTGRESQL_HOST":          cls.POSTGRESQL_HOST,
            "POSTGRESQL_PORT":          cls.POSTGRESQL_PORT,
            "POSTGRESQL_USER":          cls.POSTGRESQL_USER,
            "POSTGRESQL_PASSWORD":      cls.POSTGRESQL_PASSWORD,
            "POSTGRESQL_DATABASE":      cls.POSTGRESQL_DATABASE,
            "POSTGRESQL_DATABASE_FILE": cls.POSTGRESQL_DATABASE_FILE,

            # Délais d'échantillonage des capteurs
            "SENSOR_DELAY": cls.SENSOR_DELAY,

            # Tracking
            "MAX_POINTS_TRACKING": cls.MAX_POINTS_TRACKING
        }

        if cls.DEBUG:
            print("[Config] Validation des variables d'environnement")

        for key, value in required.items():
            if value is None or value == "" or value == [""]:
                raise EnvironmentVariableError(key)

        if cls.DEBUG:
            print("[Config] Toutes les variables d'environnement sont définies")

        return
