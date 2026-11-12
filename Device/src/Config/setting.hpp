/**
 * @file setting.hpp
 * 
 * @brief Configuration globale du firmware.
 *
 * Centralise tous les paramètres modifiables du projet.
 */

#ifndef _SETTING_HPP_
#define _SETTING_HPP_

// ============================================================================
//  ID du supporter
// ============================================================================

// À MODIFIER
#define SUPPORTER_ID 0 ///< @brief Identifiant numérique unique du porteur du capteur (0 = Pas de supporter).
// [1-Yvan, 2-Ronan, 3-Alex, 4-Quentin, 5-Manoé]

// ============================================================================
//  ID de la tribune du stade
// ============================================================================

// À MODIFIER
#define STADIUM_BLEACHER_ID 5 ///< @brief Identifiant numérique unique de la tribune du stade dans laquelle est placé le capteur (0 = Pas de tribune).
// [1-Nord, 2-Sud, 3-Est, 4-Ouest, 5-Nord-Est, 6-Nord-Ouest, 7-Sud-Est, 8-Sud-Ouest, 9-Exterieur]

// ============================================================================
//  Paramètres des capteurs
// ============================================================================

// À MODIFIER
#define NB_SENSOR 1 ///< @brief Nombre de capteurs total du système.

/**
 * @defgroup Capteur Sélection du capteur actif
 * @{
 */

// Définir exactement UNE de ces macros pour activer le capteur correspondant.

//#define POLARH10 1 ///< @brief Active le capteur Polar H10.
    #define MAC_ADDRESS "C6:63:EB:94:E8:27" ///< @brief Adresse MAC Bluetooth Low Energy du Polar H10 cible (format "xx:xx:xx:xx:xx:xx").
    // 6315682D | C7:6F:37:F6:01:36 | Yvan
    // 63028A2F | CF:5C:1E:1B:04:CE | Ronan
    // 65AB7621 | C6:63:EB:94:E8:27 | Alex
    // 65C1312C | C5:58:19:6C:3F:B2 | Quentin
    // 6302862B | E3:BC:7E:55:74:C2 | Manoé

//#define MINIMU_9_V6 1 ///< @brief Active le capteur MinIMU-9 v6.

//#define _INMP441_ 1 ///< @brief Active le capteur INMP441.
    // Méthode de mesure du INMP441 :
    //   1 = Leq pondéré A en dB SPL sur toute la période d'acquisition (méthode esp32-i2s-slm : 48 kHz, égaliseur INMP441, pondération A)
    //   0 = ancienne mesure (RMS d'un bloc de 64 ms à 16 kHz, échelle arbitraire)
    #define INMP441_SLM 1 ///< @brief Méthode de mesure du capteur INMP441.
    // Correction linéaire du niveau mesuré par le INMP441 (méthode SLM uniquement), en dB.
    // Valeur = niveau du sonomètre de référence - niveau mesuré par le capteur, à conditions identiques.
    #define INMP441_CALIBRATION_DB -22.0 ///< @brief Correction de calibration du INMP441 (dB).

#define _DS18B20_ 1 ///< @brief Active le capteur de température DS18B20.
    // Période d'échantillonnage du DS18B20, de 1 s (1000) à 15 min (900000), en milliseconde :
    //   - moins de 15 s : les mesures sont mises en mémoire et envoyées ensemble toutes les 15 s (15 mesures pour 1 s) ;
    //   - 15 s et plus  : une seule mesure par message, un message par période.
    #define DS18B20_SAMPLE_PERIOD 1000 ///< @brief Période d'échantillonnage du DS18B20 (en milliseconde).

/**
 * @}
 */

// ============================================================================
//  Période d'acquisition
// ============================================================================

#ifdef _DS18B20_
#define ACQUISITION_TIME DS18B20_SAMPLE_PERIOD ///< @brief Temps de délais entre les acquisitions du capteur (en miliseconde).
#else
#define ACQUISITION_TIME 1000 ///< @brief Temps de délais entre les acquisitions du capteur (en miliseconde).
#endif

