/**
 * @file UARTManager.cpp
 * 
 * @brief Implémentation de la classe UARTManager.
 *
 * Fournit une abstraction haut niveau du port série UART matériel (Serial1) pour l'émission et la réception de données brutes entre une carte électronique et un périphérique externe.
 */

#ifndef _UARTMANAGER_CPP_
#define _UARTMANAGER_CPP_

// ============================================================================
//  Import des headers internes
// ============================================================================

#include "./UARTManager.hpp"

// ============================================================================
//  Variable static
// ============================================================================

Logger * UARTManager::logger = nullptr;

// ============================================================================
//  Constructeur
// ============================================================================

UARTManager::UARTManager(int rxPin, int txPin, uint32_t baudRate):
rxPin(rxPin),
txPin(txPin),
baudRate(baudRate)
{
    if (UARTManager::logger == nullptr)
        UARTManager::logger = new Logger("UARTManager", true);
}

// ============================================================================
//  Destructeur
// ============================================================================

UARTManager::~UARTManager()
{
    this->end();
};

// ============================================================================
//  Méthode
// ============================================================================

void UARTManager::begin()
{
#if DEBUG == 1
    UARTManager::logger->info(Logger::logString("[UART] begin - Ouverture du port série externe (RX: %d, TX: %d, baud: %u)\n", this->rxPin, this->txPin, this->baudRate));
#endif

    // Initialisation du port série UART externe avec le format 8N1 (8 bits de données, pas de parité, 1 bit de stop)
    // Tampon d'émission logiciel : sans lui, seule la FIFO matérielle de 128 octets est disponible,
    // trop petite pour une trame JSON complète (doit être fixé avant begin())
    this->externalSerial.setTxBufferSize(UART_TX_BUFFER_SIZE);

    this->externalSerial.begin(this->baudRate, SERIAL_8N1, this->rxPin, this->txPin);

    // Attente bloquante jusqu'à l'ouverture effective du port série
    while (not this->externalSerial)
        ;

#if DEBUG == 1
    UARTManager::logger->info(Logger::logString("[UART] begin - Port série externe prêt\n"));
#endif

    return ;
}



void UARTManager::end()
{
#if DEBUG == 1
    UARTManager::logger->info(Logger::logString("[UART] end - Fermeture du port série externe\n"));
#endif

    // Fermeture du port série uniquement s'il est ouvert
    if (this->externalSerial)
        this->externalSerial.end();

#if DEBUG == 1
    UARTManager::logger->info(Logger::logString("[UART] end - Port série externe fermé\n"));
#endif

    return ;
}



size_t UARTManager::writeByte(uint8_t data)
{
    // Vérifie qu'au moins un octet peut être écrit dans le tampon d'émission
    if (this->availableForWrite() < 1)
    {
#if DEBUG == 1
        UARTManager::logger->warning(Logger::logString("[UART] writeByte - Tampon d'émission plein, octet abandonné\n"));
#endif

        return 0;
    }

    size_t size = this->externalSerial.write(data);
    this->externalSerial.flush(); // Vide le tampon matériel pour garantir l'émission immédiate

#if DEBUG == 1
    UARTManager::logger->info(Logger::logString("[UART] writeByte - Octet 0x%02X envoyé\n", data));
#endif

    return size;
}



int UARTManager::readByte()
{
    // Vérifie qu'au moins un octet est disponible en réception
    if (this->availableForRead() < 1)
    {
#if DEBUG == 1
        UARTManager::logger->warning(Logger::logString("[UART] readByte - Aucun octet disponible en réception\n"));
#endif

        return -1;
    }

    int value = this->externalSerial.read();

#if DEBUG == 1
    UARTManager::logger->info(Logger::logString("[UART] readByte - Octet lu: 0x%02X\n", value));
#endif

    return value;
}



size_t UARTManager::writeBuffer(const uint8_t * buffer, size_t size)
{
    // Vérifie la validité de la taille du buffer
    if (size == 0)
    {
        std::string str = Logger::logString("[UART] writeBuffer - Taille du buffer invalide: %d\n", std::to_string(size));
#if DEBUG == 1
        UARTManager::logger->error(str);
#endif
        throw std::invalid_argument(str);
    }

    // Vérifie que le tampon d'émission peut absorber l'intégralité du buffer
    int available = this->availableForWrite();

    if ((size_t) available < size)
    {
#if DEBUG == 1
        UARTManager::logger->warning(Logger::logString("[UART] writeBuffer - Tampon d'émission insuffisant: %d octets disponibles, %u demandés\n", available, size));
#endif

        return 0;
    }

    size_t written = this->externalSerial.write(buffer, size);
    this->externalSerial.flush(); // Vide le tampon matériel pour garantir l'émission immédiate

#if DEBUG == 1
    UARTManager::logger->info(Logger::logString("[UART] writeBuffer - %u/%u octets envoyés\n", written, size));
#endif

    return written;
}



size_t UARTManager::readBuffer(uint8_t * buffer, size_t size)
{
    // Vérifie la validité de la taille du buffer
    if (size == 0)
    {
        std::string str = Logger::logString("[UART] readBuffer - Taille du buffer invalide: %d\n", std::to_string(size));
#if DEBUG == 1
        UARTManager::logger->error(str);
#endif
        throw std::invalid_argument(str);
    }

    // Vérifie que suffisamment d'octets sont disponibles en réception
    int available = this->availableForRead();

    if ((size_t) available < size)
    {
#if DEBUG == 1
        UARTManager::logger->warning(Logger::logString("[UART] readBuffer - Données insuffisantes en réception: %d octets disponibles, %u demandés\n", available, size));
#endif

        return 0;
    }

    size_t read = this->externalSerial.read(buffer, size);

#if DEBUG == 1
    UARTManager::logger->info(Logger::logString("[UART] readBuffer - %u/%u octets lus\n", read, size));
#endif

    return read;
}



int UARTManager::availableForRead()
{
    return this->externalSerial.available();
}



int UARTManager::availableForWrite()
{
    return this->externalSerial.availableForWrite();
}



void UARTManager::reverseBuffer(uint8_t * buffer, size_t size)
{
    // Vérifie la validité de la taille du buffer
    if (size == 0)
    {
        std::string str = Logger::logString("[UART] reverseBuffer - Taille du buffer invalide: %d\n", std::to_string(size));
#if DEBUG == 1
        UARTManager::logger->error(str);
#endif
        throw std::invalid_argument(str);
    }

    // Inverse le buffer
    for (size_t i=0; i < size / 2; i++)
    {
        uint8_t tmp = buffer[i];
        buffer[i] = buffer[size - 1 - i];
        buffer[size - 1 - i] = tmp;
    }

    return ;
}



#endif // _UARTMANAGER_CPP_
