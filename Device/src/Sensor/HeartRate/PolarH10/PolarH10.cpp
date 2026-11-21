/**
 * @file PolarH10.cpp
 * 
 * @brief Implémentation de la classe PolarH10.
 *
 * Implémentation concrète d'un capteur de fréquence cardiaque Polar H10 communiquant via Bluetooth Low Energy. Hérite de HeartRate et utilise BluetoothLowEnergyManager pour la gestion de la connexion Bluetooth Low Energy.
 */

#ifndef _POLARH10_CPP_
#define _POLARH10_CPP_

// ============================================================================
//  Import des headers internes
// ============================================================================

#include "./PolarH10.hpp"

// ============================================================================
//  Variable globale
// ============================================================================

std::mutex dataMutex; ///< @brief Mutex global protégeant les accès concurrents à PolarH10Data.

// ============================================================================
//  Variables static
// ============================================================================

const std::string PolarH10::name = "PolarH10";
Logger * PolarH10::logger = nullptr;

// ============================================================================
//  Constructeur
// ============================================================================

PolarH10::PolarH10(int supporterId):
HeartRate(PolarH10::name),
supporterId(supporterId),
isSubscribed(false),
isNotify(false),
bleManager(nullptr)
{
    if (PolarH10::logger == nullptr)
        PolarH10::logger = new Logger("PolarH10", true);

#if DEBUG == 1
    PolarH10::logger->info(Logger::logString("[POLARH10] Instanciation pour le supporter. id: %d, adresse MAC cible: %s\n", supporterId, MAC_ADDRESS));
#endif

    // Instanciation du gestionnaire Bluetooth Low Energy avec l'adresse MAC configurée dans setting.hpp
    this->bleManager = new BluetoothLowEnergyManager(MAC_ADDRESS);
}

// ============================================================================
//  Destructeur
// ============================================================================

PolarH10::~PolarH10()
{
    this->end();
    delete this->bleManager;
}

// ============================================================================
//  Méthode static
// ============================================================================

std::string PolarH10::formatData(PolarH10Data & data, int supporterId)
{
#if DEBUG == 1
    char str[LOGGER_MAX_MESSAGE_SIZE];
    for (int i=0; i < NB_VALUE; i++)
    {
        char val[5];
        snprintf(val, sizeof(val), "%d ", data.heartRate[i]);
        strcat(str, val);
    }
    PolarH10::logger->info(Logger::logString("[POLARH10] formatData - HR: [ %s] bpm\n", str));
#endif

    std::string jsonString;
    JsonDocument json;

    // Construction de l'objet JSON avec les données du capteur
    json["t"] = getMQTTTopic(SensorType::HEART_RATE);
    json["id"] = supporterId;
    // Buffer circulaire envoyé dans l'ordre chronologique : formatData() est appelé après
    // l'incrément de l'index, la case heartRateIndex contient donc la mesure la plus ancienne
    JsonArray array = json["hr"].to<JsonArray>();
    for (int k=0; k < NB_VALUE; k++)
        array.add(data.heartRate[(data.heartRateIndex + k) % NB_VALUE]);

    // Sérialisation en chaîne JSON + ajout d'un saut de ligne comme délimiteur de message
    serializeJson(json, jsonString);
    jsonString += '\n';

    return jsonString;
}

// ============================================================================
//  Méthode
// ============================================================================

void PolarH10::begin()
{
#if DEBUG == 1
    PolarH10::logger->info(Logger::logString("[POLARH10] begin - Démarrage du capteur\n"));
#endif

    // Démarrage de la pile Bluetooth Low Energy et du scan
    this->bleManager->begin();

    // État transitoire: en attente de connexion
    Sensor::state = ConnectionState::CONNECTING;

#if DEBUG == 1
    PolarH10::logger->info(Logger::logString("[POLARH10] begin - État: CONNECTING, en attente du périphérique Bluetooth Low Energy"));
#endif

    return ;
}



void PolarH10::end()
{
#if DEBUG == 1
    PolarH10::logger->info(Logger::logString("[POLARH10] end - Arrêt du capteur\n"));
#endif

    // Fermeture de l'interface Bluetooth Low Energy
    this->bleManager->end();

#if DEBUG == 1
    PolarH10::logger->info(Logger::logString("[POLARH10] end - Capteur arrêté\n"));
#endif

    return ;
}



