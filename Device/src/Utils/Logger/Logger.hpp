/**
 * @file Logger.hpp
 *
 * @brief Déclaration de la classe Logger.
 *
 * Fournit la classe Logger permettant d'écrire des messages horodatés sur le port série et optionnellement sur le système de fichiers LittleFS. Le fichier grossit jusqu'à LOGGER_MAX_FILE_SIZE ; quand il est plein, ou qu'il n'y a plus de place sur LittleFS, l'écriture dans le fichier s'arrête (les messages restent envoyés sur le port série). Elle reprend d'elle-même si de la place est libérée (suppression du fichier par la console, cf. Config/Log/Log.hpp).
 */

#ifndef _LOGGER_HPP_
#define _LOGGER_HPP_

// ============================================================================
//  Import des headers externes
// ============================================================================

#include <Arduino.h>
#include <sys/stat.h>
#include <errno.h>
#include <stdarg.h>
#include <stdio.h>

// ============================================================================
//  Import des headers internes
// ============================================================================

#include "../../Config/setting.hpp"

// ============================================================================
//  Classe
// ============================================================================

/**
 * @class Logger
 *
 * @brief Journaliseur horodaté avec sortie série et fichier LittleFS.
 *        Le fichier est tronqué en tête automatiquement quand il est plein.
 */
class Logger
{

// ============================================================================
//  Enumération
// ============================================================================

    public:
        /**
         * @brief Niveau de sévérité d'un message de log.
         */
        enum class Level : uint8_t
        {
            INFO    = 0,  ///< @brief Message informatif.
            WARNING = 1,  ///< @brief Avertissement non bloquant.
            ERROR   = 2   ///< @brief Erreur bloquante ou critique.
        };

// ============================================================================
//  Attributs
// ============================================================================

    private:
        const char * name;     ///< @brief Nom du module affiché en préfixe.
        bool fileEnabled;      ///< @brief Écriture fichier LittleFS activée.
        std::string filePath;  ///< @brief Chemin du fichier de log sur LittleFS.
        bool fileStopped;      ///< @brief Écriture fichier arrêtée (fichier plein ou plus de place) : message affiché une seule fois.

// ============================================================================
//  Constructeur
// ============================================================================

    public:
        /**
         * @brief Initialise le logger avec son nom de module.
         *
         * @param name        Nom du module affiché en préfixe (ex : "MQTT").
         * @param fileEnabled Active l'écriture dans LittleFS si true. Désactivé par défaut.
         */
        Logger(const char * name, bool fileEnabled);

// ============================================================================
//  Destructeur
// ============================================================================

    public:
        /**
         * @brief Destructeur par défaut.
         */
        ~Logger();

// ============================================================================
//  Méthode static
// ============================================================================

    public:
        /**
         * @brief Créer une chaine de caractère pour les message de log.
         * 
         * @param format Le format de la chaine.
         * 
         * @return std::string La chaine de caractère.
         */
        static std::string logString(const char * format, ...);

// ============================================================================
//  Méthodes publiques
// ============================================================================

    public:
        /**
         * @brief Journalise un message de niveau INFO.
         *
         * @param message Message à journaliser.
         */
        void info(const std::string & message);

        /**
         * @brief Journalise un message de niveau WARNING.
         *
         * @param message Message à journaliser.
         */
        void warning(const std::string & message);

        /**
         * @brief Journalise un message de niveau ERROR.
         *
         * @param message Message à journaliser.
         */
        void error(const std::string & message);

// ============================================================================
//  Méthodes privées
// ============================================================================

    private:
        /**
         * @brief Écrit une entrée formatée sur le port série et/ou fichier.
         *
         * @param level   Niveau de sévérité.
         * @param message Message à écrire.
         */
        void write(Level level, const char * message);

        /**
         * @brief Écrit une entrée dans le fichier LittleFS, sauf si le fichier est plein ou s'il n'y a plus de place.
         *
         * @param entry Ligne complète formatée à écrire.
         */
        void writeFile(const char * entry);

        /**
         * @brief Arrête ou reprend l'écriture dans le fichier, avec un message sur le port série au changement d'état.
         *
         * @param stopped Écriture arrêtée.
         * @param reason  Raison de l'arrêt (message).
         */
        void setFileStopped(bool stopped, const char * reason);

        /**
         * @brief Retourne le label texte d'un niveau de sévérité.
         *
         * @param level Niveau de sévérité.
         *
         * @return Chaîne statique "INFO", "WARNING" ou "ERROR".
         */
        const char * levelToString(Level level) const;

        /**
         * @brief Retourne l'horodatage courant sous forme de chaîne. Utilise millis() si aucun RTC n'est disponible, ou la date/heure réelle si un RTC est configuré.
         *
         * @return Chaîne formatée de l'horodatage.
         */
        std::string getTimestamp() const;
};



#endif // _LOGGER_HPP_