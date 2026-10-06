/**
 * @file MinIMU-9_v6.hpp
 * 
 * @brief Déclaration de la classe MinIMU_9_v6.
 *
 * Implémentation concrète d'un capteur accéléromètre et gyroscope communiquant via I2C. Hérite de AccelerometerGyroscope.
 *
 * Format JSON produit:
 * @code{.json}
 * {
 *   "t" : "accelerometer_gyroscope",
 *   "n" : "MinUMI-9 v6",
 *   "id": <int>,
 *   "a" : [<float>],
 * }
 * @endcode
 *
 * Chaque valeur de "a" est le maximum de |‖a‖ - g| (accélération dynamique, en m/s²) observé sur une fenêtre d'acquisition de ACQUISITION_TIME ms,
 * g étant la norme mesurée au repos lors de la calibration au démarrage.
 */

#ifndef _MINIMU_9_V6_HPP_
#define _MINIMU_9_V6_HPP_

// ============================================================================
//  Import des headres externes
// ============================================================================

#include <string>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Wire.h>

// ============================================================================
//  Import des headers internes
// ============================================================================

#include "../AccelerometerGyroscope.hpp"
#include "../../../Config/setting.hpp"
#include "../../../Utils/sensorType.hpp"
#include "../../../Utils/state.hpp"
#include "../../../Utils/Logger/Logger.hpp"

// ============================================================================
//  Configuration des registres
// ============================================================================

/**
 * @defgroup CONFIG_MINIMU_9_V6 Configuration des registres du capteur MinIMU-9 v6
 * @{
 */

#define LSM6DS33_ADDRESS 0x6B ///< @brief Adresse de l'accéléromètre et du gyroscope.
#define LIS3MDL_ADDRESS  0x1E ///< @brief Adresse du magnétomètre.

#define REGISTER_ACCELEROMETER_NUMBER 0x10 ///< @brief Numéro du registre de l'accéléromètre.
#define REGISTER_ACCELEROMETER_OUT    0x28 ///< @brief Numéro du registre de sortie de l'accéléromètre.
#define REGISTER_ACCELEROMETER_VALUE  0x80 ///< @brief Valeur du registre de l'accéléromètre.
#define REGISTER_GYROSCOPE_NUMBER     0x11 ///< @brief Numéro du registre du gyroscope.
#define REGISTER_GYROSCOPE_OUT        0x22 ///< @brief Numéro du registre de sortie du gyroscope.
#define REGISTER_GYROSCOPE_VALUE      0x80 ///< @brief Valeur du registre du gyroscope.
#define REGISTER_MAGNETOMETER_NUMBER  0x21 ///< @brief Numéro du registre du magnétomètre.
#define REGISTER_MAGNETOMETER_OUT     0x28 ///< @brief Numéro du registre de sortie du magnétomètre.
#define REGISTER_MAGNETOMETER_VALUE   0x0  ///< @brief Valeur du registre du magnétomètre.

#define ACCELEROMETER_SENSITIVITY 0.000061 ///< @brief Sensibilité de l'accéléromètre.
#define GYROSCOPE_SENSITIVITY     0.00875  ///< @brief Sensibilité du gyroscope.
#define MAGNETOMETER_SENSITIVITY  6842     ///< @brief Sensibilité du magnétomètre.

#define ACCELEROMETER_SAMPLE_PERIOD 10 ///< @brief Période d'échantillonnage de l'accéléromètre pendant une fenêtre d'acquisition (en milliseconde).

#define GRAVITY_CALIBRATION_DURATION 2000 ///< @brief Durée de la calibration de la gravité au démarrage, capteur immobile (en milliseconde).
#define GRAVITY_CALIBRATION_MIN      8.0  ///< @brief Norme minimale acceptée pour la gravité calibrée (m/s²).
#define GRAVITY_CALIBRATION_MAX      11.5 ///< @brief Norme maximale acceptée pour la gravité calibrée (m/s²).

/*
 * @}
 */

/**
 * @class MinIMU_9_v6
 * 
 * @brief Capteur accéléromètre et gyroscope MinIMU-9 v6 via I2C
 */
class MinIMU_9_v6: public AccelerometerGyroscope
{

// ============================================================================
//  Type MinIMU_9_v6Data
// ============================================================================

    private:
        /**
         * @struct MinIMU_9v6Data
         * 
         * @brief Données brutes collectées auprès du MinIMU-9 v6.
         */
        struct MinIMU_9_v6Data
        {
            int dataIndex = 0;                               ///< @brief Taille courante des buffers de données.
            float accelerometer[NB_VALUE][3] = {-1, -1, -1}; ///< @brief Buffer de données de l'accéléromètre.
            float accelerationMax[NB_VALUE]  = {};           ///< @brief Buffer du maximum de |‖a‖ - g| sur chaque fenêtre d'acquisition.
        };
        using MinIMU_9_v6Data = struct MinIMU_9_v6Data;

// ============================================================================
//  Attribut static
// ============================================================================

    public:
        static const std::string name; ///< @brief Nom du capteur.
        static const float g1;         ///< @brief Constante de gravitation.
    private:
        static Logger * logger; /// <@brief Logger qui écrit les logs dans un fichier.

// ============================================================================
//  Attribut
// ============================================================================

    private:
        MinIMU_9_v6Data data;  ///< @brief Dernières données collectées.

        float gravity = MinIMU_9_v6::g1; ///< @brief Norme de la gravité mesurée au repos lors de la calibration (m/s²).
        
        int stadiumBleacherId; ///< @brief Identifiant de la tribune du stade.

// ============================================================================
//  Constructeur
// ============================================================================

    public:
        /**
         * @brief Construit un capteur MinIMU-9 v6.
         */
        MinIMU_9_v6(int stadiumBleacherId);

// ============================================================================
//  Destructeur
// ============================================================================

    public:
        /**
         * @brief Destruction du capteur MinIMU-9 v6.
         */
        virtual ~MinIMU_9_v6();

// ============================================================================
//  Méthode static
// ============================================================================

    public:
        /**
         * @brief Sérialise les données du MinIMU-9 v6 en chaîne JSON.
         * 
         * @param data Référence vers la stucture MinIMU_9_v6Data à sérialiser.
         * @param stadiumBleacherId Identifiant de la tribune à inclure dans le JSON.
         * 
         * @return std::string Chaîne JSON terminée par un saut de ligne.
         */
        static std::string formatData(MinIMU_9_v6Data & data, int stadiumBleacherId);

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
         * @brief Calibre la gravité : moyenne de la norme de l'accélération, capteur immobile.
         */
        void calibrateGravity();

        /**
         * @brief Lis le registre de l'addresse donné.
         * 
         * @param address
         * @param registerAddress
         * @param out
         */
        void readRegister(uint8_t address, uint8_t registerAddress, int * out);

        /**
         * @brief Écrit dans le registre de l'addresse donné.
         * 
         * @param address
         * @param registerAddress
         * @param value
         */
        void writeRegister(uint8_t address, uint8_t registerAddress, uint8_t value);

        /**
         * NOT USE
         */
        void notify(NimBLERemoteCharacteristic *, uint8_t *, size_t);

};



#endif // _MINIMU_9_V6_HPP_
