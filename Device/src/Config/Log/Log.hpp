/**
 * @file Log.hpp
 *
 * @brief Console de gestion des fichiers de log LittleFS par le port série.
 *
 * Déclare handleLogCommands(), à appeler dans loop() : petite console de gestion des fichiers
 * de /Logs/ par le port série (commande terminée par un retour à la ligne) :
 * @code{.txt}
 * ls             Liste des fichiers avec leur taille et occupation de LittleFS
 * cat <fichier>  Contenu d'un fichier (marqueurs FILE_START / FILE_END)
 * rm <fichier>   Suppression d'un fichier
 * rm *           Suppression de tous les fichiers de /Logs/
 * help           Liste des commandes
 * @endcode
 * Chaque réponse est encadrée par <<<CMD_START:commande>>> et <<<CMD_END>>> (script Scripts/logfiles.sh).
 * Le contenu d'un fichier (cat) est encadré par <<<FILE_START:/Logs/fichier>>> et <<<FILE_END>>>.
 */

#ifndef _LOG_HPP_
#define _LOG_HPP_

// ============================================================================
//  Import des bibliothèques
// ============================================================================

#include <string>
#include <vector>
#include <Arduino.h>
#include <LittleFS.h>
#include <stdio.h>
#include <dirent.h>
#include <sys/stat.h>
#include <errno.h>

// ============================================================================
//  Déclaration
// ============================================================================

/**
 * @brief Lit les commandes reçues sur le port série (sans bloquer) et exécute celles qui sont complètes.
 */
void handleLogCommands();

#endif // _LOG_HPP_
