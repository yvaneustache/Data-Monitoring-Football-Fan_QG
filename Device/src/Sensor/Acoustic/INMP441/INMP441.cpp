/**
 * @file INMP441.cpp
 * 
 * @brief Implémentation de la classe INMP441.
 *
 * Implémentation concrète d'un capteur acoustique communiquant via I2S. Hérite de Acoustic.
 */

#ifndef _INMP441_CPP_
#define _INMP441_CPP_

// ============================================================================
//  Import des headers internes
// ============================================================================

#include "./INMP441.hpp"
#if INMP441_SLM == 1
#include "./SosIirFilter.hpp"
#endif

// ============================================================================
//  Variable static
// ============================================================================

const std::string INMP441::name = "INMP441";
int32_t INMP441::audioSample[I2S_BUFFER_SIZE];
Logger * INMP441::logger = nullptr;

#if INMP441_SLM == 1
float INMP441::filteredSample[I2S_BUFFER_SIZE];

// ============================================================================
//  Filtres IIR (esp32-i2s-slm, (c)2019 Ivan Kostoski, GPL v3), Fs = 48 kHz
// ============================================================================

// Amplitude de référence calculée à partir de la sensibilité du micro
static const double MIC_REF_AMPL = pow(10, double(MIC_SENSITIVITY) / 20) * ((1 << (MIC_BITS - 1)) - 1);

// Égaliseur INMP441 : aplatit la réponse en fréquence du micro (et retire la composante continue)
// B ~= [1.00198, -1.99085, 0.98892], A ~= [1.0, -1.99518, 0.99518]
static const SosCoefficients INMP441_EQUALIZER_SOS[] = {
    {-1.986920458344451f, +0.986963226946616f, +1.995178510504166f, -0.995184322194091f}
};

// Pondération A (Dr. Matt L., https://dsp.stackexchange.com/a/36122)
static const SosCoefficients A_WEIGHTING_SOS[] = {
    {-2.00026996133106f, +1.00027056142719f, -1.060868438509278f, -0.163987445885926f},
    {+4.35912384203144f, +3.09120265783884f, +1.208419926363593f, -0.273166998428332f},
    {-0.70930303489759f, -0.29071868393580f, +1.982242159753048f, -0.982298594928989f}
};

static SosIirFilter equalizer(1.00197834654696f, INMP441_EQUALIZER_SOS);
static SosIirFilter aWeighting(0.169994948147430f, A_WEIGHTING_SOS);
#endif

// ============================================================================
//  Constructeur
// ============================================================================

INMP441::INMP441(int stadiumBleacherId):
Acoustic(INMP441::name),
stadiumBleacherId(stadiumBleacherId)
{
    if (INMP441::logger == nullptr)
        INMP441::logger = new Logger("INMP441", true);

    char str[LOGGER_MAX_MESSAGE_SIZE];
    snprintf(str, sizeof(str), "[INMP441] Instanciation du capteur %s\n", INMP441::name.c_str());
    INMP441::logger->info(str);
}

// ============================================================================
//  Destructeur
// ============================================================================

INMP441::~INMP441()
{
    this->end();
}

// ============================================================================
//  Méthode static
// ============================================================================

std::string INMP441::formatData(INMP441Data & data, int stadiumBleacherId)
{
#if DEBUG == 1
    std::string str = "[INMP441] formatData - DB: [ ";
    for (int i=0; i < NB_VALUE; i++)
    {
        char val[32];
        snprintf(val, sizeof(val), "%f ", data.decibel[i]);
        str += val;
    }
    str += "] db\n";
    INMP441::logger->info(str.c_str());
#endif

    std::string jsonString;
    JsonDocument json;

    // Construction de l'objet JSON avec les données du capteur
    json["t"] = getMQTTTopic(SensorType::ACOUSTIC);
    json["n"] = INMP441::name;
    json["id"] = stadiumBleacherId;
    JsonArray array = json["a"].to<JsonArray>();
    for (int i=0; i < NB_VALUE; i++)
        array.add(serialized(String(data.decibel[i],1)));

    // Sérialisation en chaîne JSON + ajout d'un saut de ligne comme délimiteur de message
    serializeJson(json, jsonString);
    jsonString += '\n';

    return jsonString;
}

// ============================================================================
//  Méthode
// ============================================================================

