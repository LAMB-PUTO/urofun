import { completeness, num, scale } from './types';
import type { Questionnaire, ScoreResult } from './types';

/**
 * Female Sexual Function Index-6 (FSFI-6). 6 ítems; total 2-30.
 * ≤ 19 cribado positivo (amerita FSFI completo en consulta) · ≥ 20 sin alteración.
 * El ítem de dolor está codificado en sentido inverso en las etiquetas (mayor puntaje = menos dolor).
 */
export const FSFI_6: Questionnaire = {
  id: 'fsfi_6',
  acronym: 'FSFI-6',
  name: 'Índice de Función Sexual Femenina abreviado',
  nameEn: 'Female Sexual Function Index-6',
  recall: 'Durante las últimas 4 semanas',
  intro: 'Sus respuestas son confidenciales y solo las verá el doctor. Piense en las últimas 4 semanas.',
  items: [
    scale('q1', '¿Cómo calificaría su nivel de deseo o interés sexual?', [
      { value: 1, label: 'Muy bajo o ninguno' },
      { value: 2, label: 'Bajo' },
      { value: 3, label: 'Moderado' },
      { value: 4, label: 'Alto' },
      { value: 5, label: 'Muy alto' },
    ]),
    scale('q2', '¿Cómo calificaría su nivel de excitación durante la actividad sexual?', [
      { value: 0, label: 'No tuve actividad sexual' },
      { value: 1, label: 'Muy bajo o ninguno' },
      { value: 2, label: 'Bajo' },
      { value: 3, label: 'Moderado' },
      { value: 4, label: 'Alto' },
      { value: 5, label: 'Muy alto' },
    ]),
    scale('q3', '¿Qué tan difícil fue lograr lubricación (humedad) durante la actividad sexual?', [
      { value: 0, label: 'No tuve actividad sexual' },
      { value: 1, label: 'Extremadamente difícil o imposible' },
      { value: 2, label: 'Muy difícil' },
      { value: 3, label: 'Difícil' },
      { value: 4, label: 'Ligeramente difícil' },
      { value: 5, label: 'Nada difícil' },
    ]),
    scale('q4', 'Cuando tuvo estimulación sexual o relaciones, ¿con qué frecuencia llegó al orgasmo?', [
      { value: 0, label: 'No tuve actividad sexual' },
      { value: 1, label: 'Casi nunca o nunca' },
      { value: 2, label: 'Pocas veces' },
      { value: 3, label: 'Algunas veces (la mitad)' },
      { value: 4, label: 'La mayoría de las veces' },
      { value: 5, label: 'Casi siempre o siempre' },
    ]),
    scale('q5', '¿Qué tan satisfecha ha estado con su vida sexual en general?', [
      { value: 1, label: 'Muy insatisfecha' },
      { value: 2, label: 'Moderadamente insatisfecha' },
      { value: 3, label: 'Igual de satisfecha que insatisfecha' },
      { value: 4, label: 'Moderadamente satisfecha' },
      { value: 5, label: 'Muy satisfecha' },
    ]),
    scale('q6', '¿Con qué frecuencia sintió dolor o molestia durante o después de la penetración vaginal?', [
      { value: 0, label: 'No hubo intentos de penetración' },
      { value: 1, label: 'Casi siempre o siempre' },
      { value: 2, label: 'La mayoría de las veces' },
      { value: 3, label: 'Algunas veces (la mitad)' },
      { value: 4, label: 'Pocas veces' },
      { value: 5, label: 'Casi nunca o nunca' },
    ]),
  ],
  score(answers): ScoreResult {
    const total = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].reduce((s, id) => s + num(answers, id), 0);
    const positive = total <= 19;
    return {
      id: 'fsfi_6',
      acronym: 'FSFI-6',
      total,
      max: 30,
      min: 2,
      interpretation: positive
        ? 'Cribado positivo: sugiere disfunción sexual femenina (amerita FSFI completo)'
        : 'Cribado sin alteración',
      severity: positive ? 'positive' : 'negative',
      positive,
      ...completeness(FSFI_6, answers),
    };
  },
};
