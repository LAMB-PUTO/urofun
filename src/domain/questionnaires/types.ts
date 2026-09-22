/**
 * Modelo declarativo de instrumentos clinimétricos.
 * Cada cuestionario se describe como datos (ítems + opciones) y expone su
 * propia función de puntuación según el instrumento oficial. La UI se genera
 * a partir de estos datos, por lo que no hay valores por defecto que sesguen
 * la puntuación: un ítem sin responder es `null`.
 */

export type QuestionnaireId =
  | 'ipss'
  | 'nih_cpsi'
  | 'iciq_ui_sf'
  | 'iciq_oab'
  | 'oleary_sant'
  | 'iief_5'
  | 'pedt'
  | 'adam'
  | 'fsfi_6';

export type Severity =
  | 'none'
  | 'mild'
  | 'moderate'
  | 'severe'
  | 'very_severe'
  | 'positive'
  | 'negative'
  | 'info';

export interface ScaleOption {
  value: number;
  label: string;
}

export interface ChoiceOption {
  value: string;
  label: string;
}

interface BaseItem {
  id: string;
  text: string;
  help?: string;
  /** Subescala a la que pertenece (para instrumentos con dominios). */
  domain?: string;
  /** `false` cuando el ítem se registra pero no suma al total. */
  scored?: boolean;
  /** Ítem opcional: puede quedar sin responder sin marcar el cuestionario incompleto. */
  optional?: boolean;
}

/** Escala tipo Likert: una sola opción con valor numérico. */
export interface ScaleItem extends BaseItem {
  kind: 'scale';
  options: ScaleOption[];
}

/** Selección múltiple: cada opción marcada suma `pointsPerSelection`. */
export interface MultiItem extends BaseItem {
  kind: 'multi';
  options: ChoiceOption[];
  pointsPerSelection?: number;
  /** Etiqueta para la opción "ninguna" que vacía la selección. */
  noneLabel?: string;
}

/** Escala numérica continua (0-10). */
export interface RangeItem extends BaseItem {
  kind: 'range';
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
}

export interface YesNoItem extends BaseItem {
  kind: 'yesno';
}

export type QuestionnaireItem = ScaleItem | MultiItem | RangeItem | YesNoItem;

export type AnswerValue = number | string[] | boolean;
export type Answers = Record<string, AnswerValue | null | undefined>;

export interface Subscale {
  key: string;
  label: string;
  value: number;
  max: number;
}

export interface ScoreResult {
  id: QuestionnaireId;
  acronym: string;
  total: number;
  max: number;
  min: number;
  interpretation: string;
  severity: Severity;
  subscales?: Subscale[];
  /** Instrumentos de cribado: resultado dicotómico. */
  positive?: boolean;
  /** Valores adicionales reportables (ej. calidad de vida IPSS, molestia ICIQ-OAB). */
  extra?: Record<string, number | string | string[]>;
  /** `true` cuando todos los ítems puntuables fueron respondidos. */
  complete: boolean;
  answeredCount: number;
  itemCount: number;
}

export interface Questionnaire {
  id: QuestionnaireId;
  acronym: string;
  /** Nombre completo oficial (en español). */
  name: string;
  nameEn: string;
  /** Periodo de recuerdo que se muestra al paciente. */
  recall: string;
  intro: string;
  items: QuestionnaireItem[];
  score: (answers: Answers) => ScoreResult;
}

// ---------- helpers compartidos ----------

export const isAnswered = (item: QuestionnaireItem, value: AnswerValue | null | undefined): boolean => {
  if (value === null || value === undefined) return false;
  switch (item.kind) {
    case 'scale':
    case 'range':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'yesno':
      return typeof value === 'boolean';
    case 'multi':
      return Array.isArray(value);
  }
};

export const unansweredItems = (q: Questionnaire, answers: Answers): QuestionnaireItem[] =>
  q.items.filter((item) => !item.optional && !isAnswered(item, answers[item.id]));

export const num = (answers: Answers, id: string): number => {
  const v = answers[id];
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0;
};

export const list = (answers: Answers, id: string): string[] => {
  const v = answers[id];
  return Array.isArray(v) ? v : [];
};

export const bool = (answers: Answers, id: string): boolean => answers[id] === true;

export const completeness = (q: Questionnaire, answers: Answers) => {
  const scoredItems = q.items.filter((i) => i.scored !== false && !i.optional);
  const answered = scoredItems.filter((i) => isAnswered(i, answers[i.id])).length;
  return { complete: answered === scoredItems.length, answeredCount: answered, itemCount: scoredItems.length };
};

export const scale = (id: string, text: string, options: ScaleOption[], extra: Partial<ScaleItem> = {}): ScaleItem => ({
  kind: 'scale',
  id,
  text,
  options,
  ...extra,
});

export const range = (
  id: string,
  text: string,
  min: number,
  max: number,
  minLabel: string,
  maxLabel: string,
  extra: Partial<RangeItem> = {},
): RangeItem => ({ kind: 'range', id, text, min, max, minLabel, maxLabel, ...extra });

export const multi = (id: string, text: string, options: ChoiceOption[], extra: Partial<MultiItem> = {}): MultiItem => ({
  kind: 'multi',
  id,
  text,
  options,
  ...extra,
});

export const yesno = (id: string, text: string, extra: Partial<YesNoItem> = {}): YesNoItem => ({
  kind: 'yesno',
  id,
  text,
  ...extra,
});

/** Opciones de frecuencia estilo IPSS (0-5). */
export const FREQUENCY_0_5: ScaleOption[] = [
  { value: 0, label: 'Ninguna vez' },
  { value: 1, label: 'Menos de 1 de cada 5 veces' },
  { value: 2, label: 'Menos de la mitad de las veces' },
  { value: 3, label: 'La mitad de las veces' },
  { value: 4, label: 'Más de la mitad de las veces' },
  { value: 5, label: 'Casi siempre' },
];

export const NOCTURIA_0_5: ScaleOption[] = [
  { value: 0, label: 'Ninguna' },
  { value: 1, label: 'Una vez' },
  { value: 2, label: 'Dos veces' },
  { value: 3, label: 'Tres veces' },
  { value: 4, label: 'Cuatro veces' },
  { value: 5, label: 'Cinco o más' },
];

export const QOL_0_6: ScaleOption[] = [
  { value: 0, label: 'Encantado' },
  { value: 1, label: 'Muy satisfecho' },
  { value: 2, label: 'Más bien satisfecho' },
  { value: 3, label: 'Tan satisfecho como insatisfecho' },
  { value: 4, label: 'Más bien insatisfecho' },
  { value: 5, label: 'Muy insatisfecho' },
  { value: 6, label: 'Fatal' },
];
