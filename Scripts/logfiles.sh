##
# @file logfiles.sh
#
# @brief Gestion des fichiers de log d'un capteur (LittleFS, dossier /Logs/) via le port série USB :
#        liste, affichage, téléchargement et suppression, un par un ou tous d'un coup.
#
# Envoie les commandes de la console du firmware (cf. Device/src/Config/Log/Log.hpp) et affiche
# la réponse encadrée par les marqueurs <<<CMD_START:…>>> et <<<CMD_END>>>.
#
# @see out.sh
# @see Fonction usage() ou lancer le script avec --help
##

# =============================================================================
#  Import
# =============================================================================

source "$(dirname "${BASH_SOURCE[0]}")/out.sh"

# =============================================================================
#  Code de sortie
# =============================================================================

argumentErrorCode=1 ##< @brief Arguments manquants ou invalides.
portErrorCode=2     ##< @brief Port série introuvable.
serialErrorCode=3   ##< @brief Échec de la communication avec la carte.

# =============================================================================
#  Flag
# =============================================================================

VERBOSE=0 ##< @brief Mode verbeux (désactivé par défaut, activé par -v / --verbose).

# =============================================================================
#  Configuration
# =============================================================================

baudRate=115200                                        ##< @brief Baud rate de la transmission série.
logDir="$(dirname "${BASH_SOURCE[0]}")/../Logs/Device" ##< @brief Dossier de destination des fichiers téléchargés.

# =============================================================================
#  Fonctions
# =============================================================================

##
# @brief Affiche l'aide du script.
##
function usage()
{
    local name=$(basename "${0}")

    echo -e "${_WHITE}COMMANDE${_RESET}"
    echo -e "\t${_MAGENTA}${name} [-p port] <action> [fichier]"${_RESET}
    echo ""
    echo -e "${_WHITE}DESCRIPTION${_RESET}"
    echo -e "\tGère les fichiers de log d'un capteur (dossier /Logs/ de la carte) via le port série USB."
    echo -e "\tLe moniteur série (pio device monitor) doit être fermé pendant l'utilisation."
    echo ""
    echo -e "${_WHITE}OPTIONS${_RESET}"
    echo -e "\t-h | --help"
    echo -e "\t\tAffiche cette aide."
    echo -e "\t-v | --verbose"
    echo -e "\t\tAffiche aussi les messages du firmware reçus pendant l'échange."
    echo -e "\t-p | --port <port>"
    echo -e "\t\tPort série de la carte (numéro ou chemin). Sans option : seul port présent, sinon choix dans une liste."
    echo ""
    echo -e "${_WHITE}ACTIONS${_RESET}"
    echo -e "\tls\t\t\tListe des fichiers avec leur taille et occupation de la mémoire."
    echo -e "\tcat <fichier>\t\tAffiche le contenu d'un fichier."
    echo -e "\tget <fichier>\t\tTélécharge un fichier dans Logs/Device/."
    echo -e "\trm <fichier>\t\tSupprime un fichier."
    echo -e "\trm-all\t\t\tSupprime tous les fichiers (confirmation demandée)."
    echo ""
    echo -e "${_WHITE}EXEMPLES${_RESET}"
    echo -e "\t${name} ls"
    echo -e "\t${name} -p /dev/ttyACM0 rm INMP441.log"
    echo -e "\t${name} rm-all"

    return
}



##
# @brief Sélectionne le port série : celui passé en option, le seul présent, ou un choix numéroté.
##
function selectPort()
{
    local ports=()
    local candidate
    local answer

    for candidate in /dev/ttyACM* /dev/ttyUSB*
    do
        [ -e "${candidate}" ] && ports+=("${candidate}")
    done

    if [ "${#ports[@]}" -eq 0 ]
    then
        error "${portErrorCode}" "Aucun port série USB n'est ouvert : la carte est-elle branchée ?"
    fi

    # Numéro passé en option
    if [[ "${port}" =~ ^[0-9]+$ ]] && [ "${port}" -ge 1 ] && [ "${port}" -le "${#ports[@]}" ]
    then
        port="${ports[$((port - 1))]}"
    fi

    if [ -n "${port}" ]
    then
        return
    fi

    if [ "${#ports[@]}" -eq 1 ]
    then
        port="${ports[0]}"
        return
    fi

    echo "Sélectionner le port série de la carte (numéro ou chemin) :" >&2
    for index in "${!ports[@]}"
    do
        echo "  $((index + 1))) ${ports[${index}]}" >&2
    done
    echo -n "> " >&2
    read answer

    if [[ "${answer}" =~ ^[0-9]+$ ]] && [ "${answer}" -ge 1 ] && [ "${answer}" -le "${#ports[@]}" ]
    then
        port="${ports[$((answer - 1))]}"
    else
        port="${answer}"
    fi

    return
}



