import { completeness, num, scale } from './types';
import type { Questionnaire, ScoreResult } from './types';

const FREQ_1_5 = [
  { value: 1, label: 'Casi nunca o nunca' },
  { value: 2, label: 'Pocas veces (mucho menos de la mitad)' },
  { value: 3, label: 'Algunas veces (la mitad)' },
  { value: 4, label: 'La mayoría de las veces (mucho más de la mitad)' },
  { value: 5, label: 'Casi siempre o siempre' },
];

/**
 * IIEF-5 / SHIM. 5 ítems; el ítem 1 va de 1-5 y los ítems 2-5 incluyen 0 = sin actividad sexual.
 * Total 1-25: 22-25 sin disfunción · 17-21 leve · 12-16 leve a moderada · 8-11 moderada · 1-7 severa.
 */
export const IIEF_5: Questionnaire = {
  id: 'iief_5',
  acronym: 'IIEF-5',
  name: 'Índice Internacional de Función Eréctil abreviado',
  nameEn: 'International Index of Erectile Function-5 (SHIM)',
  recall: 'Durante los últimos 6 meses',
  intro: 'Sus respuestas son confidenciales y solo las verá el doctor. Piense en los últimos 6 meses.',
  items: [
    scale('q1', '¿Cómo califica su confianza en poder lograr y mantener una erección?', [
      { value: 1, label: 'Muy baja' },
      { value: 2, label: 'Baja' },
      { value: 3, label: 'Moderada' },
      { value: 4, label: 'Alta' },
      { value: 5, label: 'Muy alta' },
    ]),
    scale(
      'q2',
      'Cuando tuvo erecciones con estimulación sexual, ¿con qué frecuencia fueron lo suficientemente firmes para la penetración?',
      [{ value: 0, label: 'No tuve actividad sexual' }, ...FREQ_1_5],
    ),
    scale(
      'q3',
      'Durante la relación sexual, ¿con qué frecuencia pudo mantener la erección después de la penetración?',
      [{ value: 0, label: 'No intenté tener relaciones' }, ...FREQ_1_5],
    ),
    scale('q4', 'Durante la relación sexual, ¿qué tan difícil fue mantener la erección hasta terminar?', [
      { value: 0, label: 'No intenté tener relaciones' },
      { value: 1, label: 'Extremadamente difícil' },
      { value: 2, label: 'Muy difícil' },
      { value: 3, label: 'Difícil' },
      { value: 4, label: 'Ligeramente difícil' },
      { value: 5, label: 'Nada difícil' },
    ]),
    scale('q5', 'Cuando intentó tener relaciones, ¿con qué frecuencia fueron satisfactorias para usted?', [
      { value: 0, label: 'No intenté tener relaciones' },
      ...FREQ_1_5,
    ]),
  ],
  score(answers): ScoreResult {
    const total = ['q1', 'q2', 'q3', 'q4', 'q5'].reduce((s, id) => s + num(answers, id), 0);
    let interpretation = 'Sin disfunción eréctil';
    let severity: ScoreResult['severity'] = 'none';
    if (total <= 7) {
      interpretation = 'Disfunción eréctil severa';
      severity = 'severe';
    } else if (total <= 11) {
      interpretation = 'Disfunción eréctil moderada';
      severity = 'moderate';
    } else if (total <= 16) {
      interpretation = 'Disfunción eréctil leve a moderada';
      severity = 'moderate';
    } else if (total <= 21) {
      interpretation = 'Disfunción eréctil leve';
      severity = 'mild';
    }
    return {
      id: 'iief_5',
      acronym: 'IIEF-5',
      total,
      max: 25,
      min: 1,
      interpretation,
      severity,
      ...completeness(IIEF_5, answers),
    };
  },
};
