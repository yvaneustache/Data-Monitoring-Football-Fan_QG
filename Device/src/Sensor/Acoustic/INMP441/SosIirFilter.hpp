/**
 * @file SosIirFilter.hpp
 *
 * @brief Filtre IIR en cascade de sections du second ordre (Second-Order Sections).
 *
 * Portage C++ portable de sos-iir-filter.h du projet esp32-i2s-slm
 * (https://github.com/ikostoski/esp32-i2s-slm), (c)2019 Ivan Kostoski,
 * distribué sous licence GNU GPL v3 ou ultérieure.
 *
 * L'implémentation d'origine est écrite en assembleur Xtensa (ESP32). Celle-ci
 * effectue exactement les mêmes calculs en C++ afin de rester compatible avec
 * l'ESP32-S3 :
 *   - b0 et a0 sont supposés égaux à 1.0 ;
 *   - les coefficients a1 et a2 sont stockés avec un signe inversé (sortie tf2sos) ;
 *   - le gain n'est appliqué que sur la dernière section ;
 *   - filter() retourne la somme des carrés des échantillons filtrés.
 */

#ifndef _SOS_IIR_FILTER_HPP_
#define _SOS_IIR_FILTER_HPP_

// ============================================================================
//  Import des headers externes
// ============================================================================

#include <stddef.h>

// ============================================================================
//  Configuration
// ============================================================================

#define SOS_MAX_SECTIONS 4 ///< @brief Nombre maximal de sections du second ordre par filtre.

/**
 * @struct SosCoefficients
 *
 * @brief Coefficients d'une section du second ordre {b1, b2, -a1, -a2}.
 */
struct SosCoefficients
{
    float b1; ///< @brief Coefficient b1.
    float b2; ///< @brief Coefficient b2.
    float a1; ///< @brief Coefficient -a1.
    float a2; ///< @brief Coefficient -a2.
};

/**
 * @struct SosDelayState
 *
 * @brief Mémoire d'une section du second ordre (forme directe II).
 */
struct SosDelayState
{
    float w0 = 0; ///< @brief w[n-1].
    float w1 = 0; ///< @brief w[n-2].
};

/**
 * @class SosIirFilter
 *
 * @brief Filtre IIR en cascade de sections du second ordre, à état persistant entre deux appels.
 */
class SosIirFilter
{

// ============================================================================
//  Attribut
// ============================================================================

    private:
        const size_t numSos;                 ///< @brief Nombre de sections.
        const float gain;                    ///< @brief Gain appliqué en sortie de la dernière section.
        const SosCoefficients * sos;         ///< @brief Coefficients des sections.
        SosDelayState w[SOS_MAX_SECTIONS];   ///< @brief Mémoire des sections.

// ============================================================================
//  Constructeur
// ============================================================================

    public:
        /**
         * @brief Construit un filtre à partir d'un tableau constant de sections.
         *
         * @param gain Gain appliqué en sortie de la dernière section.
         * @param sos  Tableau des coefficients des sections.
         */
        template <size_t N>
        SosIirFilter(const float gain, const SosCoefficients (&sos)[N]):
        numSos(N),
        gain(gain),
        sos(sos)
        {
            static_assert(N > 0 && N <= SOS_MAX_SECTIONS, "Nombre de sections du filtre invalide");
        }

// ============================================================================
//  Méthode
// ============================================================================

    public:
        /**
         * @brief Applique le filtre à un bloc d'échantillons.
         *
         * @param input  Échantillons d'entrée.
         * @param output Échantillons filtrés (peut être identique à input).
         * @param len    Nombre d'échantillons.
         *
         * @return float Somme des carrés des échantillons filtrés.
         */
        float filter(const float * input, float * output, size_t len)
        {
            const float * source = input;

            // Toutes les sections sauf la dernière, sans gain
            for (size_t i=0; i < this->numSos - 1; i++)
            {
                SosIirFilter::applySection(source, output, len, this->sos[i], this->w[i], 1.0f);
                source = output;
            }

            // Dernière section avec le gain, retourne la somme des carrés
            return SosIirFilter::applySection(source, output, len, this->sos[this->numSos - 1], this->w[this->numSos - 1], this->gain);
        }

    private:
        /**
         * @brief Applique une section du second ordre.
         *
         * @return float Somme des carrés des échantillons de sortie.
         */
        static float applySection(const float * input, float * output, size_t len, const SosCoefficients & c, SosDelayState & state, float gain)
        {
            float w0 = state.w0;
            float w1 = state.w1;
            float sumSqr = 0;

            for (size_t i=0; i < len; i++)
            {
                float x = input[i] + c.a1 * w0 + c.a2 * w1;
                float y = (x + c.b1 * w0 + c.b2 * w1) * gain;
                output[i] = y;
                w1 = w0;
                w0 = x;
                sumSqr += y * y;
            }

            state.w0 = w0;
            state.w1 = w1;

            return sumSqr;
        }

};



#endif // _SOS_IIR_FILTER_HPP_
