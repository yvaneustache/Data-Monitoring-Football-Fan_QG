/**
 * @file Logger.cpp
 *
 * @brief Implémentation du système de journalisation pour ESP32.
 */

#ifndef _LOGGER_CPP_
#define _LOGGER_CPP_

// ============================================================================
//  Import des headers internes
// ============================================================================

#include "./Logger.hpp"

// ============================================================================
//  Constructeur
// ============================================================================

Logger::Logger(const char * name, bool fileEnabled):
name(name),
fileEnabled(fileEnabled),
filePath(std::string("/Logs/") + name + ".log"),
fileStopped(false)
{
    // Création du dossier de logs via POSIX
    struct stat st;
    if (stat("/littlefs/Logs", &st) != 0)
    {
        mkdir("/littlefs/Logs", 0755);

#if DEBUG == 1
        Serial.println("[Logger] Dossier /Logs créé");
        Serial.flush();
#endif
    }

#if DEBUG == 1
    Serial.printf("[Logger] Logger '%s' initialisé (fichier=%s)\n", name, fileEnabled ? filePath.c_str() : "désactivé");
    Serial.flush();
#endif
}

// ============================================================================
//  Destructeur
// ============================================================================

Logger::~Logger() = default;

// ============================================================================
//  Méthode static
// ============================================================================

std::string Logger::logString(const char * format, ...)
{
    va_list args;
    va_start(args, format);
    char buffer[LOGGER_MAX_MESSAGE_SIZE];
    std::vsnprintf(buffer, sizeof(buffer), format, args);
    va_end(args);

    return std::string(buffer);
}

// ============================================================================
//  Méthodes publiques
// ============================================================================

void Logger::info(const std::string & message)
{
    this->write(Level::INFO, message.c_str());
    return ;
}



void Logger::warning(const std::string & message)
{
    this->write(Level::WARNING, message.c_str());
    return ;
}



void Logger::error(const std::string & message)
{
    this->write(Level::ERROR, message.c_str());
    return ;
}

// ============================================================================
//  Méthodes privées
// ============================================================================

void Logger::write(Level level, const char * message)
{
    const std::string timestamp = this->getTimestamp();
    const char * levelStr       = this->levelToString(level);

    // Formatage de l'entrée complète
    char entry[LOGGER_MAX_MESSAGE_SIZE + 64];
    snprintf(entry, sizeof(entry), "[%s] [%s] %s", timestamp.c_str(), levelStr, message);

    // Sortie série
    if (DEBUG)
    {
        Serial.println(entry);
        Serial.flush();
    }

    // Sortie fichier si activée
    if (this->fileEnabled)
        this->writeFile(entry);

    return ;
}



void Logger::writeFile(const char * entry)
{
    // Taille de la nouvelle entrée qu'on va écrire
    const size_t entrySize = strlen(entry);

    // Construction du chemin POSIX complet (préfixe /littlefs obligatoire)
    std::string posixPath = std::string("/littlefs") + this->filePath;

    // Fichier plein : l'écriture s'arrête (elle reprend si le fichier est supprimé ou vidé)
    struct stat st;
    const size_t fileSize = stat(posixPath.c_str(), &st) == 0 ? (size_t)st.st_size : 0;
    if (fileSize + entrySize > LOGGER_MAX_FILE_SIZE)
    {
        this->setFileStopped(true, "fichier plein");
        return ;
    }

    // Écriture via fopen POSIX crée le fichier s'il n'existe pas
    FILE * fp = fopen(posixPath.c_str(), "a");

    if (!fp)
    {
        this->setFileStopped(true, errno == ENOSPC ? "plus de place sur LittleFS" : "ouverture impossible");
        return ;
    }

    // Échec d'écriture (plus de place sur LittleFS) : l'écriture s'arrête
    const bool written = fprintf(fp, "%s", entry) >= 0 && fflush(fp) == 0;
    const int  error   = errno;
    fclose(fp);

    if (!written)
    {
        this->setFileStopped(true, error == ENOSPC ? "plus de place sur LittleFS" : "écriture impossible");
        return ;
    }

    this->setFileStopped(false, nullptr);

    return ;
}



void Logger::setFileStopped(bool stopped, const char * reason)
{
    if (stopped == this->fileStopped)
        return ;

    this->fileStopped = stopped;

    if (stopped)
        Serial.printf("[Logger] Écriture de '%s' arrêtée : %s (max %u octets)\n", this->filePath.c_str(), reason, (unsigned)LOGGER_MAX_FILE_SIZE);
    else
        Serial.printf("[Logger] Écriture de '%s' reprise\n", this->filePath.c_str());

    return ;
}



const char * Logger::levelToString(Level level) const
{
    switch (level)
    {
        case Level::INFO:
            return "INFO";
        case Level::WARNING:
            return "WARNING";
        case Level::ERROR:
            return "ERROR";
        default:
            return "UNKNOWN";
    }

    return "";
}



std::string Logger::getTimestamp() const
{
    // Utilise millis()
    unsigned long ms      = millis();
    unsigned long seconds = ms / 1000;
    unsigned long minutes = seconds / 60;
    unsigned long hours   = minutes / 60;

    char buffer[16];
    snprintf(buffer, sizeof(buffer), "%02lu:%02lu:%02lu.%03lu",
        hours   % 24,
        minutes % 60,
        seconds % 60,
        ms      % 1000);

    return std::string(buffer);
}

#endif // _LOGGER_CPP_
