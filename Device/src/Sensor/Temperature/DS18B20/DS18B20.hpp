/**
 * @file DS18B20.hpp
 *
 * @brief Déclaration de la classe DS18B20.
 *
 * Implémentation concrète d'un capteur de température communiquant via le bus 1-Wire. Hérite de Temperature.
 *
 * La conversion (750 ms en résolution 12 bits) est lancée à la fin d'une mise à jour et lue à la suivante,
 * pour ne pas bloquer la boucle principale. Une mesure invalide (sonde absente, erreur de lecture) est
 * envoyée à null.
 *
 * La période d'échantillonnage (DS18B20_SAMPLE_PERIOD, de 1 s à 15 min) fixe le nombre de mesures par message :
 * 15 mesures envoyées toutes les 15 s pour 1 s, une seule mesure par message à partir de 15 s.
 *
 * Format JSON produit:
 * @code{.json}
 * {
 *   "t" : 6,
 *   "id": <int>,
 *   "s" : <int, compteur d'envois de 0 à 999>,
 *   "p" : <int, période entre deux mesures en secondes>,
 *   "a" : [<float en °C | null>]
 * }
 * @endcode
 */

#ifndef _DS18B20_HPP_
#define _DS18B20_HPP_

// ============================================================================
//  Import des headers externes
// ============================================================================

#include <string>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ============================================================================
//  Import des headers internes
// ============================================================================

#include "../Temperature.hpp"
#include "../../../Config/setting.hpp"
#include "../../../Utils/sensorType.hpp"
#include "../../../Utils/state.hpp"
#include "../../../Utils/Logger/Logger.hpp"

// ============================================================================
//  Configuration
// ============================================================================

/**
 * @defgroup CONFIG_DS18B20 Configuration du capteur DS18B20
 * @{
 */

#define DS18B20_RESOLUTION 12 ///< @brief Résolution de la mesure en bits (9 à 12 : 0,5 °C à 0,0625 °C, 94 ms à 750 ms de conversion).

/*
 * @}
 */

/**
 * @class DS18B20
 *
 * @brief Capteur de température DS18B20 via 1-Wire
 */
class DS18B20: public Temperature
{

// ============================================================================
//  Type DS18B20Data
// ============================================================================

    private:
        /**
         * @struct DS18B20Data
         *
         * @brief Données collectées auprès du DS18B20.
         */
        struct DS18B20Data
        {
            int temperatureIndex = 0;     ///< @brief Position courante dans le buffer de température.
            float temperature[NB_VALUE];  ///< @brief Buffer de température en °C (NAN si mesure invalide).
        };
        using DS18B20Data = struct DS18B20Data;

// ============================================================================
//  Attribut static
// ============================================================================

    public:
        static const std::string name; ///< @brief Nom du capteur.
    private:
        static Logger * logger; ///< @brief Logger qui écrit les logs dans un fichier.

// ============================================================================
//  Attribut
// ============================================================================

    private:
        DS18B20Data data; ///< @brief Dernières données collectées.

        int stadiumBleacherId; ///< @brief Identifiant de la tribune (ou du supporter).

        OneWire oneWire;              ///< @brief Bus 1-Wire.
        DallasTemperature sensors;    ///< @brief Gestion des sondes du bus.
        DeviceAddress address;        ///< @brief Adresse de la sonde utilisée (la première du bus).
        bool conversionPending = false; ///< @brief Une conversion a été lancée et n'a pas encore été lue.

// ============================================================================
//  Constructeur
// ============================================================================

    public:
        /**
         * @brief Construit un capteur DS18B20.
         *
         * @param stadiumBleacherId Identifiant de la tribune à inclure dans le JSON.
         */
        DS18B20(int stadiumBleacherId);

// ============================================================================
//  Destructeur
// ============================================================================

    public:
        /**
         * @brief Destruction du capteur DS18B20.
         */
        virtual ~DS18B20();

// ============================================================================
//  Méthode static
// ============================================================================

    public:
        /**
         * @brief Sérialise les données du DS18B20 en chaîne JSON.
         *
         * @param data              Référence vers la stucture DS18B20Data à sérialiser.
         * @param stadiumBleacherId Identifiant de la tribune à inclure dans le JSON.
         *
         * @return std::string Chaîne JSON terminée par un saut de ligne.
         */
        static std::string formatData(DS18B20Data & data, int stadiumBleacherId);

// ============================================================================
//  Méthode
// ============================================================================

    public:
        /**
         * @copydoc Sensor::begin()
         */
        void begin() override;

        /**
         * @copydoc Sensor::update()
         */
        void update() override;

        /**
         * @copydoc Sensor::end()
         */
        void end() override;

        /**
         * NOT USE
         */
        void notify(NimBLERemoteCharacteristic *, uint8_t *, size_t);

};



#endif // _DS18B20_HPP_
