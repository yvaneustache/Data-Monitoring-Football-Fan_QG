##
# @file flash.sh
#
# @brief Flash un binaire sur une carte ESP32.
#
# @see out.sh
# @see Fonction usage() ou lancer le script avec --help
##

# =============================================================================
#  Import
# =============================================================================

source "$(dirname "${BASH_SOURCE[0]}")/out.sh"

# Seule MESHTASTIC_KEY est utilisée ici : elle est lue sans exécuter le .env avec "source", car bash interprète
# les valeurs avec espaces ou parenthèses non protégées du .env (ex : APP, INFLUXDB_BUCKET, INFLUXDB_PASSWORD)
MESHTASTIC_KEY="$(sed -n -E 's/^MESHTASTIC_KEY=//p' "$(dirname "${BASH_SOURCE[0]}")/../.env" | head -n 1 | tr -d '\r' | sed -E "s/^(['\"])(.*)\1\$/\2/")"

# =============================================================================
#  Code de sortie
# =============================================================================

argumentErrorCode=1                ##< @brief Arguments manquants ou invalides.
portNotFoundErrorCode=2            ##< @brief Port série introuvable.
targetNotSupportErrorCode=3        ##< @brief Cible non supporté.
choiceNotSupportErrorCode=4        ##< @brief Choix non supporté.
nodeTypeNotSupportErrorCode=5      ##< @brief Type de noeud non supporté.
sensorTypeNotSupportErrorCode=6    ##< @brief Type de capteur non supporté.
gatewayNoneConfiguratedErrorCode=7 ##< @brief La gateway du réseau n'a pas été configuré.

# =============================================================================
#  Flag
# =============================================================================

VERBOSE=0 ##< @brief Mode verbeux (désactivé par défaut, activé par -v / --verbose).

# =============================================================================
#  Variable globale
# =============================================================================

path="$(dirname "${BASH_SOURCE[0]}")/.." ##< @brief Chemin du projet.
port=""                                  ##< @brief Port série à utilisé.

# =============================================================================
#  Fonctions utilitaires
# =============================================================================

##
# @brief Affiche le manuel d'usage du script.
#
# @param name Nom du script.
##
function usage()
{
    local name=$(basename "${0}")

    echo -e "${_WHITE}COMMANDE${_RESET}"
    echo -e "\t${_MAGENTA}${name} [cible]"${_RESET}
    echo ""
    echo -e "${_WHITE}DESCRIPTION${_RESET}"
    echo -e "\tFlash un binaire sur une carte ESP32."
    echo -e "\tChaque sélection (cible, port série, firmware/configuration, type de noeud) peut être saisie par son numéro ou par son nom ; option 1 par défaut (touche Entrée seule)."
    echo ""
    echo -e "${_WHITE}OPTIONS${_RESET}"
    echo -e "\t-h | --help"
    echo -e "\t\tAffiche cette aide."
    echo -e "\t\tExemple: ${name} --help"
    echo -e "\t-v | --verbose"
    echo -e "\t\tActive les messages de debug détaillés."
    echo -e "\t\tExemple: ${name} --verbose device"
    echo ""
    echo -e "${_WHITE}ARGUMENTS${_RESET}"
    echo -e "\t[cible]"
    echo -e "\t\tNom ou numéro de la cible à flasher. [ 1 device | 2 meshtastic | 3 meshcore ]"
    echo -e "\t\tSans argument, la cible est demandée dans une liste."
    echo -e "\t\tExemple: ${name} device, ${name} 1"

    return
}

# =============================================================================
#  Configuration Meshtastic
# =============================================================================

##
# @brief Raccourci de la commande pour la configuration de Meshtastic.
##
function meshtastic()
{
    # Execute le commande meshtastic
    until "${path}/.venv/meshtastic-env/bin/meshtastic" --port "${port}" "$@"
    do
        debug "Échec de la commande."
        debug "Nouvelle tentative."
        sleep 2
    done

    sleep 2

    return
}



##
# @brief Flash la configuration Meshtastic.
#
# @param nodeType   Type de noeud à configurer.
##
function flashMeshtasticConfiguration()
{
    local nodeType="${1}"

    debug "Configuration Bluetooth."
    meshtastic --set bluetooth.enabled false # Bluetooth
    meshtastic --reboot
    sleep 11
    debug "Configuration série"
    meshtastic --set serial.rxd 44 # Pin RX
    meshtastic --set serial.txd 43 # Pin TX
    meshtastic --set serial.baud BAUD_115200 # Baudrate
    meshtastic --set serial.mode TEXTMSG # Transmission de text par UART
    meshtastic --set serial.enabled true # Communication série
    meshtastic --reboot
    sleep 11
    debug "Configuration LoRa."
    meshtastic --set lora.region EU_868 # Bande de fréquence
    meshtastic --set lora.modem_preset LONG_FAST # Porté et débit
    meshtastic --set lora.tx_power 14 # Puissance de transmission en dBm
    meshtastic --set lora.hop_limit 3 # Limite du nombre de retransmission d'un message par les autres noeuds
    meshtastic --reboot
    sleep 11
    debug "Configuration des channels."
    meshtastic --ch-index 0 --ch-set psk "base64:${MESHTASTIC_KEY}"
    meshtastic --ch-index 0 --ch-set name "monitoring"
    meshtastic --reboot
    sleep 11
    debug "Configuration du device"
    if [ "${nodeType}" = "gateway" ]
    then
        meshtastic --set device.role CLIENT_MUTE # Rôle du noeud
    fi
    if [ "${nodeType}" = "sensor" ]
    then
        meshtastic --set device.role CLIENT # Rôle du noeud
    fi
    meshtastic --reboot
    sleep 11
    debug "Configuration de l'économie d'énergie."
    meshtastic --set power.is_power_saving true # Économie d'énergie
    meshtastic --reboot
    sleep 11

    return
}

# =============================================================================
#  Configuration Meshcore
# =============================================================================

##
# @brief Raccourci de la commande pour la configuration de Meshcore.
##
function meshcore()
{
    # Execute le commande meshcore
    until "${path}/.venv/meshcore-env/bin/meshcli" -s "${port}" "$@"
    do
        debug "Échec de la commande."
        debug "Nouvelle tentative."
        sleep 2
    done

    sleep 2

    return
}



##
# @brief Flash la configuration Meshcore.
#
# @param nodeType   Type de noeud à configurer.
##
function flashMeshcoreConfiguration()
{
    local nodeType="${1}"

    debug "Configuration LoRa."
    meshcore set radio 868.0,125,7,5,off
    meshcore set tx 14
    debug "Configuration du device"
    meshcore set name "${nodeType}"
    debug "Configuration des contacts"
    meshcore set auto_update_contacts off
    debug "Configuration des channels."
    meshcore add_channel monitoring "063cf652b2c888f3bb001a7b431f993b"
    debug "Ajout des contacts"
    if [ "${nodeType}" = "gateway" ]
    then
        meshcore card > "${path}"/Resources/Data/gatewayContact.txt
    else
        if [ -f "${path}/Resources/Data/gatewayContact.txt" ]
        then
            contact="$(head -n1 "${path}/Resources/Data/gatewayContact.txt")"
            meshcore import_contact "${contact}"
        else
            error "${gatewayNoneConfiguratedErrorCode}" "La gateway du réseau n'a pas encore été configuré."
        fi
    fi

    return
}

# =============================================================================
#  Fonctions métier
# =============================================================================

##
# @brief Affiche une liste numérotée d'options et lit la sélection.
#
# La sélection peut être saisie par son numéro ou par son nom ; option 1 par défaut (touche Entrée seule).
#
# @param question Question affichée.
# @param $@       Options proposées (après la question).
#
# @return (stdout) Option correspondant au numéro saisi, sinon la saisie telle quelle.
##
function selectOption()
{
    local question="${1}"
    shift
    local options=("$@")
    local answer

    echo "${question}" >&2
    for index in "${!options[@]}"
    do
        echo "  $((index + 1))) ${options[${index}]}" >&2
    done
    if [ "${#options[@]}" -gt 0 ]
    then
        echo -n "Choix [1] : " >&2
    else
        echo -n "> " >&2
    fi
    read answer

    # Entrée seule : première option
    if [ -z "${answer}" ] && [ "${#options[@]}" -gt 0 ]
    then
        echo "${options[0]}"
        return
    fi

    # Numéro valide : remplacé par l'option correspondante
    if [[ "${answer}" =~ ^[0-9]+$ ]] && [ "${answer}" -ge 1 ] && [ "${answer}" -le "${#options[@]}" ]
    then
        echo "${options[$((answer - 1))]}"
    else
        echo "${answer}"
    fi

    return
}



##
# @brief Affiche la boîte de dialogue pour la sélection du port série.
##
function selectPort()
{
    local ports=()
    local candidate

    # Liste des ports série USB ouverts
    for candidate in /dev/ttyACM* /dev/ttyUSB*
    do
        [ -e "${candidate}" ] && ports+=("${candidate}")
    done

    if [ "${#ports[@]}" -eq 0 ]
    then
        echo "Aucun port série USB n'est ouvert." >&2
    fi

    port=$(selectOption "Sélectionner le port série USB correspondant à la carte à flasher (numéro ou chemin) :" "${ports[@]}")

    return
}



##
# @brief Affiche la boîte de dialogue pour la sélection du choix.
##
function selectChoice()
{
    selectOption "Que voulez vous flasher ?" "firmware" "configuration"

    return
}



##
# @brief Affiche la boîte de dialogue pour la sélection du type de noeud Meshtastic.
##
function selectNodeType()
{
    selectOption "Quel est le type de noeud à configurer ?" "gateway" "sensor"

    return
}

# =============================================================================
#  Point d'entrée du script
# =============================================================================

##
# @brief Parsing des arguments et exécution du script.
#
# @param $@ Tous les arguments du script.
##
function main()
{
    # Affichage de l'aide si demandé
    if [[ "${1}" == "-h" || "${1}" == "--help" ]]
    then
        usage
        exit 0
    fi
    # Parsing de l'option -v/--verbose en première position
    if [ "${1}" = "-v" ] || [ "${1}" = "--verbose" ]
    then
        VERBOSE=1
        debug "Mode verbeux activé."
        shift  # Retire -v/--verbose de la liste des arguments
    fi

    # Vérification du nombre d'arguments
    if [[ "${#}" -gt 1 ]]
    then
        error "${argumentErrorCode}" "Trop d'arguments. Un seul argument est attendu: <cible>."
    fi

    # Cible : argument (nom ou numéro) ou sélection dans la liste
    local targets=("device" "meshtastic" "meshcore")
    local target="${1}"
    if [ -z "${target}" ]
    then
        target=$(selectOption "Quelle cible voulez vous flasher ?" "${targets[@]}")
    elif [[ "${target}" =~ ^[0-9]+$ ]] && [ "${target}" -ge 1 ] && [ "${target}" -le "${#targets[@]}" ]
    then
        target="${targets[$((target - 1))]}"
    fi

    case "${target}" in
        # Flash du device
        device)
            selectPort

            # Vérifie l'installation de l'environnement virtuel
            if [ ! -e "${path}/.venv/platformio-env" ]
            then
                info "Installation de l'environnement virtuel 'platformio-env'"
                debug "Package: Python3"
                sudo apt install -y python3
                debug "Package: Python3-venv"
                sudo apt install -y python3-venv
                debug "Création de l'environnement virtuel python"
                mkdir -p "${path}/.venv"
                debug "Environnement virtuel: PlatformIO"
                python3 -m venv "${path}/.venv/platformio-env"
                debug "Package: PlatformIO"
                "${path}"/.venv/platformio-env/bin/pip install platformio
            fi

            # Vérifie que le port série sélectionné est ouvert
            if [ -e "${port}" ]
            then
                debug "Flash du device."

                # Efface la mémoire flash
                "${path}"/.venv/platformio-env/bin/pio run -t erase --upload-port "${port}" --project-dir Device
                # Montage du système de fichier LittleFS
                mkdir -p "${path}/Device/data"
                "${path}"/.venv/platformio-env/bin/pio run -t uploadfs --upload-port "${port}" --project-dir Device
                # Flash de la carte
                "${path}"/.venv/platformio-env/bin/pio run -t upload --upload-port "${port}" --project-dir Device
            else
                error "${portNotFoundErrorCode}" "Le port série '${port}' sélectionné n'est pas ouvert."
            fi
            ;;

        # Flash de Meshtastic
        meshtastic)
            local chip="esp32s3" # Chip de la carte à flasher
            selectPort

            # Vérifie l'installation de l'environnement virtuel
            if [ ! -e "${path}/.venv/meshtastic-env" ]
            then
                info "Installation de l'environnement virtuel 'meshtastic-env'"
                debug "Package: Python3"
                sudo apt install -y python3
                debug "Package: Python3-venv"
                sudo apt install -y python3-venv
                debug "Création des environnements virtuels python"
                mkdir -p "${path}/.venv"
                debug "Environement virtuel: Meshtastic"
                python3 -m venv "${path}/.venv/meshtastic-env"
                debug "Package: Meshtastic"
                "${path}"/.venv/meshtastic-env/bin/pip install meshtastic
                debug "Package: ESPtool"
                "${path}"/.venv/meshtastic-env/bin/pip install esptool
            fi

            # Vérifie que le port série sélectionné est ouvert
            if [ -e "${port}" ]
            then
                debug "Flash de Meshtastic."

                local choice=$(selectChoice)
                case "${choice}" in
                    # Flash le firmware Meshtastic
                    firmware)
                        info "Flash du firmware"
                        "${path}"/.venv/meshtastic-env/bin/esptool --chip "${chip}" --port "${port}" --baud 921600 erase-flash
                        "${path}"/.venv/meshtastic-env/bin/esptool --chip "${chip}" --port "${port}" --baud 921600 write-flash -z 0x0 "${path}/.Flash/firmware-seeed-xiao-s3-2.7.15.567b8ea.bin"
                        ;;

                    # Flash de la configuration Meshtastic
                    configuration)
                        debug "Flash de la configuration de Meshtastic."

                        local nodeType=$(selectNodeType)
                        case "${nodeType}" in
                            # Flash de la configuration de la gateway Meshtastic
                            gateway)
                                info "Flash de la configuration de la gateway."
                                meshtastic --export-config "${path}"/Resources/Data/currentConfig.yml
                                sleep 2
                                echo $(sed "1,3d;40,49d;59d" "${path}"/Resources/Data/currentConfig.yml | head -n -2) > "${path}"/Resources/Data/currentConfig.yml
                                while ! diff "${path}"/Resources/Data/currentConfig.yml "${path}"/Resources/Data/refConfigGateway.yml
                                do
                                    debug "La configuration n'est pas à jour."
                                    debug "Flash de la configuration."
                                    flashMeshtasticConfiguration "gateway"
                                    sleep 2
                                    meshtastic --export-config "${path}"/Resources/Data/currentConfig.yml
                                    sleep 2
                                    echo $(sed "1,3d;40,49d;59d" "${path}"/Resources/Data/currentConfig.yml | head -n -2) > "${path}"/Resources/Data/currentConfig.yml
                                done

                                rm "${path}"/Resources/Data/currentConfig.yml
                                ;;

                            # Flash de la configuration d'un capteur Meshtastic
                            sensor)
                                info "Flash de la configuration d'un capteur."
                                meshtastic --export-config "${path}"/Resources/Data/currentConfig.yml
                                sleep 2
                                echo $(sed "1,3d;40,49d;59d" "${path}"/Resources/Data/currentConfig.yml | head -n -2) > "${path}"/Resources/Data/currentConfig.yml
                                while ! diff "${path}"/Resources/Data/currentConfig.yml "${path}"/Resources/Data/refConfigSensor.yml
                                do
                                    debug "La configuration n'est pas à jour."
                                    debug "Flash de la configuration."
                                    flashMeshtasticConfiguration "sensor"
                                    sleep 2
                                    meshtastic --export-config "${path}"/Resources/Data/currentConfig.yml
                                    sleep 2
                                    echo $(sed "1,3d;40,49d;59d" "${path}"/Resources/Data/currentConfig.yml | head -n -2) > "${path}"/Resources/Data/currentConfig.yml
                                done

                                rm "${path}"/Resources/Data/currentConfig.yml
                                ;;

                            *)
                                error "${nodeTypeNotSupportErrorCode}" "Le type de noeud '${nodeType}' sélectionné n'est pas supporté."
                                ;;
                        esac
                        ;;

                    *)
                        error "${choiceNotSupportErrorCode}" "Le choix '${choice}' sélectionné n'est pas supporté."
                        ;;
                    esac
            fi
            ;;

        meshcore)
            local chip="esp32s3" # Chip de la carte à flasher
            selectPort

            # Vérifie l'installation de l'environnement virtuel
            if [ ! -e "${path}/.venv/meshcore-env" ]
            then
                info "Installation de l'environnement virtuel 'meshcore-env'"
                debug "Package: Python3"
                sudo apt install -y python3
                debug "Package: Python3-venv"
                sudo apt install -y python3-venv
                debug "Création des environnements virtuels python"
                mkdir -p "${path}/.venv"
                debug "Environement virtuel: Meshcore"
                python3 -m venv "${path}/.venv/meshcore-env"
                debug "Package: Meshcore"
                "${path}"/.venv/meshcore-env/bin/pip install meshcore-cli
                debug "Package: ESPtool"
                "${path}"/.venv/meshcore-env/bin/pip install esptool
            fi

            # Vérifie que le port série sélectionné est ouvert
            if [ -e "${port}" ]
            then
                debug "Flash de Meshcore."

                local choice=$(selectChoice)
                case "${choice}" in
                    # Flash le firmware Meshcore
                    firmware)
                        info "Flash du firmware"
                        "${path}"/.venv/meshcore-env/bin/esptool --chip "${chip}" --port "${port}" --baud 921600 erase-flash
                        "${path}"/.venv/meshcore-env/bin/esptool --chip "${chip}" --port "${port}" --baud 921600 write-flash -z 0x0 "${path}/.Flash/firmware_Xiao_S3_WIO_companion_radio_usb-v1.15.0-dee3e26.bin"
                        ;;

                    # Flash de la configuration Meshcore
                    configuration)
                        debug "Flash de la configuration de Meshcore."

                        local nodeType=$(selectNodeType)
                        case "${nodeType}" in
                            # Flash de la configuration de la gateway Meshcore
                            gateway)
                                info "Flash de la configuration de la gateway."
                                flashMeshcoreConfiguration "gateway"
                                ;;

                            # Flash de la configuration d'un capteur Meshcore
                            sensor)
                                info "Flash de la configuration d'un capteur."
                                flashMeshcoreConfiguration "sensor"
                                ;;

                            *)
                                error "${nodeTypeNotSupportErrorCode}" "Le type de noeud '${nodeType}' sélectionné n'est pas supporté."
                                ;;
                        esac
                        ;;

                    *)
                        error "${choiceNotSupportErrorCode}" "Le choix '${choice}' sélectionné n'est pas supporté."
                        ;;
                    esac
            fi
            ;;

        *)
            error "${targetNotSupportErrorCode}" "La cible '${target}' sélectionné n'est pas supporté."
            ;;
    esac

    return
}

# Lancement du script avec tous les arguments
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]
then
    main "${@}"
fi
