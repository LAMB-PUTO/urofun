import { bool, completeness, yesno } from './types';
import type { Questionnaire, ScoreResult } from './types';

/**
 * Androgen Deficiency in the Aging Male (ADAM). 10 preguntas Sí/No.
 * Cribado positivo si responde Sí a la pregunta 1, a la pregunta 7, o a 3 o más preguntas cualesquiera.
 */
export const ADAM: Questionnaire = {
  id: 'adam',
  acronym: 'ADAM',
  name: 'Cuestionario de Deficiencia Androgénica del Varón Adulto',
  nameEn: 'Androgen Deficiency in the Aging Male',
  recall: 'Actualmente',
  intro: 'Responda Sí o No a cada pregunta pensando en cómo se ha sentido últimamente.',
  items: [
    yesno('q1', '¿Ha notado disminución de su deseo sexual?'),
    yesno('q2', '¿Siente falta de energía?'),
    yesno('q3', '¿Ha notado disminución de su fuerza o de su resistencia?'),
    yesno('q4', '¿Ha perdido estatura?'),
    yesno('q5', '¿Ha notado que disfruta menos de la vida?'),
    yesno('q6', '¿Se siente triste o de mal humor?'),
    yesno('q7', '¿Sus erecciones son menos firmes?'),
    yesno('q8', '¿Ha notado que le cuesta más hacer ejercicio o deporte que antes?'),
    yesno('q9', '¿Se queda dormido después de la cena?'),
    yesno('q10', '¿Ha bajado recientemente su rendimiento en el trabajo?'),
  ],
  score(answers): ScoreResult {
    const ids = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'];
    const yes = ids.filter((id) => bool(answers, id));
    const positive = bool(answers, 'q1') || bool(answers, 'q7') || yes.length >= 3;
    return {
      id: 'adam',
      acronym: 'ADAM',
      total: yes.length,
      max: 10,
      min: 0,
      interpretation: positive ? 'Cribado positivo para deficiencia androgénica' : 'Cribado negativo',
      severity: positive ? 'positive' : 'negative',
      positive,
      extra: { yesItems: yes },
      ...completeness(ADAM, answers),
    };
  },
};
