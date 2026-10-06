/**
 * @file MinIMU-9_v6.cpp
 * 
 * @brief Implémentation de la classe MinIMU_9_v6.
 *
 * Implémentation concrète d'un capteur accéléromètre et gyroscope communiquant via I2C. Hérite de AccelerometerGyroscope.
 */

#ifndef _MINIMU_9_V6_CPP_
#define _MINIMU_9_V6_CPP_

// ============================================================================
//  Import des headers internes
// ============================================================================

#include "./MinIMU-9_v6.hpp"

// ============================================================================
//  Variable static
// ============================================================================

const std::string MinIMU_9_v6::name = "MinIMU-9 v6";
const float MinIMU_9_v6::g1 = 9.81;
Logger * MinIMU_9_v6::logger = nullptr;

// ============================================================================
//  Constructeur
// ============================================================================

MinIMU_9_v6::MinIMU_9_v6(int stadiumBleacherId):
AccelerometerGyroscope(MinIMU_9_v6::name),
stadiumBleacherId(stadiumBleacherId)
{
    if (MinIMU_9_v6::logger == nullptr)
        MinIMU_9_v6::logger = new Logger("MinIMU-9 v6", true);

#if DEBUG == 1
    MinIMU_9_v6::logger->info(Logger::logString("[MinIMU-9 V6] Instanciation du capteur %s\n", MinIMU_9_v6::name.c_str()));
#endif
}

// ============================================================================
//  Destructeur
// ============================================================================

MinIMU_9_v6::~MinIMU_9_v6()
{
    this->end();
}

// ============================================================================
//  Méthode static
// ============================================================================

std::string MinIMU_9_v6::formatData(MinIMU_9_v6Data & data, int stadiumBleacherId)
{
#if DEBUG == 1
    MinIMU_9_v6::logger->info(Logger::logString("[MinIMU-9 V6] formatData - Accelerometre (dernière mesure): [%f, %f, %f]\n", data.accelerometer[data.dataIndex][0], data.accelerometer[data.dataIndex][1], data.accelerometer[data.dataIndex][2]));
#endif

    std::string jsonString;
    JsonDocument json;

    // Construction de l'objet JSON avec les données du capteur
    json["t"] = getMQTTTopic(SensorType::ACCELEROMETER_GYROSCOPE);
    json["n"] = MinIMU_9_v6::name;
    json["id"] = stadiumBleacherId;
    JsonArray arrayA = json["a"].to<JsonArray>();
    for (int index=0; index < NB_VALUE; index++)
        arrayA.add(serialized(String(data.accelerationMax[index], 2)));

    // Sérialisation en chaîne JSON + ajout d'un saut de ligne comme délimiteur de message
    serializeJson(json, jsonString);
    jsonString += '\n';

    return jsonString;
}

// ============================================================================
//  Méthode
// ============================================================================

void MinIMU_9_v6::begin()
{
#if DEBUG ==1
    MinIMU_9_v6::logger->info(Logger::logString("[MINIMU-9 V6] begin - Démarrage du capteur\n"));
#endif

    Wire.begin(SDA_PIN, SCL_PIN);

#if DEBUG == 1
    MinIMU_9_v6::logger->info(Logger::logString("[MINIMU-9 V6] begin - Configuration des registres"));
#endif

    // Configuration des registres : seul l'accéléromètre est activé
    // (gyroscope et magnétomètre restent dans leur état par défaut, hors tension)
    writeRegister(LSM6DS33_ADDRESS, REGISTER_ACCELEROMETER_NUMBER, REGISTER_ACCELEROMETER_VALUE);

    // Calibration de la gravité, capteur immobile
    this->calibrateGravity();

    Sensor::state = ConnectionState::CONNECTED;

    return ;
}



void MinIMU_9_v6::calibrateGravity()
{
    int rawData[3];
    double sumNorm = 0;
    int samples = 0;

    // Laisse le temps aux registres de prendre effet avant la première lecture
    delay(100);

    unsigned long calibrationStart = millis();
    while (millis() - calibrationStart < GRAVITY_CALIBRATION_DURATION)
    {
        readRegister(LSM6DS33_ADDRESS, REGISTER_ACCELEROMETER_OUT, rawData);

        double sumSquare = 0;
        for (int i=0; i < 3; i++)
        {
            double a = rawData[i] * ACCELEROMETER_SENSITIVITY * MinIMU_9_v6::g1;
            sumSquare += a * a;
        }
        sumNorm += sqrt(sumSquare);
        samples++;

        delay(ACCELEROMETER_SAMPLE_PERIOD);
    }

    float measuredGravity = (samples > 0) ? (float) (sumNorm / samples) : 0;

    // Valeur hors plage (capteur en mouvement ou défaillant) : conservation de la gravité théorique
    if ((measuredGravity < GRAVITY_CALIBRATION_MIN) || (measuredGravity > GRAVITY_CALIBRATION_MAX))
    {
        MinIMU_9_v6::logger->warning(Logger::logString("[MINIMU-9 V6] calibrateGravity - Gravité mesurée invalide (%f m/s² sur %d échantillons), utilisation de %f m/s²\n", measuredGravity, samples, MinIMU_9_v6::g1));
        this->gravity = MinIMU_9_v6::g1;
        return ;
    }

    this->gravity = measuredGravity;
    MinIMU_9_v6::logger->info(Logger::logString("[MINIMU-9 V6] calibrateGravity - Gravité calibrée: %f m/s² (%d échantillons)\n", this->gravity, samples));

    return ;
}