##
# @brief Envoie une commande à la console du firmware et écrit sa réponse sur la sortie standard.
#
# Si l'ouverture du port redémarre la carte, attend la fin de l'export des logs au démarrage
# (<<<DUMP_END>>>) avant d'envoyer la commande.
#
# @param $1 Commande (ls, cat <fichier>, rm <fichier>, rm *).
##
function sendCommand()
{
    python3 - "${port}" "${baudRate}" "${1}" "${VERBOSE}" <<'EOF'
import sys, time, serial

port, baud, command, verbose = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4] == "1"

link = serial.Serial()
link.port, link.baudrate, link.timeout = port, baud, 0.2
link.dtr = link.rts = False  # évite si possible de redémarrer la carte à l'ouverture
try:
    link.open()
except serial.SerialException as e:
    print(f"Ouverture impossible de {port} : {e}", file=sys.stderr)
    sys.exit(3)

def readLine():
    return link.readline().decode("utf-8", "replace").rstrip("\r\n")

# Carte redémarrée à l'ouverture : attente de la fin de l'export des logs au démarrage
deadline, dumping = time.time() + 7, False
while time.time() < deadline:
    line = readLine()
    if "<<<DUMP_START>>>" in line:
        dumping, deadline = True, time.time() + 300
    elif "<<<DUMP_END>>>" in line:
        break
    elif not line and not dumping and time.time() > deadline - 5:
        break

link.reset_input_buffer()
link.write((command + "\n").encode())

# Réponse entre <<<CMD_START:…>>> et <<<CMD_END>>> (la boucle du firmware lit les commandes environ chaque seconde)
started, deadline, error = False, time.time() + 20, False
while time.time() < deadline:
    line = readLine()
    if not line:
        continue
    if line.startswith("<<<CMD_START:"):
        started, deadline = True, time.time() + 600
    elif line == "<<<CMD_END>>>" and started:
        break
    elif started:
        if line.startswith("<<<ERROR:"):
            error = True
            print(line[9:].rstrip(">").strip(), file=sys.stderr)
        elif not line.startswith("<<<FILE_"):
            print(line)
    elif verbose:
        print(f"[firmware] {line}", file=sys.stderr)
else:
    print("Pas de réponse de la carte (firmware sans console de commandes ?)", file=sys.stderr)
    sys.exit(3)

sys.exit(3 if error else 0)
EOF
}



##
# @brief Point d'entrée du script.
##
function main()
{
    port=""
    local positional=()

    while [ "${#}" -gt 0 ]
    do
        case "${1}" in
            -h|--help)    usage; exit 0 ;;
            -v|--verbose) VERBOSE=1 ;;
            -p|--port)    port="${2}"; shift ;;
            *)            positional+=("${1}") ;;
        esac
        shift
    done

    local action="${positional[0]}"
    local file="${positional[1]}"

    if [ -z "${action}" ]
    then
        usage
        error "${argumentErrorCode}" "Action manquante : ls, cat, get, rm ou rm-all."
    fi

    case "${action}" in
        cat|get|rm)
            if [ -z "${file}" ]
            then
                error "${argumentErrorCode}" "Nom de fichier manquant pour '${action}' (voir '${0} ls')."
            fi
            ;;
    esac

    selectPort
    debug "Port série : ${port}"

    case "${action}" in
        ls)
            sendCommand "ls" || error "${serialErrorCode}" "Échec de la commande."
            ;;

        cat)
            sendCommand "cat ${file}" || error "${serialErrorCode}" "Échec de la lecture de '${file}'."
            ;;

        get)
            mkdir -p "${logDir}"
            local destination="${logDir}/$(date +%Y%m%d-%H%M%S)_${file}"
            sendCommand "cat ${file}" > "${destination}" || { rm -f "${destination}"; error "${serialErrorCode}" "Échec du téléchargement de '${file}'."; }
            info "Fichier enregistré : ${destination}"
            ;;

        rm)
            sendCommand "rm ${file}" || error "${serialErrorCode}" "Échec de la suppression de '${file}'."
            ;;

        rm-all)
            echo -n "Supprimer tous les fichiers de log de la carte sur ${port} ? [o/N] " >&2
            local answer
            read answer
            if [[ "${answer}" =~ ^[oOyY]$ ]]
            then
                sendCommand "rm *" || error "${serialErrorCode}" "Échec de la suppression."
            else
                info "Suppression annulée."
            fi
            ;;

        *)
            usage
            error "${argumentErrorCode}" "Action inconnue : '${action}'."
            ;;
    esac

    return
}

# Lancement du script avec tous les arguments
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]
then
    main "${@}"
fi
