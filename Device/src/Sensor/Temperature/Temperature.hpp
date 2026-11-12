/**
 * @file Temperature.hpp
 *
 * @brief Déclaration de la classe abstraite Temperature.
 *
 * Classe intermédiaire dans la hiérarchie des capteurs. Spécialise Sensor pour les capteurs de température.
 */

#ifndef _TEMPERATURE_HPP_
#define _TEMPERATURE_HPP_

// ============================================================================
//  Import des headers externes
// ============================================================================

#include <string>

// ============================================================================
//  Import des headers internes
// ============================================================================

#include "../Sensor.hpp"
#include "../../Utils/sensorType.hpp"



/**
 * @class Temperature
 *
 * @brief Classe abstraite intermédiaire pour les capteurs de température.
 */
class Temperature: public Sensor
{

// ============================================================================
//  Attribut static
// ============================================================================

    public:
        static const SensorType type; ///< @brief Type du capteur.

// ============================================================================
//  Constructeur
// ============================================================================

    public:
        /**
         * @brief Construit un capteur Temperature avec le nom donné.
         *
         * @param name Nom du capteur concret.
         */
        Temperature(std::string name);

// ============================================================================
//  Destructeur
// ============================================================================

    public:
        /**
         * @brief Destructeur d'un capteur Temperature.
         */
        virtual ~Temperature();

// ============================================================================
//  Méthode
// ============================================================================

    public:
        /**
         * @copydoc Sensor::begin()
         */
        virtual void begin() = 0;
        /**
         * @copydoc Sensor::end()
         */
        virtual void end() = 0;
        /**
         * @copydoc Sensor::update()
         */
        virtual void update() = 0;

};



#endif // _TEMPERATURE_HPP_
