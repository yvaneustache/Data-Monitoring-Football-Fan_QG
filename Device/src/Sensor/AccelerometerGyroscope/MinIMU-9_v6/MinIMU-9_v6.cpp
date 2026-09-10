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
    MinIMU_9_v6::logger->info(Logger::logString("[MinIMU-9 V6] formatData - Accelerometre: [%f, %f, %f] Gyroscope: [%f, %f, %f] Magnetometre: [%f, %f, %f]\n", data.accelerometer[0], data.accelerometer[1], data.accelerometer[2], data.gyroscope[0], data.gyroscope[1], data.gyroscope[2], data.magnetometer[0], data.magnetometer[1], data.magnetometer[2]));
#endif

    std::string jsonString;
    JsonDocument json;

    // Construction de l'objet JSON avec les données du capteur
    json["t"] = getMQTTTopic(SensorType::ACCELEROMETER_GYROSCOPE);
    json["n"] = MinIMU_9_v6::name;
    json["id"] = stadiumBleacherId;
    JsonArray arrayA = json["a"].to<JsonArray>();
    for (int index=0; index < NB_VALUE; index++)
    {
        // Calcul de la norme du vecteur accélération
        float ax2 = data.accelerometer[index][0] * data.accelerometer[index][0];
        float ay2 = data.accelerometer[index][1] * data.accelerometer[index][1];
        float az2 = data.accelerometer[index][2] * data.accelerometer[index][2];
        float a = sqrt(ax2 + ay2 + az2);
        arrayA.add(serialized(String(a, 2)));
    }

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

    // Configuration des registres
    writeRegister(LSM6DS33_ADDRESS, REGISTER_ACCELEROMETER_NUMBER, REGISTER_ACCELEROMETER_VALUE);
    writeRegister(LSM6DS33_ADDRESS, REGISTER_GYROSCOPE_NUMBER, REGISTER_GYROSCOPE_VALUE);
    writeRegister(LIS3MDL_ADDRESS, REGISTER_MAGNETOMETER_NUMBER, REGISTER_MAGNETOMETER_VALUE);

    Sensor::state = ConnectionState::CONNECTED;

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

    // Lecture de l'accéléromètre
    readRegister(LSM6DS33_ADDRESS, REGISTER_ACCELEROMETER_OUT, rawData);
    // Conversion de la valeur brute
    for (int i=0; i < 3; i++)
        this->data.accelerometer[this->data.dataIndex][i] = rawData[i] * ACCELEROMETER_SENSITIVITY * MinIMU_9_v6::g1;

#if DEBUG == 1
    MinIMU_9_v6::logger->info(Logger::logString("[MINIMU-9 V6] update - Accelerometre: x:%f y:%f z:%f", this->data.accelerometer[this->data.dataIndex][0], this->data.accelerometer[this->data.dataIndex][1], this->data.accelerometer[this->data.dataIndex][2]));
#endif
    
    // Lecture du gyroscope
    readRegister(LSM6DS33_ADDRESS, REGISTER_GYROSCOPE_OUT, rawData);
    // Conversion de la valeur brute
    for (int i=0; i < 3; i++)
        this->data.gyroscope[this->data.dataIndex][i] = rawData[i] * GYROSCOPE_SENSITIVITY;

#if DEBUG == 1
    MinIMU_9_v6::logger->info(Logger::logString("[MINIMU-9 V6] update - Gyroscope: x:%f y:%f z:%f", this->data.gyroscope[this->data.dataIndex][0], this->data.gyroscope[this->data.dataIndex][1], this->data.gyroscope[this->data.dataIndex][2]));
#endif

    // Lecture du magnétomètre
    readRegister(LIS3MDL_ADDRESS, REGISTER_MAGNETOMETER_OUT, rawData);
    for (int i=0; i < 3; i++)
        this->data.magnetometer[this->data.dataIndex][i] = (float) (rawData[i] / MAGNETOMETER_SENSITIVITY);

#if DEBUG == 1
    MinIMU_9_v6::logger->info(Logger::logString("[MINIMU-9 V6] update - Magnetometre: x:%f y:%f z:%f", this->data.magnetometer[this->data.dataIndex][0], this->data.magnetometer[this->data.dataIndex][1], this->data.magnetometer[this->data.dataIndex][2]));
#endif

    // Mise à jour des données
    std::string format = MinIMU_9_v6::formatData(this->data, this->stadiumBleacherId);
    Sensor::data = format;

#if DEBUG == 1
    MinIMU_9_v6::logger->info(Logger::logString("[MinIMU-9 V6] update - Nouvelle mesure sérialisée: %s", format.c_str()));
#else
    MinIMU_9_v6::logger->info(Logger::logString("Accéléromètre: %f,%f,%f\nGyroscope: %f,%f,%f\nMagnétomètre: %f,%f,%f\n", this->data.accelerometer[this->data.dataIndex][0], this->data.accelerometer[this->data.dataIndex][1], this->data.accelerometer[this->data.dataIndex][2], this->data.gyroscope[this->data.dataIndex][0], this->data.gyroscope[this->data.dataIndex][1], this->data.gyroscope[this->data.dataIndex][2], this->data.magnetometer[this->data.dataIndex][0], this->data.magnetometer[this->data.dataIndex][1], this->data.magnetometer[this->data.dataIndex][2]));
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
