/**
 * @file sensorType.cpp
 * 
 * @brief Implémentation de getMQTTTopic().
 *
 * Fournit la correspondance entre chaque valeur de l'énumération SensorType et le topic MQTT publié sur le broker.
 */

#ifndef _SENSORTYPE_CPP_
#define _SENSORTYPE_CPP_

// ============================================================================
//  Import des headers internes
// ============================================================================

#include "./sensorType.hpp"

// ============================================================================
//  Association du type au topic MQTT
// ============================================================================

int getMQTTTopic(SensorType type)
{
    switch (type)
    {
        case SensorType::SYSTEM:
            return 1;
        case SensorType::HEART_RATE:
            return 2;
        case SensorType::ACCELEROMETER_GYROSCOPE:
            return 3;
        case SensorType::ACOUSTIC:
            return 4;
        case SensorType::TEMPERATURE:
            return 6;
        default:
            return 0;
    }

    return -1;
}



#endif // _SENSORTYPE_CPP_
