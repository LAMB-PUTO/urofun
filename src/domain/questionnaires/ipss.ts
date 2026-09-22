import { FREQUENCY_0_5, NOCTURIA_0_5, QOL_0_6, completeness, num, scale } from './types';
import type { Questionnaire, ScoreResult } from './types';

/**
 * International Prostate Symptom Score (IPSS / AUA-SI).
 * 7 ítems 0-5 (total 0-35) + 1 ítem de calidad de vida 0-6 (no suma al total).
 * Severidad: 0-7 leve, 8-19 moderada, 20-35 severa.
 */
export const IPSS: Questionnaire = {
  id: 'ipss',
  acronym: 'IPSS',
  name: 'Puntuación Internacional de Síntomas Prostáticos',
  nameEn: 'International Prostate Symptom Score',
  recall: 'Durante el último mes',
  intro: 'Piense en cómo ha orinado durante el último mes y elija la opción que mejor describa su experiencia.',
  items: [
    scale('q1', 'Sensación de no haber vaciado la vejiga por completo al terminar de orinar', FREQUENCY_0_5),
    scale('q2', 'Tener que volver a orinar antes de que pasen dos horas', FREQUENCY_0_5),
    scale('q3', 'El chorro se detiene y vuelve a empezar varias veces mientras orina', FREQUENCY_0_5),
    scale('q4', 'Dificultad para aguantarse las ganas de orinar', FREQUENCY_0_5),
    scale('q5', 'El chorro de orina es débil', FREQUENCY_0_5),
    scale('q6', 'Tener que apretar o hacer fuerza para comenzar a orinar', FREQUENCY_0_5),
    scale('q7', 'Veces que se levanta a orinar por la noche, desde que se acuesta hasta que se levanta', NOCTURIA_0_5),
    scale(
      'qol',
      'Si tuviera que pasar el resto de su vida orinando como lo hace ahora, ¿cómo se sentiría?',
      QOL_0_6,
      { scored: false },
    ),
  ],
  score(answers): ScoreResult {
    const total = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'].reduce((s, id) => s + num(answers, id), 0);
    const qol = answers.qol;
    let interpretation = 'Sintomatología leve';
    let severity: ScoreResult['severity'] = 'mild';
    if (total >= 20) {
      interpretation = 'Sintomatología severa';
      severity = 'severe';
    } else if (total >= 8) {
      interpretation = 'Sintomatología moderada';
      severity = 'moderate';
    }
    return {
      id: 'ipss',
      acronym: 'IPSS',
      total,
      max: 35,
      min: 0,
      interpretation,
      severity,
      extra: typeof qol === 'number' ? { qolScore: qol } : undefined,
      ...completeness(IPSS, answers),
    };
  },
};
