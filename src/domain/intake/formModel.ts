import { QUESTIONNAIRES, scoreAll } from '../questionnaires';
import type { Answers, QuestionnaireAnswers, QuestionnaireId, QuestionnaireItem } from '../questionnaires';
import type { Gender, GeneralHistory, Intake, KidneyHistory, PersonalData, ProstateHistory, SexualHistory, UtiHistory, Visit, VisitSource } from '../types';
import { ageFromBirthDate } from '../types';
import { ALARM_SYMPTOMS, REASONS, SPHERES, enabledHistorySteps, symptomLabels, triggeredQuestionnaires } from './catalog';
import type { HistoryStepKey, ReasonKey, SphereKey, SymptomSelection } from './catalog';
import { extractRedFlags } from './redFlags';

/** Estado del wizard del kiosko (serializable). */
export interface WizardState {
  personal: {
    fullName: string;
    birth: { d: string; m: string; y: string };
    gender: Gender | null;
    phone: string;
    email: string;
    noEmail: boolean;
    referralSource: string;
    referredByDoctor: string;
  };
  alarms: string[];
  alarmsAnswered: boolean;
  reasons: ReasonKey[];
  otherReason: string;
  symptoms: SymptomSelection;
  /** Esferas donde el paciente marcó explícitamente "ninguna de estas". */
  symptomsNone: SphereKey[];
  answers: QuestionnaireAnswers;
  histories: { prostate?: ProstateHistory; uti?: UtiHistory; sexual?: SexualHistory; kidney?: KidneyHistory };
  general: GeneralHistory;
  otherTopics: string;
  consent: boolean;
  startedAt: string;
}

export const initialWizardState = (): WizardState => ({
  personal: { fullName: '', birth: { d: '', m: '', y: '' }, gender: null, phone: '', email: '', noEmail: false, referralSource: '', referredByDoctor: '' },
  alarms: [],
  alarmsAnswered: false,
  reasons: [],
  otherReason: '',
  symptoms: {},
  symptomsNone: [],
  answers: {},
  histories: {},
  general: { conditions: [], otherCondition: '', surgeries: '', meds: '', allergies: '', smoking: '', alcohol: '', familyHistory: [] },
  otherTopics: '',
  consent: false,
  startedAt: new Date().toISOString(),
});

/** Estado precargado para paciente recurrente. */
export const wizardStateFromVisit = (visit: Visit): WizardState => {
  const s = initialWizardState();
  const p = visit.personal;
  const [y = '', m = '', d = ''] = (p.birthDate ?? '').split('-');
  s.personal = { fullName: p.fullName, birth: { d, m, y }, gender: p.gender, phone: p.phone, email: p.email ?? '', noEmail: !p.email, referralSource: p.referralSource ?? '', referredByDoctor: p.referredByDoctor ?? '' };
  const prevReasons = visit.intake?.reasons ?? visit.legacyIntake?.reasons ?? [];
  s.reasons = prevReasons.map((label) => REASONS.find((r) => r.label === label)?.key).filter((k): k is ReasonKey => Boolean(k));
  if (visit.intake) {
    s.general = { ...visit.intake.general };
    s.histories = { ...visit.intake.histories };
  }
  return s;
};

// ---------------- pasos ----------------

export type SectionKey = 'datos' | 'alarma' | 'motivo' | 'sintomas' | 'preguntas' | 'antecedentes' | 'cierre';

export const SECTION_LABEL: Record<SectionKey, string> = {
  datos: 'Sus datos',
  alarma: 'Síntomas de alarma',
  motivo: 'Motivo de la visita',
  sintomas: 'Síntomas',
  preguntas: 'Cuestionario',
  antecedentes: 'Antecedentes',
  cierre: 'Cierre',
};

