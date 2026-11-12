/**
 * @file initSensor.hpp
 * 
 * @brief Initialise le capteur actif à la compilation.
 *
 * En fonction des macros définies dans setting.hpp, ce fichier définit la macro SENSOR avec le nom de la classe concrète correspondante. Si aucune macro de capteur n'est définie ou plusieurs macros de capteur sont définies, la compilation est interrompue avec une erreur explicite.
 *
 * Utilisation dans main.cpp:
 * @code
 * sensor = new SENSOR(SUPPORTER_ID);
 * @endcode
 */

#ifndef _INITSENSOR_HPP_
#define _INITSENSOR_HPP_

// ============================================================================
//  Import des headers internes
// ============================================================================

#include "./setting.hpp"

// ============================================================================
//  Initialisation dynamic du capteur
// ============================================================================

#ifdef POLARH10
#define SENSOR PolarH10 ///< @brief Alias vers la classe concrète PolarH10, résolu à la compilation.
#endif // POLARH10
#ifdef MINIMU_9_V6
#define SENSOR MinIMU_9_v6 ///< @brief Alias vers la classe concrète MinIMU_9_v6, résolu à la compilation.
#endif // MINIMU_9_V6
#ifdef _INMP441_
#define SENSOR INMP441 ///< @brief Alias vers la classe concrète MinIMU_9_v6, résolu à la compilation.
#endif // INMP441

#ifdef _DS18B20_
#define SENSOR DS18B20 ///< @brief Alias vers la classe concrète DS18B20, résolu à la compilation.
#endif // _DS18B20_

// ============================================================================
//  Vérification de l'initialisation d'un capteur
// ============================================================================

#ifndef SENSOR
#error "Erreur de configuration: Aucun capteur n'est initialisé"
#endif // SENSOR

#if (defined(POLARH10) + defined(MINIMU_9_V6) + defined(_INMP441_) + defined(_DS18B20_)) != 1
#error "Erreur de configuration: Plusieurs capteurs sont définis"
#endif

// ============================================================================
//  Vérification de l'initialisation d'un capteur
// ============================================================================

#ifndef SUPPORTER_ID
#error "Erreur de configuration: Aucun identifiant de supporter"
#endif
#ifndef STADIUM_BLEACHER_ID
#error "Erreur de configuration: Aucun identifiant de tribune"
#endif



#endif // _INITSENSOR_HPP_
