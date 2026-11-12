/**
 * @file Temperature.cpp
 *
 * @brief Implémentation de la classe abstraite Temperature.
 *
 * Classe intermédiaire dans la hiérarchie des capteurs. Spécialise Sensor pour les capteurs de température.
 */

#ifndef _TEMPERATURE_CPP_
#define _TEMPERATURE_CPP_

// ============================================================================
//  Import des headers internes
// ============================================================================

#include "./Temperature.hpp"

// ============================================================================
//  Variables static
// ============================================================================

const SensorType Temperature::type = SensorType::TEMPERATURE;

// ============================================================================
//  Constructeur
// ============================================================================

Temperature::Temperature(std::string name):
Sensor(name, Temperature::type)
{}

// ============================================================================
//  Destructeur
// ============================================================================

Temperature::~Temperature() = default;



#endif // _TEMPERATURE_CPP_
