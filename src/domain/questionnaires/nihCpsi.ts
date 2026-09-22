import { FREQUENCY_0_5, QOL_0_6, completeness, list, multi, num, range, scale } from './types';
import type { Questionnaire, ScoreResult } from './types';

const IMPACT_0_3 = [
  { value: 0, label: 'Nada' },
  { value: 1, label: 'Solo un poco' },
  { value: 2, label: 'Algo' },
  { value: 3, label: 'Mucho' },
];

/**
 * NIH Chronic Prostatitis Symptom Index (NIH-CPSI).
 * Dolor 0-21 (Q1 a-d, Q2 a-b, Q3, Q4) · Urinario 0-10 (Q5, Q6) · Calidad de vida 0-12 (Q7, Q8, Q9).
 * Total 0-43. Severidad con dolor + urinario (0-31): 0-9 leve, 10-18 moderada, 19-31 severa.
 */
export const NIH_CPSI: Questionnaire = {
  id: 'nih_cpsi',
  acronym: 'NIH-CPSI',
  name: 'Índice de Síntomas de Prostatitis Crónica de los NIH',
  nameEn: 'NIH Chronic Prostatitis Symptom Index',
  recall: 'Durante la última semana',
  intro: 'Estas preguntas se refieren al dolor o molestia y a la forma de orinar durante la última semana.',
  items: [
    multi(
      'q1',
      'En la última semana, ¿ha tenido dolor o molestia en alguna de estas zonas?',
      [
        { value: 'perineo', label: 'Entre el recto y los testículos (periné)' },
        { value: 'testiculos', label: 'En los testículos' },
        { value: 'punta_pene', label: 'En la punta del pene (sin relación con orinar)' },
        { value: 'pubis_vejiga', label: 'Debajo de la cintura, en el pubis o la vejiga' },
      ],
      { domain: 'pain', pointsPerSelection: 1, noneLabel: 'En ninguna de estas zonas' },
    ),
    multi(
      'q2',
      'En la última semana, ¿ha tenido...?',
      [
        { value: 'dolor_orinar', label: 'Dolor o ardor al orinar' },
        { value: 'dolor_eyacular', label: 'Dolor o molestia durante o después de la eyaculación' },
      ],
      { domain: 'pain', pointsPerSelection: 1, noneLabel: 'Ninguna de las dos' },
    ),
    scale(
      'q3',
      '¿Con qué frecuencia ha tenido dolor o molestia en alguna de esas zonas durante la última semana?',
      [
        { value: 0, label: 'Nunca' },
        { value: 1, label: 'Rara vez' },
        { value: 2, label: 'Algunas veces' },
        { value: 3, label: 'A menudo' },
        { value: 4, label: 'Casi siempre' },
        { value: 5, label: 'Siempre' },
      ],
      { domain: 'pain' },
    ),
    range(
      'q4',
      'En los días que tuvo dolor, ¿qué número describe mejor su dolor PROMEDIO?',
      0,
      10,
      'Sin dolor',
      'El peor dolor imaginable',
      { domain: 'pain' },
    ),
    scale(
      'q5',
      '¿Con qué frecuencia ha tenido la sensación de no vaciar por completo la vejiga al terminar de orinar?',
      FREQUENCY_0_5,
      { domain: 'urinary' },
    ),
    scale(
      'q6',
      '¿Con qué frecuencia ha tenido que volver a orinar antes de que pasen dos horas?',
      FREQUENCY_0_5,
      { domain: 'urinary' },
    ),
    scale('q7', '¿Cuánto le han impedido sus síntomas hacer sus actividades habituales?', IMPACT_0_3, { domain: 'qol' }),
    scale('q8', '¿Cuánto ha pensado en sus síntomas durante la última semana?', IMPACT_0_3, { domain: 'qol' }),
    scale(
      'q9',
      'Si tuviera que pasar el resto de su vida con los síntomas tal como los tuvo esta última semana, ¿cómo se sentiría?',
      QOL_0_6,
      { domain: 'qol' },
    ),
  ],
  score(answers): ScoreResult {
    const painScore = list(answers, 'q1').length + list(answers, 'q2').length + num(answers, 'q3') + num(answers, 'q4');
    const urinaryScore = num(answers, 'q5') + num(answers, 'q6');
    const qolScore = num(answers, 'q7') + num(answers, 'q8') + num(answers, 'q9');
    const total = painScore + urinaryScore + qolScore;
    const symptomScale = painScore + urinaryScore;
    let interpretation = 'Sintomatología leve';
    let severity: ScoreResult['severity'] = 'mild';
    if (symptomScale >= 19) {
      interpretation = 'Sintomatología severa';
      severity = 'severe';
    } else if (symptomScale >= 10) {
      interpretation = 'Sintomatología moderada';
      severity = 'moderate';
    }
    return {
      id: 'nih_cpsi',
      acronym: 'NIH-CPSI',
      total,
      max: 43,
      min: 0,
      interpretation: `${interpretation} (dolor + urinario ${symptomScale}/31)`,
      severity,
      subscales: [
        { key: 'pain', label: 'Dolor', value: painScore, max: 21 },
        { key: 'urinary', label: 'Síntomas urinarios', value: urinaryScore, max: 10 },
        { key: 'qol', label: 'Calidad de vida', value: qolScore, max: 12 },
      ],
      extra: { symptomScale },
      ...completeness(NIH_CPSI, answers),
    };
  },
};
