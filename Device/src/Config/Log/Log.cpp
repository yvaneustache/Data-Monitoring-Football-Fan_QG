/**
 * @file Log.cpp
 *
 * @brief Implémentation de l'export automatique des logs LittleFS.
 */

#ifndef _LOG_CPP_
#define _LOG_CPP_

// ============================================================================
//  Import des bibliothèques
// ============================================================================

#include "./Log.hpp"

// ============================================================================
//  Constantes
// ============================================================================

static const char * FILE_START = "<<<FILE_START:";   ///< @brief Préfixe du marqueur de début de fichier suivi du chemin absolu.
static const char * FILE_END   = "<<<FILE_END>>>";   ///< @brief Marqueur de fin de fichier détecté par le script bash.
static const char * CMD_START  = "<<<CMD_START:";    ///< @brief Préfixe du marqueur de début de réponse d'une commande, suivi de la commande.
static const char * CMD_END    = "<<<CMD_END>>>";    ///< @brief Marqueur de fin de réponse d'une commande.
static const char * LOG_DIR    = "/littlefs/Logs";   ///< @brief Dossier des logs (chemin POSIX).

static constexpr size_t COMMAND_MAX_SIZE = 128; ///< @brief Taille maximale d'une commande.

static constexpr uint8_t LINE_DELAY_MS = 2; ///< @brief Délai en ms entre chaque ligne envoyée.

// ============================================================================
//  Fonctions privées
// ============================================================================

/**
 * @brief Envoie le contenu d'un fichier sur le port série via l'API POSIX.
 *
 * @param path Chemin absolu du fichier sur LittleFS (ex : "/Logs/mqtt.log").
 */
static void dumpFile(const char * path)
{
    // Construction du chemin POSIX complet
    std::string posixPath = std::string("/littlefs") + path;

    FILE * fp = fopen(posixPath.c_str(), "r");

    if (!fp)
    {
        Serial.printf("<<<ERROR: Impossible d'ouvrir %s (errno=%d)>>>\n", path, errno);
        return ;
    }

    // Marqueur de début avec le chemin complet du fichier
    Serial.printf("%s%s>>>\n", FILE_START, path);

    // Envoi du contenu ligne par ligne avec délai anti-saturation
    char line[512];
    while (fgets(line, sizeof(line), fp))
    {
        // Suppression du '\n' final pour éviter le double saut de ligne avec println
        size_t len = strlen(line);
        if (len > 0 && line[len - 1] == '\n')
            line[len - 1] = '\0';

        Serial.println(line);
        delay(LINE_DELAY_MS);
    }

    Serial.println(FILE_END);
    fclose(fp);

    return ;
}

// ============================================================================
//  Console de gestion des fichiers
// ============================================================================

/**
 * @brief Vérifie qu'un nom de fichier désigne un fichier de /Logs/ (pas de chemin, pas de "..").
 */
static bool isValidFileName(const std::string & name)
{
    return !name.empty() && name.find('/') == std::string::npos && name.find("..") == std::string::npos;
}



/**
 * @brief ls : liste des fichiers de /Logs/ avec leur taille, puis occupation de LittleFS.
 */
static void listFiles()
{
    DIR * dir = opendir(LOG_DIR);
    size_t count = 0;
    size_t total = 0;

    if (dir)
    {
        struct dirent * entry;
        while ((entry = readdir(dir)) != nullptr)
        {
            std::string path = std::string(LOG_DIR) + "/" + entry->d_name;
            struct stat st;
            if (stat(path.c_str(), &st) != 0 || !S_ISREG(st.st_mode))
                continue;

            Serial.printf("%-28s %10u octets\n", entry->d_name, (unsigned)st.st_size);
            count++;
            total += st.st_size;
        }
        closedir(dir);
    }

    Serial.printf("%u fichier(s), %u octets\n", (unsigned)count, (unsigned)total);
    Serial.printf("LittleFS : %u / %u octets utilisés\n", (unsigned)LittleFS.usedBytes(), (unsigned)LittleFS.totalBytes());

    return ;
}



/**
 * @brief rm : suppression d'un fichier de /Logs/, ou de tous ("*").
 */
static void removeFiles(const std::string & name)
{
    if (name == "*")
    {
        DIR * dir = opendir(LOG_DIR);
        size_t count = 0;

        if (dir)
        {
            struct dirent * entry;
            std::vector<std::string> paths;
            while ((entry = readdir(dir)) != nullptr)
                paths.push_back(std::string(LOG_DIR) + "/" + entry->d_name);
            closedir(dir);

            // Suppression après le parcours du dossier
            for (const std::string & path : paths)
            {
                struct stat st;
                if (stat(path.c_str(), &st) == 0 && S_ISREG(st.st_mode) && remove(path.c_str()) == 0)
                    count++;
            }
        }

        Serial.printf("%u fichier(s) supprimé(s)\n", (unsigned)count);
        return ;
    }

    if (!isValidFileName(name))
    {
        Serial.printf("<<<ERROR: Nom de fichier invalide : '%s'>>>\n", name.c_str());
        return ;
    }

    std::string path = std::string(LOG_DIR) + "/" + name;
    if (remove(path.c_str()) == 0)
        Serial.printf("Fichier supprimé : %s\n", name.c_str());
    else
        Serial.printf("<<<ERROR: Suppression impossible de '%s' (errno=%d)>>>\n", name.c_str(), errno);

    return ;
}



/**
 * @brief Exécute une commande complète et encadre sa réponse par les marqueurs CMD_START / CMD_END.
 */
static void runCommand(const std::string & line)
{
    // Séparation de la commande et de son argument
    const size_t space = line.find(' ');
    const std::string command  = line.substr(0, space);
    std::string argument = space == std::string::npos ? "" : line.substr(space + 1);
    while (!argument.empty() && argument[0] == ' ')
        argument.erase(0, 1);

    Serial.printf("%s%s>>>\n", CMD_START, line.c_str());

    if (command == "ls")
        listFiles();
    else if (command == "cat" && isValidFileName(argument))
        dumpFile((std::string("/Logs/") + argument).c_str());
    else if (command == "rm" && !argument.empty())
        removeFiles(argument);
    else
    {
        if (command != "help")
            Serial.printf("<<<ERROR: Commande inconnue ou incomplète : '%s'>>>\n", line.c_str());
        Serial.println("Commandes : ls | cat <fichier> | rm <fichier> | rm * | help");
    }

    Serial.println(CMD_END);
    Serial.flush();

    return ;
}



void handleLogCommands()
{
    static std::string line;

    while (Serial.available() > 0)
    {
        const char c = (char)Serial.read();

        if (c == '\n' || c == '\r')
        {
            if (!line.empty())
                runCommand(line);
            line.clear();
        }
        else if (line.size() < COMMAND_MAX_SIZE)
            line += c;
    }

    return ;
}

#endif // _LOG_CPP_