void PolarH10::update()
{
#if DEBUG == 1
    PolarH10::logger->info(Logger::logString("[POLARH10] update - Mise à jour du capteur\n"));
#endif

    // Délègue la gestion Bluetooth Low Energy au gestionnaire
    this->bleManager->update();

    // Vérifie que le capteur est connecté
    if (this->bleManager->isConnected())
    {
        if (Sensor::state != ConnectionState::CONNECTED)
        {
            Sensor::state = ConnectionState::CONNECTED;

#if DEBUG == 1
            PolarH10::logger->info(Logger::logString("[POLARH10] update - État: CONNECTED\n"));
#endif
        }

        // Première connexion: lecture des métadonnées et souscription aux notifications
        if (not this->isSubscribed)
        {
#if DEBUG == 1
            PolarH10::logger->info(Logger::logString("[POLARH10] update - Première connexion: lecture des métadonnées statiques\n"));
#endif

            // Lecture bloquante du niveau de batterie et de la localisation du capteur
            this->getData();

#if DEBUG == 1
            PolarH10::logger->info(Logger::logString("[POLARH10] update - Souscription aux notifications Heart Rate active\n"));
#endif

            // Souscription aux notifications Heart Rate Measurement
            this->bleManager->subscribe(UUID_HEARTRATE_SERVICE, UUID_HEARTRATE_MEASUREMENT_CHARACTERISTIC);
            this->isSubscribed = true;
        }

        // Si une notification a été reçue depuis le dernier update(), sérialise les données
        if (this->isNotify)
        {
            // Formatage des données
            std::string format;
            
            {
                std::lock_guard<std::mutex> lock(dataMutex);

                format = PolarH10::formatData(this->data, this->supporterId);
                
                // Réinitialisation du drapeau pour la prochaine notification
                this->isNotify = false;
            }

            Sensor::data = format;

#if DEBUG == 1
            PolarH10::logger->info(Logger::logString("[POLARH10] update - Nouvelle mesure sérialisée: %s\n", format.c_str()));
#else
            PolarH10::logger->info(Logger::logString("Fréquence cardiaque: %dbpm\n", this->data.heartRate[this->data.heartRateIndex]));
#endif
        }
#if DEBUG == 1
        else
            PolarH10::logger->info(Logger::logString("[POLARH10] update - Aucune nouvelle notification depuis le dernier cycle\n"));
#endif
    }
    else
    {
        // Déconnexion: réinitialisation pour forcer une nouvelle souscription à la reconnexion
        Sensor::state = ConnectionState::DISCONNECTED;
        this->isSubscribed = false;

#if DEBUG == 1
        PolarH10::logger->info(Logger::logString("[POLARH10] update - État: DISCONNECTED\n"));
#endif
    }

    return ;
}