#if (ACQUISITION_TIME < 1000) || (ACQUISITION_TIME > 900000)
#error "Erreur de configuration: La période d'acquisition doit être comprise entre 1 s (1000) et 15 min (900000)"
#endif

// ============================================================================
//  Paramètres de debug
// ============================================================================

#define DEBUG               0 ///< @brief Activation des messages de debug sur le port série (Serial).
#define BAUDRATE_DEBUG 115200 ///< @brief Vitesse de communication UART en bauds.

// ============================================================================
//  Paramètres du Duty Cycle
// ============================================================================

// Un message au plus toutes les 15 s ; pour une période d'acquisition de 15 s ou plus, un message par acquisition
// (marge de 500 ms pour que chaque itération de la boucle principale déclenche l'envoi).
#if ACQUISITION_TIME >= 15000
#define DUTY_CYCLE_TIME (ACQUISITION_TIME - 500) ///< @brief Interval de temps d'envoi des données pour respecter le duty cycle
#else
#define DUTY_CYCLE_TIME 14500 ///< @brief Interval de temps d'envoi des données pour respecter le duty cycle
#endif

// ============================================================================ 
//  Paramètres UART
// ============================================================================

#define RX_PIN       44 ///< @brief Broche RX de l'UART externe (Serial1).
#define TX_PIN       43 ///< @brief Broche TX de l'UART externe (Serial1).
#define BAUDRATE 115200 ///< @brief Vitesse de communication UART en bauds.
#define UART_TX_BUFFER_SIZE 512 ///< @brief Taille du tampon d'émission UART en octets (supérieure à la taille d'une trame, au plus 233 octets pour Meshtastic).

// ============================================================================
//  Paramètres I2C
// ============================================================================

#define SDA_PIN 5 ///< @brief Broche SDA de la carte ESP32.
#define SCL_PIN 6 ///< @brief Broche SCL de la carte ESP32.

// ============================================================================
//  Paramètres I2S
// ============================================================================

#define WS_PIN  5 ///< @brief Broche WS de la carte ESP32.
#define SCK_PIN 6 ///< @brief Broche SCK de la carte ESP32.
#define SD_PIN  7 ///< @brief Broche SD de la carte ESP32.

// ============================================================================
//  Paramètres 1-Wire
// ============================================================================

#define ONE_WIRE_PIN 5 ///< @brief Broche DATA du bus 1-Wire (GPIO5 = D4 de la XIAO ESP32-S3, partagée avec SDA / WS : un seul capteur par carte), avec résistance de tirage de 4,7 kOhm vers 3V3.

// ============================================================================
//  Paramètres LED
// ============================================================================

#define LED_PIN 21 ///< @brief Broche GPIO de la LED de la carte ESP32.

// ============================================================================
//  Paramètres de logs
// ============================================================================

#if DEBUG == 0
#define NB_LOGGER                 1 ///< @brief Nombre de logger présent sur la carte.
#else
#define NB_LOGGER                 5 ///< @brief Nombre de logger présent sur la carte.
#endif
#define LOGGER_MAX_MESSAGE_SIZE 256 ///< @brief Taille maximale d'un message de log en caractères.

#if NB_LOGGER <= 0
#error "Erreur de configuration: Le nombre de logger est invalide"
#else
#define LOGGER_MAX_FILE_SIZE (((1024 * 1024) * 6) / NB_LOGGER) ///< @brief Taille maximale d'un fichier de log en octets.
#endif

// ============================================================================
//  Capacité du buffer de données
// ============================================================================

//#define NB_VALUE_FOR_SENSOR (DUTY_CYCLE_TIME / ACQUISITION_TIME) ///< @brief Nombre de valeur du buffer pour un capteur
#define NB_VALUE_FOR_SENSOR ((DUTY_CYCLE_TIME + ACQUISITION_TIME - 1) / ACQUISITION_TIME)
#if NB_SENSOR <= 0
#error "Erreur de configuration: Le nombre de capteur est invalide"
#else
#define NB_VALUE (NB_VALUE_FOR_SENSOR * NB_SENSOR) ///< @brief Nombre de valeur du buffer en fonction du nombre total de capteur
#endif



#endif // _SETTING_HPP_