export type StepKind =
  | { kind: 'personal'; field: 'name' | 'birth' | 'gender' | 'phone' | 'email' | 'referral' | 'confirm' }
  | { kind: 'alarm' }
  | { kind: 'reasons' }
  | { kind: 'symptoms'; sphere: SphereKey }
  | { kind: 'question'; questionnaire: QuestionnaireId; item: QuestionnaireItem; index: number; count: number }
  | { kind: 'question-group'; questionnaire: QuestionnaireId; items: QuestionnaireItem[]; index: number; count: number }
  | { kind: 'history'; history: HistoryStepKey }
  | { kind: 'general'; field: 'conditions' | 'surgeries' | 'meds' | 'allergies' | 'habits' | 'family' }
  | { kind: 'other' }
  | { kind: 'consent' }
  | { kind: 'review' };

export interface Step {
  key: string;
  section: SectionKey;
  step: StepKind;
}

export type WizardMode = 'new' | 'returning';

export const computeSteps = (state: WizardState, mode: WizardMode): Step[] => {
  const steps: Step[] = [];
  const push = (section: SectionKey, key: string, step: StepKind) => steps.push({ key, section, step });

  if (mode === 'new') {
    push('datos', 'p:name', { kind: 'personal', field: 'name' });
    push('datos', 'p:birth', { kind: 'personal', field: 'birth' });
    push('datos', 'p:gender', { kind: 'personal', field: 'gender' });
    push('datos', 'p:phone', { kind: 'personal', field: 'phone' });
    push('datos', 'p:email', { kind: 'personal', field: 'email' });
    push('datos', 'p:referral', { kind: 'personal', field: 'referral' });
  } else {
    push('datos', 'p:confirm', { kind: 'personal', field: 'confirm' });
  }

  push('alarma', 'alarm', { kind: 'alarm' });
  push('motivo', 'reasons', { kind: 'reasons' });

  const gender = state.personal.gender;
  const activeSpheres = SPHERES.filter((s) => state.reasons.includes(s.reason) && (!s.onlyFor || s.onlyFor === gender));
  for (const s of activeSpheres) push('sintomas', `sym:${s.key}`, { kind: 'symptoms', sphere: s.key });

  const selection: SymptomSelection = {};
  for (const s of activeSpheres) selection[s.key] = state.symptoms[s.key] ?? [];
  const questionnaires = triggeredQuestionnaires(selection);
  for (const qid of questionnaires) {
    const q = QUESTIONNAIRES[qid];
    if (qid === 'adam') {
      const half = Math.ceil(q.items.length / 2);
      push('preguntas', `q:${qid}:a`, { kind: 'question-group', questionnaire: qid, items: q.items.slice(0, half), index: 0, count: 2 });
      push('preguntas', `q:${qid}:b`, { kind: 'question-group', questionnaire: qid, items: q.items.slice(half), index: 1, count: 2 });
      continue;
    }
    if (qid === 'iciq_oab') {
      // Cada pregunta con su escala de molestia en la misma pantalla.
      const pairs: QuestionnaireItem[][] = [];
      for (let i = 0; i < q.items.length; i += 2) pairs.push(q.items.slice(i, i + 2));
      pairs.forEach((items, i) => push('preguntas', `q:${qid}:${i}`, { kind: 'question-group', questionnaire: qid, items, index: i, count: pairs.length }));
      continue;
    }
    q.items.forEach((item, i) => push('preguntas', `q:${qid}:${item.id}`, { kind: 'question', questionnaire: qid, item, index: i, count: q.items.length }));
  }

  const histories = enabledHistorySteps(selection, activeSpheres.map((s) => s.key));
  for (const h of histories) push('antecedentes', `h:${h}`, { kind: 'history', history: h });

  push('antecedentes', 'g:conditions', { kind: 'general', field: 'conditions' });
  push('antecedentes', 'g:surgeries', { kind: 'general', field: 'surgeries' });
  push('antecedentes', 'g:meds', { kind: 'general', field: 'meds' });
  push('antecedentes', 'g:allergies', { kind: 'general', field: 'allergies' });
  push('antecedentes', 'g:habits', { kind: 'general', field: 'habits' });
  push('antecedentes', 'g:family', { kind: 'general', field: 'family' });

  push('cierre', 'other', { kind: 'other' });
  push('cierre', 'consent', { kind: 'consent' });
  push('cierre', 'review', { kind: 'review' });
  return steps;
};