void PolarH10::getData()
{
#if DEBUG == 1
    PolarH10::logger->info(Logger::logString("[POLARH10] getData - Lecture des caractéristiques statiques\n"));
#endif

    NimBLEAttValue value;

    std::lock_guard<std::mutex> lock(dataMutex);

#if DEBUG == 1
    PolarH10::logger->info(Logger::logString("[POLARH10] getData - Lecture du niveau de batterie\n"));
#endif

    // Lecture du niveau de batterie: boucle jusqu'à obtenir une valeur valide (!= 255)
    uint8_t batteryLevel = 255;
    while (batteryLevel == 255 and this->isConnected())
    {
        // La caractéristique Battery Level est un unique octet (valeur 0–100%)
        value = this->bleManager->getValue(UUID_BATTERY_SERVICE, UUID_BATTERY_LEVEL_CHARACTERISTIC);
        if (value.size() == 1)
        {
            const uint8_t * data = value.data();
            batteryLevel = data[0];

#if DEBUG == 1
            PolarH10::logger->info(Logger::logString("[POLARH10] getData - Niveau de batterie: %u%%\n", batteryLevel));
#else
            PolarH10::logger->info(Logger::logString("Batterie: %u%%\n", batteryLevel));
#endif
        } 
    }

#if DEBUG == 1
    PolarH10::logger->info(Logger::logString("[POLARH10] getData - Lecture de la localisation du capteur\n"));
#endif

    // Lecture de la localisation du capteur: boucle jusqu'à obtenir une valeur valide (!= "")
    std::string bodySensorLocation = "";
    while (bodySensorLocation == "" and this->isConnected())
    {
        // La caractéristique Body Sensor Location est un unique octet (enum 0–6)
        value = this->bleManager->getValue(UUID_HEARTRATE_SERVICE, UUID_HEARTRATE_BODYSENSORLOCATION_CHARACTERISTIC);
        if (value.size() == 1)
        {
            const uint8_t * data = value.data();
            switch (data[0])
            {
                case 0:
                    bodySensorLocation = "Other";
                    break;
                case 1:
                    bodySensorLocation = "Chest";
                    break;
                case 2:
                    bodySensorLocation = "Wrist";
                    break;
                case 3:
                    bodySensorLocation = "Finger";
                    break;
                case 4:
                    bodySensorLocation = "Hand";
                    break;
                case 5:
                    bodySensorLocation = "Ear Lobe";
                    break;
                case 6:
                    bodySensorLocation = "Foot";
                    break;
                default:
                    bodySensorLocation = "Reserved";
            }

#if DEBUG == 1
            PolarH10::logger->info(Logger::logString("[POLARH10] getData - Localisation: %s (code: %u)\n", bodySensorLocation.c_str(), data[0]));
#else
            PolarH10::logger->info(Logger::logString("Localisation: %s\n", bodySensorLocation.c_str()));
#endif
        }
    }

#if DEBUG == 1
    PolarH10::logger->info(Logger::logString("[POLARH10] getData - Lecture des caractéristiques statiques terminée\n"));
#endif

    std::string jsonString;
    JsonDocument json;

    json["t"] = getMQTTTopic(SensorType::SYSTEM);
    json["n"] = PolarH10::name;
    json["id"] = this->supporterId;
    json["bsl"] = bodySensorLocation;
    json["bl"] = batteryLevel;

    // Sérialisation en chaîne JSON + ajout d'un saut de ligne comme délimiteur de message
    serializeJson(json, jsonString);
    jsonString += '\n';

    Sensor::data = jsonString;

    return ;
}



void PolarH10::notify(NimBLERemoteCharacteristic * characteristic, uint8_t * data, size_t length)
{
    NimBLEUUID uuid = NimBLEUUID(UUID_HEARTRATE_MEASUREMENT_CHARACTERISTIC);

    std::lock_guard<std::mutex> lock(dataMutex);

    // Vérifie que la notification provient bien de la caractéristique Heart Rate Measurement
    if (characteristic->getUUID() == uuid)
    {
        if (length > 1)
        {
            /* 
            Bit 0 du premier octet indique le format de la valeur de fréquence cardiaque :
                0 = format UINT8  (data[1])
                1 = format UINT16 (data[1] | data[2] << 8)
            */
            if (data[0] & 0x01)
            {
                // Fréquence cardiaque encodée sur 16 bits
                this->data.heartRate[this->data.heartRateIndex] = static_cast<int>( data[1] | (data[2] << 8) );

#if DEBUG == 1
                PolarH10::logger->info(Logger::logString("[POLARH10] notify - Fréquence cardiaque (UINT16): %d bpm\n", this->data.heartRate[this->data.heartRateIndex]));
#endif

                this->data.heartRateIndex++;
            }
            else
            {
                // Fréquence cardiaque encodée sur 8 bits
                this->data.heartRate[this->data.heartRateIndex] = static_cast<int>(data[1]);

#if DEBUG == 1
                PolarH10::logger->info(Logger::logString("[POLARH10] notify - Fréquence cardiaque (UINT8): %d bpm\n", this->data.heartRate[this->data.heartRateIndex]));
#endif

                this->data.heartRateIndex++;
            }
            // Reset du buffer si besoin
            if (this->data.heartRateIndex >= NB_VALUE)
                this->data.heartRateIndex = 0;
        }
#if DEBUG == 1
        else
            PolarH10::logger->warning(Logger::logString("[POLARH10] notify - Trame HeartRate trop courte (%u octet), ignorée\n", length));
#endif
    }
#if DEBUG == 1
    else
        PolarH10::logger->warning(Logger::logString("[POLARH10] notify - Notification ignorée: UUID %s non reconnu\n", characteristic->getUUID().toString().c_str()));
#endif

    // Signale une nouvelle donnée disponible uniquement si la valeur est cohérente
    if (this->data.heartRate[this->data.heartRateIndex - 1] > 0)
        this->isNotify = true;

    return ;
}



#endif // _POLARH10_CPP_
