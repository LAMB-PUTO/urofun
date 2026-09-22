import { NOCTURIA_0_5, completeness, num, range, scale } from './types';
import type { Questionnaire, ScoreResult } from './types';

const OFTEN_0_4 = [
  { value: 0, label: 'Nunca' },
  { value: 1, label: 'Ocasionalmente' },
  { value: 2, label: 'Algunas veces' },
  { value: 3, label: 'La mayor parte del tiempo' },
  { value: 4, label: 'Todo el tiempo' },
];

const bother = (id: string, text: string) =>
  range(id, text, 0, 10, 'Nada', 'Muchísimo', { scored: false, help: '¿Qué tanto le molesta esto?' });

/**
 * ICIQ-OAB (vejiga hiperactiva). 4 ítems 0-4 = total 0-16 (a mayor puntaje, mayor severidad; sin categorías oficiales).
 * Cada ítem lleva una escala de molestia 0-10 que no suma al total.
 */
export const ICIQ_OAB: Questionnaire = {
  id: 'iciq_oab',
  acronym: 'ICIQ-OAB',
  name: 'Cuestionario de Vejiga Hiperactiva ICIQ-OAB',
  nameEn: 'International Consultation on Incontinence Questionnaire – Overactive Bladder',
  recall: 'Durante las últimas 4 semanas',
  intro: 'Estas preguntas se refieren a la frecuencia y urgencia con la que orina y a cuánto le molesta.',
  items: [
    scale('q1', '¿Cuántas veces orina durante el día?', [
      { value: 0, label: 'De 1 a 6 veces' },
      { value: 1, label: 'De 7 a 8 veces' },
      { value: 2, label: 'De 9 a 10 veces' },
      { value: 3, label: 'De 11 a 12 veces' },
      { value: 4, label: '13 veces o más' },
    ]),
    bother('q1_bother', '¿Qué tanto le molesta orinar tantas veces de día?'),
    scale('q2', '¿Cuántas veces se levanta a orinar durante la noche?', NOCTURIA_0_5.slice(0, 4).concat([{ value: 4, label: 'Cuatro o más' }])),
    bother('q2_bother', '¿Qué tanto le molesta levantarse de noche?'),
    scale('q3', '¿Tiene que apurarse para llegar al baño a orinar?', OFTEN_0_4),
    bother('q3_bother', '¿Qué tanto le molesta esa urgencia?'),
    scale('q4', '¿Se le escapa la orina antes de llegar al baño?', OFTEN_0_4),
    bother('q4_bother', '¿Qué tanto le molestan esos escapes?'),
  ],
  score(answers): ScoreResult {
    const total = ['q1', 'q2', 'q3', 'q4'].reduce((s, id) => s + num(answers, id), 0);
    const botherTotal = ['q1_bother', 'q2_bother', 'q3_bother', 'q4_bother'].reduce((s, id) => s + num(answers, id), 0);
    return {
      id: 'iciq_oab',
      acronym: 'ICIQ-OAB',
      total,
      max: 16,
      min: 0,
      interpretation: total === 0 ? 'Sin síntomas de vejiga hiperactiva' : `Puntaje ${total}/16 (a mayor puntaje, mayor severidad)`,
      severity: total === 0 ? 'none' : 'info',
      extra: { botherTotal, botherMax: 40 },
      ...completeness(ICIQ_OAB, answers),
    };
  },
};