export const sectionsOf = (steps: Step[]): SectionKey[] => Array.from(new Set(steps.map((s) => s.section)));

// ---------------- validación ----------------

const birthDateOf = (p: WizardState['personal']): string | null => {
  const { d, m, y } = p.birth;
  if (!d || !m || !y) return null;
  const iso = `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const age = ageFromBirthDate(iso);
  return age === null ? null : iso;
};

export const wizardBirthDate = birthDateOf;
export const wizardAge = (p: WizardState['personal']): number | null => {
  const iso = birthDateOf(p);
  return iso ? ageFromBirthDate(iso) : null;
};

const answered = (item: QuestionnaireItem, answers: Answers | undefined): boolean => {
  const v = answers?.[item.id];
  if (v === null || v === undefined) return false;
  if (item.kind === 'multi') return Array.isArray(v);
  if (item.kind === 'yesno') return typeof v === 'boolean';
  return typeof v === 'number';
};

/** Devuelve null si el paso está completo; si no, el mensaje para el botón deshabilitado. */
export const stepBlocker = (state: WizardState, step: Step): string | null => {
  const s = step.step;
  switch (s.kind) {
    case 'personal': {
      const p = state.personal;
      if (s.field === 'name') return p.fullName.trim().split(/\s+/).length >= 2 ? null : 'Escriba su nombre y apellidos.';
      if (s.field === 'birth') return birthDateOf(p) ? null : 'Complete día, mes y año.';
      if (s.field === 'gender') return p.gender ? null : 'Elija una opción.';
      if (s.field === 'phone') return p.phone.replace(/\D/g, '').length >= 10 ? null : 'Escriba los 10 dígitos de su teléfono.';
      if (s.field === 'email') return p.noEmail || /.+@.+\..+/.test(p.email.trim()) ? null : 'Escriba su correo o marque "No tengo correo".';
      if (s.field === 'referral') return p.referralSource ? null : 'Elija una opción.';
      if (s.field === 'confirm') return p.phone.replace(/D/g, '').length >= 10 ? null : 'Escriba los 10 dígitos de su teléfono.';
      return null;
    }
    case 'alarm':
      return state.alarmsAnswered ? null : 'Elija al menos una opción.';
    case 'reasons':
      if (!state.reasons.length) return 'Elija al menos un motivo.';
      if (state.reasons.includes('other') && !state.otherReason.trim()) return 'Describa el otro motivo.';
      return null;
    case 'symptoms': {
      const chosen = state.symptoms[s.sphere] ?? [];
      return chosen.length || state.symptomsNone.includes(s.sphere) ? null : 'Marque sus molestias o "Ninguna de estas".';
    }
    case 'question':
      return s.item.optional || answered(s.item, state.answers[s.questionnaire]) ? null : 'Elija una opción para continuar.';
    case 'question-group': {
      const missing = s.items.filter((it) => !it.optional && it.scored !== false && !answered(it, state.answers[s.questionnaire]));
      return missing.length ? `Faltan ${missing.length} respuesta${missing.length > 1 ? 's' : ''}.` : null;
    }
    case 'history':
      return null;
    case 'general':
      if (s.field === 'conditions') return state.general.conditions.length ? null : 'Marque una opción o "Ninguna".';
      if (s.field === 'habits') return state.general.smoking && state.general.alcohol ? null : 'Conteste las dos preguntas.';
      if (s.field === 'family') return state.general.familyHistory.length ? null : 'Marque una opción o "Ninguna / No sé".';
      return null;
    case 'other':
      return null;
    case 'consent':
      return state.consent ? null : 'Acepte el aviso de privacidad para continuar.';
    case 'review':
      return null;
  }
};

/** Progreso por sección (ítems completos / ítems). */
export const sectionProgress = (state: WizardState, steps: Step[], section: SectionKey): number => {
  const mine = steps.filter((s) => s.section === section);
  if (!mine.length) return 0;
  const done = mine.filter((s) => stepBlocker(state, s) === null).length;
  return done / mine.length;
};

// ---------------- construcción del intake ----------------

export const buildPersonal = (state: WizardState, base?: PersonalData): PersonalData => {
  const p = state.personal;
  const birthDate = birthDateOf(p) ?? base?.birthDate;
  const age = (birthDate ? ageFromBirthDate(birthDate) : null) ?? base?.age ?? 0;
  return {
    fullName: p.fullName.trim().replace(/\s+/g, ' '),
    birthDate: birthDate ?? undefined,
    age,
    gender: p.gender ?? base?.gender ?? 'Masculino',
    phone: p.phone.trim(),
    email: p.noEmail ? undefined : p.email.trim() || undefined,
    isFirstTime: base ? false : true,
    referralSource: p.referralSource || base?.referralSource,
    referredByDoctor: p.referralSource === 'Otro médico' ? p.referredByDoctor.trim() || undefined : undefined,
  };
};

export const buildIntake = (state: WizardState, source: VisitSource): Intake => {
  const gender = state.personal.gender;
  const activeSpheres = SPHERES.filter((s) => state.reasons.includes(s.reason) && (!s.onlyFor || s.onlyFor === gender));
  const selection: SymptomSelection = {};
  const labels: Partial<Record<SphereKey, string[]>> = {};
  for (const s of activeSpheres) {
    const chosen = state.symptoms[s.key] ?? [];
    selection[s.key] = chosen;
    if (chosen.length) labels[s.key] = symptomLabels(s.key, chosen);
  }
  const applied = triggeredQuestionnaires(selection);
  const answers: QuestionnaireAnswers = {};
  for (const id of applied) answers[id] = state.answers[id] ?? {};
  const scores = scoreAll(applied, answers);
  const histories = enabledHistorySteps(selection, activeSpheres.map((s) => s.key));
  const alarmKeys = state.alarms.filter((k) => ALARM_SYMPTOMS.some((a) => a.key === k));

  return {
    version: 2,
    source,
    reasons: state.reasons.map((k) => REASONS.find((r) => r.key === k)!.label),
    otherReason: state.reasons.includes('other') ? state.otherReason.trim() || undefined : undefined,
    alarms: alarmKeys,
    symptoms: selection,
    symptomLabels: labels,
    questionnaireAnswers: answers,
    questionnaireScores: scores,
    redFlags: extractRedFlags(alarmKeys, selection),
    general: { ...state.general, familyHistory: state.general.familyHistory.filter(Boolean) },
    histories: {
      prostate: histories.includes('prostate_history') ? state.histories.prostate : undefined,
      uti: histories.includes('uti_history') ? state.histories.uti : undefined,
      sexual: histories.includes('sexual_history') ? state.histories.sexual : undefined,
      kidney: histories.includes('kidney_history') ? state.histories.kidney : undefined,
    },
    otherTopics: state.otherTopics.trim() || undefined,
    consentAcceptedAt: state.consent ? new Date().toISOString() : undefined,
    startedAt: state.startedAt,
    completedAt: new Date().toISOString(),
  };
};

export const DEFAULT_HISTORIES = {
  prostate: (): ProstateHistory => ({ familyCancer: 'No', familyGrowth: 'No', psa: 'Nunca', priorExam: false }),
  uti: (): UtiHistory => ({ last6: '0', last12: '0', worseAfterSex: 'No aplica', stonesOrCatheters: false }),
  sexual: (): SexualHistory => ({ diabetesHtnChol: false, smoking: 'No' }),
  kidney: (): KidneyHistory => ({ familyStones: 'No', water: '1 a 2 litros', gout: false }),
};
