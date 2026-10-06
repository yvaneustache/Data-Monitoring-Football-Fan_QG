/**
 * @file main.cpp
 * 
 * @brief Point d'entrée principal du firmware de la carte électronique.
 *
 * Initialise le capteur configuré dans setting.hpp ainsi que l'interface UART externe, puis boucle en envoyant les données du capteur via UART toutes les secondes lorsque celui-ci est connecté.
 */

// ============================================================================
//  Import des headers externes
// ============================================================================

#include <string>
#include <Arduino.h>
#include <LittleFS.h>

// ============================================================================
//  Import des headers internes
// ============================================================================

#include "./Sensor/Sensor.hpp"
#include "./Utils/UARTManager/UARTManager.hpp"
#include "./Utils/LEDManager/LEDManager.hpp"
#include "./Config/setting.hpp"
#include "./Config/initSensor.hpp"
#include "./Utils/Logger/Logger.hpp"
#include "./Config/Log/Log.hpp"

// ============================================================================
//  Import des capteurs
// ============================================================================

#ifdef POLARH10
#include "./Sensor/HeartRate/PolarH10/PolarH10.hpp"
#endif // POLATH10
#ifdef MINIMU_9_V6
#include "./Sensor/AccelerometerGyroscope/MinIMU-9_v6/MinIMU-9_v6.hpp"
#endif // MINIMU_9_V6
#ifdef _INMP441_
#include "./Sensor/Acoustic/INMP441/INMP441.hpp"
#endif // _INMP441_

// ============================================================================
//  Variable globale
// ============================================================================

Sensor * sensor           = nullptr; ///< @brief Pointeur vers le capteur actif. Initialisé dans setup().
UARTManager * uartManager = nullptr; ///< @brief Pointeur vers le gestionnaire UART externe. Initialisé dans setup().
LEDManager * ledManager = nullptr;   ///< @brief Pointeur vers le gestionnaire LED.
unsigned long lastSendMs  = 0;       ///< @brief Temps du dernier envoi de données
Logger * logger           = nullptr; ///< @brief Logger qui écrit les logs dans un fichier

// ============================================================================
//  Fonction setup
// ============================================================================

/**
 * @brief Initialisation du firmware (appelée une seule fois au démarrage).
 *
 * Initialisation des ports série et le capteur.
 */
void setup()
{
    Serial.begin(BAUDRATE_DEBUG);
    if (not LittleFS.begin(true))
        throw std::runtime_error("Le système de fichier LittleFS n'est pas monté");

    psramInit(); // Initialisation de la PSRAM requis avant toute instanciation de Logger

    logger = new Logger("Main", true);

    // Temps de délais pour script de récupération de log
    delay(5000);
    // Export automatique des logs au boot
    dumpLogsOnBoot();

#if DEBUG == 1
    logger->info(Logger::logString("[SETUP] Démarrage du firmware\n"));
#endif

    // Création d'une interface UART
    uartManager = new UARTManager(RX_PIN, TX_PIN, BAUDRATE);

    // Démarrage de l'interface UART
    uartManager->begin();

    // Création d'une interface LED
    ledManager = new LEDManager(LED_PIN);

    // Démarrage de l'interface LED
    ledManager->begin();

#if SUPPORTER_ID != 0
#define ID SUPPORTER_ID
#else
#define ID STADIUM_BLEACHER_ID
#endif
    
    // Initialisation du capteur
    sensor = new SENSOR(ID);

#if DEBUG == 1
    logger->info(Logger::logString("[SETUP] Capteur instancié: %s (supporter id: %d)\n", sensor->getSensorName().c_str(), SUPPORTER_ID));
#endif

    // Démarrage du capteur
    sensor->begin();

#if DEBUG == 1
    logger->info(Logger::logString("[SETUP] Initialisation terminée, entrée dans la boucle principale\n"));
#endif

    return ;
}

// ============================================================================
//  Fonction loop
// ============================================================================

/**
 * @brief Boucle principale du firmware (appelée en continu par Arduino).
 *
 * Met à jour l'état interne du capteur, envoie des mesure formatée en JSON via l'UART externe.
 */
void loop()
{
    // Mise à jour de la LED
    ledManager->toggle();

    // Début de l'itération
    unsigned long loopStartMs = millis();

    // Mise à jour du capteur
    sensor->update();

    // Mise à jour du temps
    unsigned long now = millis();

    // Si l’intervalle de temps est écoulé, on prépare et on envoie la trame
    if (now - lastSendMs >= DUTY_CYCLE_TIME)
    {
        lastSendMs = now; 

        // Vérifie la connexion du capteur
        if (sensor->isConnected())
        {
            // Récupération des données
            std::string dataString = sensor->getSensorData();
            size_t size = dataString.length();

            if (size != 0)
            {
                // Formatage des données: conversion std::string -> buffer uint8_t
                uint8_t * data = new uint8_t[size];
                memcpy(data, dataString.c_str(), size);

                // Envoi des données via UART externe
                size_t written = uartManager->writeBuffer(data, size);

#if DEBUG == 1
                if (written == size)
                {
                    logger->info(Logger::logString("[LOOP] Trame envoyée via UART (%u octets): %s", size, dataString.c_str()));
                }
                else
                {
                    logger->info(Logger::logString("[LOOP] AVERTISSEMENT - Envoi UART incomplet: %u/%u octets écrits\n", written, size));
                }
#endif

                delete [] data;
            }
#if DEBUG == 1
            else
                logger->info(Logger::logString("[LOOP] Capteur connecté mais aucune donnée disponible, attente de la prochaine notification\n"));
#endif
        }
#if DEBUG == 1
        else
            logger->info(Logger::logString("[LOOP] Capteur '%s' non connecté, en attente\n", sensor->getSensorName().c_str()));
#endif
    }

    // Délai entre chaque acquisition (déduction du temps déjà passé dans l'itération)
    unsigned long elapsedMs = millis() - loopStartMs;
    if (elapsedMs < ACQUISITION_TIME)
        delay(ACQUISITION_TIME - elapsedMs);

    return ;
}