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
#define SUPPORTER_ID 1 ///< @brief Identifiant numérique unique du porteur du capteur (0 = Pas de supporter).

// ============================================================================
//  ID de la tribune du stade
// ============================================================================

// À MODIFIER
#define STADIUM_BLEACHER_ID 0 ///< @brief Identifiant numérique unique de la tribune du stade dans laquelle est placé le capteur (0 = Pas de tribune).

// ============================================================================
//  Paramètres des capteurs
// ============================================================================

// À MODIFIER
#define NB_SENSOR 1 ///< @brief Nombre de capteurs total du système.

#define ACQUISITION_TIME 1000 ///< @brief Temps de délais entre les acquisitions du capteur (en miliseconde).

/**
 * @defgroup Capteur Sélection du capteur actif
 * @{
 */

// Définir exactement UNE de ces macros pour activer le capteur correspondant.

// #define POLARH10 1 ///< @brief Active le capteur Polar H10.
// #define MAC_ADDRESS "c7:6f:37:f6:01:36" ///< @brief Adresse MAC Bluetooth Low Energy du Polar H10 cible (format "xx:xx:xx:xx:xx:xx").

#define MINIMU_9_V6 1 ///< @brief Active le capteur MinIMU-9 v6.

//#define _INMP441_ 1 ///< @brief Active le capteur INMP441.

/**
 * @}
 */

// ============================================================================
//  Paramètres de debug
// ============================================================================

#define DEBUG               1 ///< @brief Activation des messages de debug sur le port série (Serial).
#define BAUDRATE_DEBUG 115200 ///< @brief Vitesse de communication UART en bauds.

// ============================================================================
//  Paramètres du Duty Cycle
// ============================================================================

#define DUTY_CYCLE_TIME 15000 ///< @brief Interval de temps d'envoi des données pour respecter le duty cycle

// ============================================================================
//  Paramètres UART
// ============================================================================

#define RX_PIN       44 ///< @brief Broche RX de l'UART externe (Serial1).
#define TX_PIN       43 ///< @brief Broche TX de l'UART externe (Serial1).
#define BAUDRATE 115200 ///< @brief Vitesse de communication UART en bauds.

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

#define NB_VALUE_FOR_SENSOR (DUTY_CYCLE_TIME / ACQUISITION_TIME) ///< @brief Nombre de valeur du buffer pour un capteur
#if NB_SENSOR <= 0
#error "Erreur de configuration: Le nombre de capteur est invalide"
#else
#define NB_VALUE (NB_VALUE_FOR_SENSOR * NB_SENSOR) ///< @brief Nombre de valeur du buffer en fonction du nombre total de capteur
#endif



#endif // _SETTING_HPP_
