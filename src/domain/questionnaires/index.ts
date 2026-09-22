import { ADAM } from './adam';
import { FSFI_6 } from './fsfi6';
import { ICIQ_OAB } from './iciqOab';
import { ICIQ_UI_SF } from './iciqUiSf';
import { IIEF_5 } from './iief5';
import { IPSS } from './ipss';
import { NIH_CPSI } from './nihCpsi';
import { OLEARY_SANT } from './olearySant';
import { PEDT } from './pedt';
import type { Answers, Questionnaire, QuestionnaireId, ScoreResult } from './types';

export * from './types';

export const QUESTIONNAIRES: Record<QuestionnaireId, Questionnaire> = {
  ipss: IPSS,
  nih_cpsi: NIH_CPSI,
  iciq_ui_sf: ICIQ_UI_SF,
  iciq_oab: ICIQ_OAB,
  oleary_sant: OLEARY_SANT,
  iief_5: IIEF_5,
  pedt: PEDT,
  adam: ADAM,
  fsfi_6: FSFI_6,
};

export const QUESTIONNAIRE_ORDER: QuestionnaireId[] = [
  'ipss',
  'nih_cpsi',
  'iciq_ui_sf',
  'iciq_oab',
  'oleary_sant',
  'iief_5',
  'pedt',
  'adam',
  'fsfi_6',
];

export type QuestionnaireAnswers = Partial<Record<QuestionnaireId, Answers>>;
export type QuestionnaireScores = Partial<Record<QuestionnaireId, ScoreResult>>;

/** Puntúa únicamente los cuestionarios aplicados (los que tienen respuestas). */
export const scoreAll = (applied: QuestionnaireId[], answers: QuestionnaireAnswers): QuestionnaireScores => {
  const out: QuestionnaireScores = {};
  for (const id of applied) {
    out[id] = QUESTIONNAIRES[id].score(answers[id] ?? {});
  }
  return out;
};

/** Texto de severidad para chips/etiquetas. */
export const severityLabel: Record<ScoreResult['severity'], string> = {
  none: 'Sin alteración',
  mild: 'Leve',
  moderate: 'Moderado',
  severe: 'Severo',
  very_severe: 'Muy severo',
  positive: 'Positivo',
  negative: 'Negativo',
  info: 'Reportado',
};
