import { completeness, list, multi, num, range, scale } from './types';
import type { Questionnaire, ScoreResult } from './types';

/**
 * International Consultation on Incontinence Questionnaire – Urinary Incontinence Short Form (ICIQ-UI SF).
 * Frecuencia 0-5 + cantidad 0/2/4/6 + afectación 0-10 = total 0-21.
 * El ítem "¿cuándo pierde orina?" es descriptivo y no puntúa.
 * 0 sin incontinencia · 1-5 leve · 6-12 moderada · 13-18 severa · 19-21 muy severa.
 */
export const ICIQ_UI_SF: Questionnaire = {
  id: 'iciq_ui_sf',
  acronym: 'ICIQ-UI SF',
  name: 'Cuestionario de Incontinencia Urinaria ICIQ-UI SF',
  nameEn: 'International Consultation on Incontinence Questionnaire – Urinary Incontinence Short Form',
  recall: 'Durante las últimas 4 semanas',
  intro: 'Muchas personas pierden orina en algún momento. Estas preguntas nos ayudan a saber con qué frecuencia y cuánto le afecta.',
  items: [
    scale('q1', '¿Con qué frecuencia pierde orina?', [
      { value: 0, label: 'Nunca' },
      { value: 1, label: 'Una vez a la semana o menos' },
      { value: 2, label: 'Dos o tres veces a la semana' },
      { value: 3, label: 'Una vez al día' },
      { value: 4, label: 'Varias veces al día' },
      { value: 5, label: 'Continuamente' },
    ]),
    scale('q2', '¿Qué cantidad de orina cree que pierde habitualmente, use o no protección?', [
      { value: 0, label: 'No pierdo nada' },
      { value: 2, label: 'Muy poca cantidad' },
      { value: 4, label: 'Una cantidad moderada' },
      { value: 6, label: 'Mucha cantidad' },
    ]),
    range('q3', 'En general, ¿en qué medida estas pérdidas de orina afectan su vida diaria?', 0, 10, 'Nada', 'Muchísimo'),
    multi(
      'when',
      '¿Cuándo pierde orina? Puede marcar todas las que correspondan.',
      [
        { value: 'antes_bano', label: 'Antes de llegar al baño' },
        { value: 'toser', label: 'Al toser o estornudar' },
        { value: 'dormir', label: 'Mientras duerme' },
        { value: 'esfuerzo', label: 'Al hacer esfuerzo físico o ejercicio' },
        { value: 'vestido', label: 'Al terminar de orinar y ya vestido' },
        { value: 'sin_motivo', label: 'Sin motivo aparente' },
        { value: 'continua', label: 'De forma continua' },
      ],
      { scored: false, noneLabel: 'Nunca pierdo orina' },
    ),
  ],
  score(answers): ScoreResult {
    const total = num(answers, 'q1') + num(answers, 'q2') + num(answers, 'q3');
    let interpretation = 'Sin incontinencia';
    let severity: ScoreResult['severity'] = 'none';
    if (total >= 19) {
      interpretation = 'Incontinencia muy severa';
      severity = 'very_severe';
    } else if (total >= 13) {
      interpretation = 'Incontinencia severa';
      severity = 'severe';
    } else if (total >= 6) {
      interpretation = 'Incontinencia moderada';
      severity = 'moderate';
    } else if (total >= 1) {
      interpretation = 'Incontinencia leve';
      severity = 'mild';
    }
    return {
      id: 'iciq_ui_sf',
      acronym: 'ICIQ-UI SF',
      total,
      max: 21,
      min: 0,
      interpretation,
      severity,
      extra: { when: list(answers, 'when') },
      ...completeness(ICIQ_UI_SF, answers),
    };
  },
};