void INMP441::begin()
{
#if DEBUG == 1
    INMP441::logger->info(Logger::logString("[INMP441] begin - Démarrage du capteur\n"));
#endif

    // Configuration du driver I2S
    i2s_config_t i2s_config = {};
    i2s_config.mode = (i2s_mode_t) (I2S_MODE_MASTER | I2S_MODE_RX);
    i2s_config.sample_rate = I2S_SAMPLE_RATE;
    i2s_config.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
    i2s_config.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
    i2s_config.communication_format = I2S_COMM_FORMAT_STAND_I2S;
    i2s_config.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
    i2s_config.dma_buf_count = I2S_DMA_BUF_COUNT;
    i2s_config.dma_buf_len = I2S_DMA_BUF_LEN;
    i2s_config.use_apll = true;

    // Configuration des pins
    i2s_pin_config_t pin_config = {};
    pin_config.bck_io_num = SCK_PIN;
    pin_config.ws_io_num = WS_PIN;
    pin_config.data_out_num = I2S_PIN_NO_CHANGE;
    pin_config.data_in_num = SD_PIN;
    pin_config.mck_io_num = I2S_PIN_NO_CHANGE;

#if DEBUG == 1
    INMP441::logger->info(Logger::logString("[INMP441-9 V6] begin - Configuration du driver et des pins I2S"));
#endif

    // Application des configurations
    if (i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL) != ESP_OK)
    {
        std::string str = Logger::logString("[INMP441] begin - Échec de la configuration du driver I2S\n");
#if DEBUG == 1
        INMP441::logger->error(str);
#endif
        throw std::runtime_error(str);
    }

    if (i2s_set_pin(I2S_PORT, &pin_config) != ESP_OK)
    {
        std::string str = Logger::logString("[INMP441] begin - Échec de la configuration des pins I2S\n");
#if DEBUG == 1
        INMP441::logger->error(str);
#endif
        throw std::runtime_error(str);
    }

    // Stabilisation du capteur : lecture et rejet des données pendant le temps de démarrage
    // du micro (transitoire de mise sous tension, cf. filtre passe-haut interne du INMP441)
#if DEBUG == 1
    INMP441::logger->info(Logger::logString("[INMP441] begin - Stabilisation du capteur (%dms)\n", MIC_WARMUP_DURATION_MS));
#endif
    size_t bytesRead = 0;
    uint32_t warmupStart = millis();
    while (millis() - warmupStart < MIC_WARMUP_DURATION_MS)
        i2s_read(I2S_PORT, INMP441::audioSample, sizeof(INMP441::audioSample), &bytesRead, 100 / portTICK_PERIOD_MS);

    Sensor::state = ConnectionState::CONNECTED;

    return ;
}



void INMP441::end()
{
#if DEBUG == 1
    INMP441::logger->info(Logger::logString("[INMP441] end - Arrêt du capteur\n"));
#endif

    Sensor::state = ConnectionState::DISCONNECTED;

#if DEBUG == 1
    INMP441::logger->info(Logger::logString("[INMP441] end - Capteur arrêté\n"));
#endif

    return ;
}



