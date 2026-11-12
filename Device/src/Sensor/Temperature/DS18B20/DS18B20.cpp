/**
 * @file DS18B20.cpp
 *
 * @brief Implémentation de la classe DS18B20.
 *
 * Implémentation concrète d'un capteur de température communiquant via le bus 1-Wire. Hérite de Temperature.
 */

#ifndef _DS18B20_CPP_
#define _DS18B20_CPP_

// ============================================================================
//  Import des headers internes
// ============================================================================

#include "./DS18B20.hpp"

// ============================================================================
//  Variable static
// ============================================================================

const std::string DS18B20::name = "DS18B20";
Logger * DS18B20::logger = nullptr;

// ============================================================================
//  Constructeur
// ============================================================================

DS18B20::DS18B20(int stadiumBleacherId):
Temperature(DS18B20::name),
stadiumBleacherId(stadiumBleacherId),
oneWire(ONE_WIRE_PIN),
sensors(&oneWire)
{
    if (DS18B20::logger == nullptr)
        DS18B20::logger = new Logger("DS18B20", true);

    // Aucune mesure tant que le buffer n'est pas rempli
    for (int i=0; i < NB_VALUE; i++)
        this->data.temperature[i] = NAN;

#if DEBUG == 1
    DS18B20::logger->info(Logger::logString("[DS18B20] Instanciation du capteur %s\n", DS18B20::name.c_str()));
#endif
}

// ============================================================================
//  Destructeur
// ============================================================================

DS18B20::~DS18B20()
{
    this->end();
}

// ============================================================================
//  Méthode static
// ============================================================================

std::string DS18B20::formatData(DS18B20Data & data, int stadiumBleacherId)
{
    std::string jsonString;
    JsonDocument json;

    // Construction de l'objet JSON avec les données du capteur
    json["t"] = getMQTTTopic(SensorType::TEMPERATURE);
    json["n"] = DS18B20::name;
    json["id"] = stadiumBleacherId;
    json["p"] = ACQUISITION_TIME / 1000; // Période entre deux mesures (s), pour l'horodatage côté serveur
    // Buffer circulaire envoyé dans l'ordre chronologique : de la mesure la plus ancienne
    // (case suivant la dernière écrite) à la plus récente (dernière case écrite)
    JsonArray array = json["a"].to<JsonArray>();
    for (int k=0; k < NB_VALUE; k++)
    {
        int i = (data.temperatureIndex + 1 + k) % NB_VALUE;

        // Mesure invalide ou pas encore effectuée : null
        if (isnan(data.temperature[i]))
            array.add(nullptr);
        else
            array.add(serialized(String(data.temperature[i], 2)));
    }

    // Sérialisation en chaîne JSON + ajout d'un saut de ligne comme délimiteur de message
    serializeJson(json, jsonString);
    jsonString += '\n';

    return jsonString;
}

// ============================================================================
//  Méthode
// ============================================================================

void DS18B20::begin()
{
#if DEBUG == 1
    DS18B20::logger->info(Logger::logString("[DS18B20] begin - Démarrage du bus 1-Wire sur la broche %d\n", ONE_WIRE_PIN));
#endif

    this->sensors.begin();

    int count = this->sensors.getDeviceCount();
    DS18B20::logger->info(Logger::logString("[DS18B20] begin - %d sonde(s) détectée(s) sur le bus 1-Wire\n", count));

    // Sonde absente ou câblage incorrect : le capteur reste déconnecté
    if (count == 0 || !this->sensors.getAddress(this->address, 0))
    {
        DS18B20::logger->error(Logger::logString("[DS18B20] begin - Aucune sonde DS18B20 trouvée (vérifier le câblage et la résistance de tirage de 4,7 kOhm)\n"));
        Sensor::state = ConnectionState::DISCONNECTED;
        return ;
    }

#if DEBUG == 1
    DS18B20::logger->info(Logger::logString("[DS18B20] begin - Adresse de la sonde: %02X%02X%02X%02X%02X%02X%02X%02X\n", this->address[0], this->address[1], this->address[2], this->address[3], this->address[4], this->address[5], this->address[6], this->address[7]));
#endif

    // Conversion non bloquante : lancée à la fin d'une mise à jour, lue à la suivante
    this->sensors.setResolution(this->address, DS18B20_RESOLUTION);
    this->sensors.setWaitForConversion(false);
    this->sensors.requestTemperaturesByAddress(this->address);
    this->conversionPending = true;

    Sensor::state = ConnectionState::CONNECTED;

    return ;
}



void DS18B20::end()
{
#if DEBUG == 1
    DS18B20::logger->info(Logger::logString("[DS18B20] end - Arrêt du capteur\n"));
#endif

    Sensor::state = ConnectionState::DISCONNECTED;

    return ;
}



void DS18B20::update()
{
    // Conversion pas encore terminée (le DS18B20 renverrait sa valeur de mise sous tension, 85 °C)
    if (!this->conversionPending || !this->sensors.isConversionComplete())
        return ;

#if DEBUG == 1
    DS18B20::logger->info(Logger::logString("[DS18B20] update - Mise à jour du capteur\n"));
#endif

    // Lecture de la conversion lancée à la mise à jour précédente
    float temperature = this->sensors.getTempC(this->address);
    if (temperature == DEVICE_DISCONNECTED_C)
    {
        DS18B20::logger->error(Logger::logString("[DS18B20] update - Lecture impossible (sonde déconnectée ?)\n"));
        temperature = NAN;
    }

    this->data.temperature[this->data.temperatureIndex] = temperature;

    // Mise à jour des données
    std::string format = DS18B20::formatData(this->data, this->stadiumBleacherId);
    Sensor::data = format;

#if DEBUG == 1
    DS18B20::logger->info(Logger::logString("[DS18B20] update - Température: %.2f °C - Nouvelle mesure sérialisée: %s", temperature, format.c_str()));
#else
    DS18B20::logger->info(Logger::logString("Température: %.2f\n", temperature));
#endif

    this->data.temperatureIndex++;
    if (this->data.temperatureIndex == NB_VALUE)
        this->data.temperatureIndex = 0;

    // Lancement de la conversion suivante (lue à la prochaine mise à jour)
    this->sensors.requestTemperaturesByAddress(this->address);

    return ;
}



void DS18B20::notify(NimBLERemoteCharacteristic *, uint8_t *, size_t)
{
    return ;
}



#endif // _DS18B20_CPP_