void MinIMU_9_v6::end()
{
#if DEBUG == 1
    MinIMU_9_v6::logger->info(Logger::logString("[MINIMU-9 V6] end - Arrêt du capteur\n"));
#endif

    Sensor::state = ConnectionState::DISCONNECTED;

#if DEBUG == 1
    MinIMU_9_v6::logger->info(Logger::logString("[MINIMU-9 V6] end - Capteur arrêté\n"));
#endif

    return ;
}



void MinIMU_9_v6::update()
{
    int rawData[3];

#if DEBUG == 1
    MinIMU_9_v6::logger->info(Logger::logString("[MINIMU-9 V6] update - Mise à jour du capteur\n"));
#endif

    // Échantillonnage de l'accéléromètre sur toute la fenêtre d'acquisition
    // et conservation du maximum de |‖a‖ - g| (accélération dynamique)
    float accelerationMax = 0;
    unsigned long windowStart = millis();
    do
    {
        // Lecture de l'accéléromètre
        readRegister(LSM6DS33_ADDRESS, REGISTER_ACCELEROMETER_OUT, rawData);
        // Conversion de la valeur brute
        for (int i=0; i < 3; i++)
            this->data.accelerometer[this->data.dataIndex][i] = rawData[i] * ACCELEROMETER_SENSITIVITY * MinIMU_9_v6::g1;

        // Calcul de la norme du vecteur accélération moins la gravité calibrée
        float ax2 = this->data.accelerometer[this->data.dataIndex][0] * this->data.accelerometer[this->data.dataIndex][0];
        float ay2 = this->data.accelerometer[this->data.dataIndex][1] * this->data.accelerometer[this->data.dataIndex][1];
        float az2 = this->data.accelerometer[this->data.dataIndex][2] * this->data.accelerometer[this->data.dataIndex][2];
        float a = fabsf(sqrtf(ax2 + ay2 + az2) - this->gravity);
        if (a > accelerationMax)
            accelerationMax = a;

        delay(ACCELEROMETER_SAMPLE_PERIOD);
    } while (millis() - windowStart < ACQUISITION_TIME);

    this->data.accelerationMax[this->data.dataIndex] = accelerationMax;

#if DEBUG == 1
    MinIMU_9_v6::logger->info(Logger::logString("[MINIMU-9 V6] update - Accelerometre: x:%f y:%f z:%f max |a-g|:%f", this->data.accelerometer[this->data.dataIndex][0], this->data.accelerometer[this->data.dataIndex][1], this->data.accelerometer[this->data.dataIndex][2], accelerationMax));
#endif

    // Mise à jour des données
    std::string format = MinIMU_9_v6::formatData(this->data, this->stadiumBleacherId);
    Sensor::data = format;

#if DEBUG == 1
    MinIMU_9_v6::logger->info(Logger::logString("[MinIMU-9 V6] update - Nouvelle mesure sérialisée: %s", format.c_str()));
#else
    MinIMU_9_v6::logger->info(Logger::logString("Accéléromètre: %f,%f,%f max |a-g|: %f\n", this->data.accelerometer[this->data.dataIndex][0], this->data.accelerometer[this->data.dataIndex][1], this->data.accelerometer[this->data.dataIndex][2], this->data.accelerationMax[this->data.dataIndex]));
#endif

    this->data.dataIndex++;
    if (this->data.dataIndex == NB_VALUE)
        this->data.dataIndex = 0;

    return ;
}



void MinIMU_9_v6::readRegister(uint8_t address, uint8_t registerAddress, int * out)
{
#if DEBUG == 1
    MinIMU_9_v6::logger->info(Logger::logString("[MINIMU-9 V6] readRegister - Lecture du registre %d de la transmission %d", registerAddress, address));
#endif

    // Initialisation de la transmission
    Wire.beginTransmission(address);

    // Écriture
    Wire.write(registerAddress);

    // Fin de la transmission
    Wire.endTransmission(false);
    
    // Lecture
    Wire.requestFrom((uint8_t) address, (uint8_t) 6);
    out[0] = (int16_t)(Wire.read() | (Wire.read() << 8));
    out[1] = (int16_t)(Wire.read() | (Wire.read() << 8));
    out[2] = (int16_t)(Wire.read() | (Wire.read() << 8));

    return ;
}



void MinIMU_9_v6::writeRegister(uint8_t address, uint8_t registerAddress, uint8_t value)
{
#if DEBUG == 1
    MinIMU_9_v6::logger->info(Logger::logString("[MINIMU-9 V6] writeRegister - Écriture du registre %d de la transmission %d (valeur %d)", registerAddress, address, value));
#endif
    
    // Initialisation de la transmission
    Wire.beginTransmission(address);
    
    // Écriture
    Wire.write(registerAddress);
    Wire.write(value);
    
    // Fin de la transmission
    if (Wire.endTransmission() != 0)
    {
        std::string str = Logger::logString("[MINIMU-9 V6] writeRegister - Erreur lors de la transmission %d sur le registre %d", address, registerAddress);
#if DEBUG == 1
        MinIMU_9_v6::logger->error(str);
#endif
        throw std::runtime_error(str);
    }

    return ;
}



void MinIMU_9_v6::notify(NimBLERemoteCharacteristic *, uint8_t *, size_t)
{
    return ;
}



#endif // _MINIMU_9_V6_CPP_
