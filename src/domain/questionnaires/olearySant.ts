import { FREQUENCY_0_5, NOCTURIA_0_5, completeness, num, scale } from './types';
import type { Questionnaire, ScoreResult } from './types';

const PROBLEM_0_4 = [
  { value: 0, label: 'Ningún problema' },
  { value: 1, label: 'Un problema muy pequeño' },
  { value: 2, label: 'Un problema pequeño' },
  { value: 3, label: 'Un problema mediano' },
  { value: 4, label: 'Un problema grande' },
];

/**
 * O'Leary-Sant: Índice de Síntomas de Cistitis Intersticial (ICSI, 0-20) e Índice de Problemas (ICPI, 0-16).
 * El ítem 4 del ICSI usa la escala oficial 0, 2, 3, 4, 5. Se reportan por separado; no existen categorías oficiales,
 * aunque ICSI ≥ 6 e ICPI ≥ 6 suelen considerarse sugestivos de cistitis intersticial / síndrome de vejiga dolorosa.
 */
export const OLEARY_SANT: Questionnaire = {
  id: 'oleary_sant',
  acronym: "O'Leary-Sant",
  name: "Índices de Síntomas y Problemas de Cistitis Intersticial de O'Leary-Sant",
  nameEn: "O'Leary-Sant Interstitial Cystitis Symptom and Problem Index",
  recall: 'Durante el último mes',
  intro: 'La primera parte pregunta con qué frecuencia le ocurre cada cosa; la segunda, qué tanto problema le ha causado.',
  items: [
    scale('icsi1', '¿Con qué frecuencia ha sentido una necesidad fuerte de orinar con poco o ningún aviso?', FREQUENCY_0_5, { domain: 'icsi' }),
    scale('icsi2', '¿Con qué frecuencia ha tenido que orinar menos de dos horas después de haber orinado?', FREQUENCY_0_5, { domain: 'icsi' }),
    scale('icsi3', '¿Cuántas veces se levanta a orinar por la noche?', NOCTURIA_0_5, { domain: 'icsi' }),
    scale(
      'icsi4',
      '¿Ha tenido ardor, dolor, molestia o presión en la vejiga?',
      [
        { value: 0, label: 'Nunca' },
        { value: 2, label: 'Algunas veces' },
        { value: 3, label: 'Con bastante frecuencia' },
        { value: 4, label: 'Casi siempre' },
        { value: 5, label: 'Siempre' },
      ],
      { domain: 'icsi' },
    ),
    scale('icpi1', 'Orinar con mucha frecuencia durante el día', PROBLEM_0_4, { domain: 'icpi' }),
    scale('icpi2', 'Levantarse por la noche a orinar', PROBLEM_0_4, { domain: 'icpi' }),
    scale('icpi3', 'La necesidad urgente de orinar con poco aviso', PROBLEM_0_4, { domain: 'icpi' }),
    scale('icpi4', 'Ardor, dolor, molestia o presión en la vejiga', PROBLEM_0_4, { domain: 'icpi' }),
  ],
  score(answers): ScoreResult {
    const icsi = ['icsi1', 'icsi2', 'icsi3', 'icsi4'].reduce((s, id) => s + num(answers, id), 0);
    const icpi = ['icpi1', 'icpi2', 'icpi3', 'icpi4'].reduce((s, id) => s + num(answers, id), 0);
    const suggestive = icsi >= 6 && icpi >= 6;
    return {
      id: 'oleary_sant',
      acronym: "O'Leary-Sant",
      total: icsi + icpi,
      max: 36,
      min: 0,
      interpretation: suggestive
        ? `ICSI ${icsi}/20 e ICPI ${icpi}/16 (ambos ≥ 6: sugestivo de vejiga dolorosa)`
        : `ICSI ${icsi}/20 e ICPI ${icpi}/16`,
      severity: suggestive ? 'positive' : 'info',
      positive: suggestive,
      subscales: [
        { key: 'icsi', label: 'Índice de síntomas (ICSI)', value: icsi, max: 20 },
        { key: 'icpi', label: 'Índice de problemas (ICPI)', value: icpi, max: 16 },
      ],
      ...completeness(OLEARY_SANT, answers),
    };
  },
};
