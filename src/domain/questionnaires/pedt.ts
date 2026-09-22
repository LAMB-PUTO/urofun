import { completeness, num, scale } from './types';
import type { Questionnaire, ScoreResult } from './types';

const PCT_0_4 = [
  { value: 0, label: 'Casi nunca o nunca (0 %)' },
  { value: 1, label: 'Menos de la mitad de las veces (25 %)' },
  { value: 2, label: 'Aproximadamente la mitad de las veces (50 %)' },
  { value: 3, label: 'Más de la mitad de las veces (75 %)' },
  { value: 4, label: 'Casi siempre o siempre (100 %)' },
];

/**
 * Premature Ejaculation Diagnostic Tool (PEDT). 5 ítems 0-4, total 0-20.
 * ≤ 8 eyaculación precoz poco probable · 9-10 probable · ≥ 11 muy probable.
 */
export const PEDT: Questionnaire = {
  id: 'pedt',
  acronym: 'PEDT',
  name: 'Herramienta Diagnóstica de Eyaculación Precoz',
  nameEn: 'Premature Ejaculation Diagnostic Tool',
  recall: 'En general, en sus relaciones sexuales',
  intro: 'Sus respuestas son confidenciales. Conteste pensando en cómo ha sido habitualmente.',
  items: [
    scale('q1', '¿Qué tan difícil es para usted retrasar la eyaculación?', [
      { value: 0, label: 'Nada difícil' },
      { value: 1, label: 'Un poco difícil' },
      { value: 2, label: 'Moderadamente difícil' },
      { value: 3, label: 'Muy difícil' },
      { value: 4, label: 'Extremadamente difícil' },
    ]),
    scale('q2', '¿Eyacula antes de lo que usted quisiera?', PCT_0_4),
    scale('q3', '¿Eyacula con muy poca estimulación?', PCT_0_4),
    scale('q4', '¿Se siente frustrado por eyacular antes de lo que quisiera?', [
      { value: 0, label: 'Nada' },
      { value: 1, label: 'Un poco' },
      { value: 2, label: 'Moderadamente' },
      { value: 3, label: 'Mucho' },
      { value: 4, label: 'Extremadamente' },
    ]),
    scale('q5', '¿Le preocupa que el tiempo hasta su eyaculación deje insatisfecha a su pareja?', [
      { value: 0, label: 'Nada preocupado' },
      { value: 1, label: 'Un poco preocupado' },
      { value: 2, label: 'Moderadamente preocupado' },
      { value: 3, label: 'Muy preocupado' },
      { value: 4, label: 'Extremadamente preocupado' },
    ]),
  ],
  score(answers): ScoreResult {
    const total = ['q1', 'q2', 'q3', 'q4', 'q5'].reduce((s, id) => s + num(answers, id), 0);
    let interpretation = 'Eyaculación precoz poco probable';
    let severity: ScoreResult['severity'] = 'negative';
    let positive = false;
    if (total >= 11) {
      interpretation = 'Eyaculación precoz muy probable';
      severity = 'positive';
      positive = true;
    } else if (total >= 9) {
      interpretation = 'Eyaculación precoz probable';
      severity = 'moderate';
      positive = true;
    }
    return {
      id: 'pedt',
      acronym: 'PEDT',
      total,
      max: 20,
      min: 0,
      interpretation,
      severity,
      positive,
      ...completeness(PEDT, answers),
    };
  },
};