#if INMP441_SLM == 1
void INMP441::update()
{
#if DEBUG == 1
    INMP441::logger->info(Logger::logString("[INMP441] update - Mise à jour du capteur\n"));
#endif

    // Lecture continue des blocs I2S jusqu'à couvrir toute la période d'acquisition
    const uint32_t leqTargetSamples = (uint32_t) ((uint64_t) I2S_SAMPLE_RATE * ACQUISITION_TIME / 1000);
    uint32_t leqSamples = 0;
    double leqSumSqr = 0;
    bool overload = false;
    bool belowNoise = false;

    while (leqSamples < leqTargetSamples)
    {
        size_t bytesRead = 0;
        i2s_read(I2S_PORT, INMP441::audioSample, sizeof(INMP441::audioSample), &bytesRead, 1000 / portTICK_PERIOD_MS);

        int samples = bytesRead / sizeof(int32_t);
        if (samples <= 0)
            break;

        // Conversion des échantillons 32 bits en valeurs 24 bits flottantes
        for (int i=0; i < samples; i++)
            INMP441::filteredSample[i] = (float) (INMP441::audioSample[i] >> (32 - MIC_BITS));

        // Égalisation (niveau Z) puis pondération A, chaque filtre retourne la somme des carrés
        float sumSqrSpl = equalizer.filter(INMP441::filteredSample, INMP441::filteredSample, samples);
        float sumSqrWeighted = aWeighting.filter(INMP441::filteredSample, INMP441::filteredSample, samples);

        // Contrôle de la plage de mesure du micro sur le bloc (125 ms)
        double shortSplDb = MIC_OFFSET_DB + MIC_REF_DB + 20 * log10(sqrt(double(sumSqrSpl) / samples) / MIC_REF_AMPL);
        if (shortSplDb > MIC_OVERLOAD_DB)
            overload = true;
        else if (isnan(shortSplDb) || (shortSplDb < MIC_NOISE_DB))
            belowNoise = true;

        leqSumSqr += sumSqrWeighted;
        leqSamples += samples;
    }

    if (leqSamples == 0)
    {
#if DEBUG == 1
        INMP441::logger->error(Logger::logString("[INMP441] update - Aucun échantillon reçu\n"));
#endif
        return ;
    }

    // Niveau équivalent pondéré A (LAeq) sur la période, en dB SPL
    double db = MIC_OFFSET_DB + MIC_REF_DB + 20 * log10(sqrt(leqSumSqr / leqSamples) / MIC_REF_AMPL);

    // Hors plage du micro : valeur bornée (le JSON n'accepte pas NaN / infini)
    if (overload)
        db = MIC_OVERLOAD_DB;
    else if (belowNoise || isnan(db) || (db < MIC_NOISE_DB))
        db = MIC_NOISE_DB;

    this->data.decibel[this->data.decibelIndex] = db;

    // Mise à jour des données
    std::string format = INMP441::formatData(this->data, this->stadiumBleacherId);
    Sensor::data = format;

#if DEBUG == 1
    INMP441::logger->info(Logger::logString("[INMP441] update - LAeq: %.1f dB (%u échantillons) - Nouvelle mesure sérialisée: %s", db, leqSamples, format.c_str()));
#else
    INMP441::logger->info(Logger::logString("db: %f\n", this->data.decibel[this->data.decibelIndex]));
#endif

    this->data.decibelIndex++;
    if (this->data.decibelIndex == NB_VALUE)
        this->data.decibelIndex = 0;

    return ;
}
#else
void INMP441::update()
{
#if DEBUG == 1
    INMP441::logger->info(Logger::logString("[INMP441] update - Mise à jour du capteur\n"));
#endif

    size_t bytesRead = 0;

    // Lecture de la trame
    i2s_read(I2S_PORT, INMP441::audioSample, sizeof(INMP441::audioSample), &bytesRead, 100 / portTICK_PERIOD_MS);

    int samples = bytesRead / sizeof(int32_t);
    if (samples > 0)
    {
#if DEBUG == 1
        INMP441::logger->info(Logger::logString("[INMP441] update - Samples reçu: %d\n", samples));
#endif

        // Calcul du RMS après retrait de l'offset DC via un filtre passe-haut
        // du 1er ordre à état persistant (y[n] = x[n] - x[n-1] + 0.9961*y[n-1]),
        // coupure ≈10Hz à 16kHz (cf. esp32-i2s-slm.ino, a=0.9992 à 48kHz)
        double sum = 0;
        for (int i=0; i < samples; i++)
        {
            double x = (double)(INMP441::audioSample[i] >> 8);
            double sample = x - this->dcBlockerLastX + 0.9961 * this->dcBlockerLastY;
            this->dcBlockerLastX = x;
            this->dcBlockerLastY = sample;

            #if DEBUG == 1
                INMP441::logger->info(Logger::logString("[INMP441] update - Sample reçu: %f\n", sample));
            #endif
            sum += sample * sample;
        }

        double rms = sqrt(sum / samples);

        // Convertion en décibel
        double db = 20.0 * log10((rms + 1) / RMS_REFERENCE);

        this->data.decibel[this->data.decibelIndex] = db;

        // Mise à jour des données
        std::string format = INMP441::formatData(this->data, this->stadiumBleacherId);
        Sensor::data = format;

#if DEBUG == 1
        INMP441::logger->info(Logger::logString("[INMP441] update - Nouvelle mesure sérialisée: %s", format.c_str()));
#else
        INMP441::logger->info(Logger::logString("db: %f\n", this->data.decibel[this->data.decibelIndex]));
#endif

        this->data.decibelIndex++;
        if (this->data.decibelIndex == NB_VALUE)
            this->data.decibelIndex = 0;
    }

    return ;
}
#endif // INMP441_SLM



void INMP441::notify(NimBLERemoteCharacteristic *, uint8_t *, size_t)
{
    return ;
}



#endif // _INMP441_CPP_
