/**
 * @file sensorType.hpp
 * 
 * @brief Déclaration des types de capteurs et de leur topic MQTT associé.
 *
 * Définit l'énumération SensorType ainsi que la fonction utilitaire getMQTTTopic() qui mappe chaque type vers son topic MQTT correspondant.
 */

#ifndef _SENSORTYPE_HPP_
#define _SENSORTYPE_HPP_

// ============================================================================
//  Type de capteurs
// ============================================================================

/**
 * @enum SensorType
 * 
 * @brief Catégories de capteurs supportés par le système.
 */
enum class SensorType 
{
    HEART_RATE,                 ///< @brief Capteur de fréquence cardiaque.
    ACCELEROMETER_GYROSCOPE,    ///< @brief Capteur accéléromètre / gyroscope.
    ACOUSTIC,                   ///< @brief Capteur acoustique.
    TEMPERATURE,                ///< @brief Capteur de température.
    SYSTEM,                     ///< @biref Type pour les messages d'information système
    UNKNOW                      ///< @brief Type inconnu ou non initialisé.
};

// ============================================================================
//  Association du type au topic MQTT
// ============================================================================

/**
 * @brief Retourne le topic MQTT correspondant à un type de capteur.
 *
 * @param type Type du capteur.
 * 
 * @return int Topic MQTT associé. Retourne "default" si le type est inconnu.
 */
int getMQTTTopic(SensorType type);



#endif // _SENSORTYPE_HPP_
