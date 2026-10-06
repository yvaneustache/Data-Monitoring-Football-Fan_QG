/**
 * @file INMP441.hpp
 * 
 * @brief Déclaration de la classe INMP441.
 *
 * Implémentation concrète d'un capteur acoustique communiquant via I2S. Hérite de Acoustic.
 *
 * Mesure selon INMP441_SLM (cf. setting.hpp) :
 *   - 1 : Leq pondéré A (dB SPL) sur ACQUISITION_TIME, méthode esp32-i2s-slm ;
 *   - 0 : RMS d'un bloc de 64 ms, échelle arbitraire (ancienne méthode).
 *
 * Format JSON produit:
 * @code{.json}
 * {
 *   "t": "acoustic",
 *   "n": "INMP441",
 *   "id": <int>,
 *   "db": [<float>]
 * }
 * @endcode
 */

#ifndef _INMP441_HPP_
#define _INMP441_HPP_

// ============================================================================
//  Import des headres externes
// ============================================================================

#include <string>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <driver/i2s.h>

// ============================================================================
//  Import des headers internes
// ============================================================================

#include "../Acoustic.hpp"
#include "../../../Config/setting.hpp"
#include "../../../Utils/sensorType.hpp"
#include "../../../Utils/state.hpp"
#include "../../../Utils/Logger/Logger.hpp"

// ============================================================================
//  Configuration des registres
// ============================================================================

/**
 * @defgroup CONFIG_INMP441 Configuration des échanges de données via I2S
 */

#define I2S_PORT I2S_NUM_0    ///< @brief Port du protocol I2S.
#define MIC_WARMUP_DURATION_MS 3000 ///< @brief Durée de stabilisation du capteur au démarrage (lecture et rejet des données).

#if INMP441_SLM == 1
#define I2S_SAMPLE_RATE 48000                    ///< @brief Nombre d'échantillon par seconde (fixé par la conception des filtres IIR).
#define I2S_BUFFER_SIZE (I2S_SAMPLE_RATE / 8)    ///< @brief Taille d'un bloc lu (125 ms).
#define I2S_DMA_BUF_LEN (I2S_BUFFER_SIZE / 16)   ///< @brief Taille d'un buffer DMA.
#define I2S_DMA_BUF_COUNT 32                     ///< @brief Nombre de buffers DMA (250 ms au total).
#else
#define I2S_SAMPLE_RATE 16000 ///< @brief Nombre d'échantillon par seconde.
#define I2S_BUFFER_SIZE 1024  ///< @brief Taille du buffer d'échange de données.
#define I2S_DMA_BUF_LEN I2S_BUFFER_SIZE ///< @brief Taille d'un buffer DMA.
#define I2S_DMA_BUF_COUNT 4             ///< @brief Nombre de buffers DMA.
#endif

/*
 * @}
 */

#if INMP441_SLM == 1
/**
 * @defgroup SLM_INMP441 Caractéristiques du microphone (datasheet INMP441, cf. esp32-i2s-slm)
 * @{
 */

#define MIC_SENSITIVITY  -26     ///< @brief Sensibilité en dBFS à MIC_REF_DB.
#define MIC_REF_DB       94.0    ///< @brief Niveau de référence de la sensibilité (dB SPL).
#ifndef INMP441_CALIBRATION_DB
#define INMP441_CALIBRATION_DB 0.0 ///< @brief Correction de calibration (cf. setting.hpp).
#endif
#define MIC_OFFSET_DB    (3.0103 + INMP441_CALIBRATION_DB) ///< @brief Décalage RMS d'une sinusoïde vs dBFS + correction de calibration mesurée.
#define MIC_OVERLOAD_DB  116.0   ///< @brief Point de surcharge acoustique (dB SPL), valeur envoyée en cas de saturation.
#define MIC_NOISE_DB     29.0    ///< @brief Bruit de fond (dB SPL), valeur envoyée en dessous.
#define MIC_BITS         24      ///< @brief Nombre de bits valides dans les données I2S.

/*
 * @}
 */
#else
#define RMS_REFERENCE 120 ///< @brief Valeur référence pour la convertion en décibel.
#endif

/**
 * @class INMP441
 * 
 * @brief Capteur acoustique INMP441 via I2S
 */
class INMP441: public Acoustic
{

// ============================================================================
//  Type INMP441Data
// ============================================================================

    private:
        /**
         * @struct INMP411Data
         * 
         * @brief Données brutes collectées auprès du INMP441.
         */
        struct INMP441Data
        {
            int decibelIndex = 0;    ///< @brief Taille courante du buffer de décibel.
            float decibel[NB_VALUE]; ///< @brief Buffer de décibel en db.
        };
        using INMP441Data = struct INMP441Data;

// ============================================================================
//  Attribut static
// ============================================================================

    public:
        static const std::string name; ///< @brief Nom du capteur.
    private:
        static Logger * logger; /// <@brief Logger qui écrit les logs dans un fichier.

// ============================================================================
//  Attribut
// ============================================================================

    private:
        INMP441Data data; ///< @brief Dernières données collectées.
        
        int stadiumBleacherId; ///< @brief Identifiant de la tribune.

        static int32_t audioSample[I2S_BUFFER_SIZE];

#if INMP441_SLM == 1
        static float filteredSample[I2S_BUFFER_SIZE]; ///< @brief Échantillons convertis puis filtrés.
#else
        double dcBlockerLastX = 0.0; ///< @brief Dernier échantillon brut, mémoire du filtre DC-blocker.
        double dcBlockerLastY = 0.0; ///< @brief Dernier échantillon filtré, mémoire du filtre DC-blocker.
#endif

// ============================================================================
//  Constructeur
// ============================================================================

    public:
        /**
         * @brief Construit un capteur INMP441.
         */
        INMP441(int stadiumBleacherId);

// ============================================================================
//  Destructeur
// ============================================================================

    public:
        /**
         * @brief Destruction du capteur INMP441.
         */
        virtual ~INMP441();

// ============================================================================
//  Méthode static
// ============================================================================

    public:
        /**
         * @brief Sérialise les données du INMP441 en chaîne JSON.
         * 
         * @param data              Référence vers la stucture INMP441Data à sérialiser.
         * @param stadiumBleacherId Identifiant de la tribune à inclure dans le JSON.
         * 
         * @return std::string Chaîne JSON terminée par un saut de ligne.
         */
        static std::string formatData(INMP441Data & data, int stadiumBleacherId);

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



#endif // _INMP441git_HPP_