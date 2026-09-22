import type { SphereKey } from '../domain/intake/catalog';
import type { QuestionnaireId, QuestionnaireScores, ScoreResult } from '../domain/questionnaires';
import type {
  AiState,
  Appointment,
  AppointmentStatus,
  AttachedFile,
  Gender,
  Intake,
  LegacyIntake,
  MedicalNotes,
  PersonalData,
  Visit,
  VisitMeta,
  VisitStatus,
} from '../domain/types';
import { patientKey } from '../domain/types';

/**
 * Traducción fila <-> dominio. La columna `symptoms` (jsonb) guarda el sobre
 * versionado; las columnas planas se mantienen para compatibilidad con filas
 * antiguas y con cualquier consulta directa en Supabase.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

/**
 * Postgres devuelve timestamptz como "2026-09-23T19:00:00+00:00" y el código
 * genera "2026-09-23T19:00:00.000Z". Son el mismo instante, pero las
 * comparaciones de texto (filtros por día, orden) exigen un solo formato.
 */
export const isoUtc = (value: unknown): string => {
  if (typeof value !== 'string' || !value) return String(value ?? '');
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? value : new Date(t).toISOString();
};

const VISIT_STATUSES: VisitStatus[] = ['arrived', 'waiting', 'in_consultation', 'completed', 'cancelled'];
const APPT_STATUSES: AppointmentStatus[] = ['scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'];

const asGender = (g: unknown): Gender => (g === 'Femenino' ? 'Femenino' : 'Masculino');

const interpretationToSeverity = (text: string): ScoreResult['severity'] => {
  const t = (text || '').toLowerCase();
  if (t.includes('muy sever')) return 'very_severe';
  if (t.includes('sever')) return 'severe';
  if (t.includes('moder')) return 'moderate';
  if (t.includes('leve')) return 'mild';
  if (t.includes('positiv') || t.includes('probable') || t.includes('sugiere')) return 'positive';
  if (t.includes('sin ') || t.includes('normal') || t.includes('negativ') || t.includes('poco probable')) return 'none';
  return 'info';
};

/** Convierte los puntajes v1 ({ipss:{score,...}}) al formato ScoreResult. */
export const fromLegacyScores = (legacy: Row | undefined | null): QuestionnaireScores => {
  const out: QuestionnaireScores = {};
  if (!legacy || typeof legacy !== 'object') return out;
  const base = (id: QuestionnaireId, acronym: string, total: number, max: number, min: number, interpretation: string, extra?: Partial<ScoreResult>): ScoreResult => ({
    id,
    acronym,
    total,
    max,
    min,
    interpretation,
    severity: interpretationToSeverity(interpretation),
    complete: true,
    answeredCount: 0,
    itemCount: 0,
    ...extra,
  });
  if (legacy.ipss) out.ipss = base('ipss', 'IPSS', legacy.ipss.score ?? 0, 35, 0, legacy.ipss.interpretation ?? '', { extra: { qolScore: legacy.ipss.qolScore ?? 0 } });
  if (legacy.nih_cpsi)
    out.nih_cpsi = base('nih_cpsi', 'NIH-CPSI', legacy.nih_cpsi.totalScore ?? 0, 43, 0, legacy.nih_cpsi.interpretation ?? '', {
      subscales: [
        { key: 'pain', label: 'Dolor', value: legacy.nih_cpsi.painScore ?? 0, max: 21 },
        { key: 'urinary', label: 'Síntomas urinarios', value: legacy.nih_cpsi.urinaryScore ?? 0, max: 10 },
        { key: 'qol', label: 'Calidad de vida', value: legacy.nih_cpsi.qolScore ?? 0, max: 12 },
      ],
    });
  if (legacy.iciq_ui_sf) out.iciq_ui_sf = base('iciq_ui_sf', 'ICIQ-UI SF', legacy.iciq_ui_sf.score ?? 0, 21, 0, legacy.iciq_ui_sf.interpretation ?? '');
  if (legacy.iciq_oab) out.iciq_oab = base('iciq_oab', 'ICIQ-OAB', legacy.iciq_oab.score ?? 0, 16, 0, `Puntaje ${legacy.iciq_oab.score ?? 0}/16`, { severity: 'info' });
  if (legacy.oleary_sant)
    out.oleary_sant = base('oleary_sant', "O'Leary-Sant", (legacy.oleary_sant.icsiScore ?? 0) + (legacy.oleary_sant.icpiScore ?? 0), 36, 0, `ICSI ${legacy.oleary_sant.icsiScore ?? 0}/20 e ICPI ${legacy.oleary_sant.icpiScore ?? 0}/16`, {
      severity: 'info',
      subscales: [
        { key: 'icsi', label: 'Índice de síntomas (ICSI)', value: legacy.oleary_sant.icsiScore ?? 0, max: 20 },
        { key: 'icpi', label: 'Índice de problemas (ICPI)', value: legacy.oleary_sant.icpiScore ?? 0, max: 16 },
      ],
    });
  if (legacy.iief_5) out.iief_5 = base('iief_5', 'IIEF-5', legacy.iief_5.score ?? 0, 25, 1, legacy.iief_5.interpretation ?? '');
  if (legacy.pedt) out.pedt = base('pedt', 'PEDT', legacy.pedt.score ?? 0, 20, 0, legacy.pedt.interpretation ?? '');
  if (legacy.adam) out.adam = base('adam', 'ADAM', 0, 10, 0, legacy.adam.isPositive ? 'Cribado positivo' : 'Cribado negativo', { positive: Boolean(legacy.adam.isPositive), severity: legacy.adam.isPositive ? 'positive' : 'negative' });
  if (legacy.fsfi_6) out.fsfi_6 = base('fsfi_6', 'FSFI-6', legacy.fsfi_6.score ?? 0, 30, 2, legacy.fsfi_6.interpretation ?? '');
  return out;
};

/** Formato v1 de puntajes, para que filas nuevas sigan siendo legibles por código antiguo. */
export const toLegacyScores = (scores: QuestionnaireScores): Row => {
  const out: Row = {};
  if (scores.ipss) out.ipss = { score: scores.ipss.total, interpretation: scores.ipss.interpretation, qolScore: scores.ipss.extra?.qolScore ?? 0 };
  if (scores.nih_cpsi) {
    const sub = Object.fromEntries((scores.nih_cpsi.subscales ?? []).map((s) => [s.key, s.value]));
    out.nih_cpsi = { painScore: sub.pain ?? 0, urinaryScore: sub.urinary ?? 0, qolScore: sub.qol ?? 0, totalScore: scores.nih_cpsi.total, interpretation: scores.nih_cpsi.interpretation };
  }
  if (scores.iciq_ui_sf) out.iciq_ui_sf = { score: scores.iciq_ui_sf.total, interpretation: scores.iciq_ui_sf.interpretation };
  if (scores.iciq_oab) out.iciq_oab = { score: scores.iciq_oab.total };
  if (scores.oleary_sant) {
    const sub = Object.fromEntries((scores.oleary_sant.subscales ?? []).map((s) => [s.key, s.value]));
    out.oleary_sant = { icsiScore: sub.icsi ?? 0, icpiScore: sub.icpi ?? 0 };
  }
  if (scores.iief_5) out.iief_5 = { score: scores.iief_5.total, interpretation: scores.iief_5.interpretation };
  if (scores.pedt) out.pedt = { score: scores.pedt.total, interpretation: scores.pedt.interpretation };
  if (scores.adam) out.adam = { isPositive: Boolean(scores.adam.positive) };
  if (scores.fsfi_6) out.fsfi_6 = { score: scores.fsfi_6.total, interpretation: scores.fsfi_6.interpretation };
  return out;
};

const legacySymptomLabels = (raw: Row | undefined): Partial<Record<SphereKey, string[]>> => {
  if (!raw) return {};
  const pick = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as string[]) : []);
  const out: Partial<Record<SphereKey, string[]>> = {};
  const map: [SphereKey, string][] = [
    ['prostate', 'prostateSymptoms'],
    ['bladder', 'bladderSymptoms'],
    ['sexualMale', 'sexualSymptomsMale'],
    ['sexualFemale', 'sexualSymptomsFemale'],
    ['kidney', 'kidneySymptoms'],
  ];
  for (const [sphere, key] of map) {
    const v = pick(key);
    if (v.length) out[sphere] = v;
  }
  return out;
};

export const rowToVisit = (row: Row): Visit => {
  const env: Row = row.symptoms && typeof row.symptoms === 'object' ? row.symptoms : {};
  const isV2 = env.version === 2;
  const extraPersonal: Row = isV2 && env.personal ? env.personal : {};
  // rawSymptoms existe en filas v1 y se conserva como espejo en filas v1 convertidas a v2.
  const rawLegacy: Row | undefined = env.rawSymptoms && typeof env.rawSymptoms === 'object' ? env.rawSymptoms : undefined;

  const personal: PersonalData = {
    fullName: row.full_name ?? '',
    age: Number(row.age) || 0,
    gender: asGender(row.gender),
    phone: row.phone ?? '',
    email: row.email || undefined,
    birthDate: extraPersonal.birthDate ?? rawLegacy?.birthDate ?? undefined,
    isFirstTime: extraPersonal.isFirstTime ?? rawLegacy?.isFirstTime ?? undefined,
    referralSource: extraPersonal.referralSource ?? rawLegacy?.referralSource ?? undefined,
    referredByDoctor: extraPersonal.referredByDoctor ?? rawLegacy?.referredByDoctor ?? undefined,
  };

  const status: VisitStatus = VISIT_STATUSES.includes(row.status) ? row.status : 'waiting';

  const notesRow: Row | undefined = row.medical_notes && typeof row.medical_notes === 'object' ? row.medical_notes : undefined;
  const files: AttachedFile[] = Array.isArray(notesRow?.attachedFiles) ? notesRow!.attachedFiles : [];
  const hasNotes = Boolean(notesRow && Object.entries(notesRow).some(([k, v]) => k !== 'attachedFiles' && v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)));
  const notes: MedicalNotes | undefined = hasNotes
    ? {
        vitalSigns: notesRow!.vitalSigns ?? '',
        vitals: notesRow!.vitals ?? undefined,
        currentIllness: notesRow!.currentIllness ?? '',
        interrogation: notesRow!.interrogation ?? '',
        physicalExam: notesRow!.physicalExam ?? '',
        diagnosis: notesRow!.diagnosis ?? '',
        prescription: notesRow!.prescription ?? '',
        recommendations: notesRow!.recommendations ?? '',
        nextAppointment: notesRow!.nextAppointment || undefined,
        nextAppointmentId: notesRow!.nextAppointmentId || undefined,
        startedAt: notesRow!.startedAt,
        savedAt: notesRow!.savedAt,
        doctorUsername: notesRow!.doctorUsername,
        doctorName: notesRow!.doctorName,
        draft: notesRow!.draft ?? undefined,
        research: Array.isArray(notesRow!.research) ? notesRow!.research : undefined,
      }
    : undefined;

  let intake: Intake | undefined;
  let legacyIntake: LegacyIntake | undefined;
  let ai: AiState;
  let meta: VisitMeta;

  /** Interrogatorio v1 reconstruido desde el sobre (fila v1 o fila v1 ya reescrita como v2). */
  const buildLegacy = (): LegacyIntake | undefined => {
    if (env.legacy && typeof env.legacy === 'object' && env.legacy.version === 1) return env.legacy as LegacyIntake;
    const reasons: string[] = Array.isArray(env.consultationReasons) ? env.consultationReasons : !isV2 && Array.isArray(row.classification) ? row.classification : [];
    const scores: Row | undefined = env.questionnaireScores && typeof env.questionnaireScores === 'object' ? env.questionnaireScores : undefined;
    const hasIntake = Boolean(rawLegacy || reasons.length || (scores && Object.keys(scores).length));
    if (!hasIntake) return undefined;
    return {
      version: 1,
      reasons,
      symptomLabels: legacySymptomLabels(rawLegacy),
      questionnaireScores: fromLegacyScores(scores),
      redFlags: Array.isArray(env.redFlags) ? env.redFlags : [],
      otherTopics: env.otherTopicsToDiscuss || undefined,
      raw: rawLegacy,
    };
  };

  if (isV2) {
    intake = env.intake ?? undefined;
    // Una fila v1 que ya fue reescrita por la app nueva no tiene intake v2, pero sí su espejo v1: no se pierde.
    if (!intake) legacyIntake = buildLegacy();
    ai = env.ai ?? { status: intake || legacyIntake ? 'pending' : 'skipped' };
    meta = env.visit ?? {};
  } else {
    const summary: string | undefined = env.aiSummary || undefined;
    legacyIntake = buildLegacy();
    const hasIntake = Boolean(legacyIntake);
    const failed = summary ? /^No se (pudo|configuró)/i.test(summary) : false;
    ai = summary && !failed ? { status: 'ready', summary, generatedBy: 'client' } : failed ? { status: 'failed', error: summary } : { status: hasIntake ? 'pending' : 'skipped' };
    meta = { kind: 'first', source: 'legacy', intakeMode: hasIntake ? 'tablet' : 'skipped' };
  }

  return {
    id: row.id,
    createdAt: isoUtc(row.created_at),
    status,
    personal,
    preferredDoctor: row.preferred_doctor ?? undefined,
    intake,
    legacyIntake,
    ai,
    meta,
    notes,
    files,
  };
};

/** Sobre jsonb para `symptoms` (v2 + llaves v1 por compatibilidad). */
export const buildSymptomsEnvelope = (visit: Pick<Visit, 'personal' | 'intake' | 'ai' | 'meta' | 'legacyIntake'>): Row => {
  const { personal, intake, ai, meta } = visit;
  const legacyScores = intake ? toLegacyScores(intake.questionnaireScores) : visit.legacyIntake ? toLegacyScores(visit.legacyIntake.questionnaireScores) : {};
  return {
    version: 2,
    personal: {
      birthDate: personal.birthDate ?? null,
      isFirstTime: personal.isFirstTime ?? null,
      referralSource: personal.referralSource ?? null,
      referredByDoctor: personal.referredByDoctor ?? null,
    },
    intake: intake ?? null,
    /** Interrogatorio v1 completo (filas antiguas), para no depender solo del espejo. */
    legacy: visit.legacyIntake ?? null,
    ai,
    visit: meta,
    // ---- compatibilidad v1 ----
    rawSymptoms: visit.legacyIntake?.raw ?? null,
    consultationReasons: intake?.reasons ?? visit.legacyIntake?.reasons ?? [],
    questionnaireScores: legacyScores,
    redFlags: intake?.redFlags ?? visit.legacyIntake?.redFlags ?? [],
    otherTopicsToDiscuss: intake?.otherTopics ?? visit.legacyIntake?.otherTopics ?? '',
    aiSummary: ai.status === 'ready' ? (ai.summary ?? '') : '',
  };
};

/** medical_history plano (v1) + estructuras v2. */
export const buildMedicalHistory = (intake: Intake | undefined): Row | null => {
  if (!intake) return null;
  const g = intake.general;
  const h = intake.histories;
  return {
    diabetes: g.conditions.includes('Diabetes'),
    hypertension: g.conditions.includes('Presión alta'),
    highCholesterol: g.conditions.includes('Colesterol alto'),
    heartDisease: g.conditions.includes('Problemas del corazón'),
    otherCondition: g.otherCondition ?? '',
    priorSurgeries: g.surgeries ?? '',
    currentMeds: g.meds ?? '',
    allergies: g.allergies ?? '',
    smoking: g.smoking,
    alcohol: g.alcohol,
    familyHistory: g.familyHistory,
    familyProstateCancer: h.prostate?.familyCancer,
    familyProstateCancerDetails: h.prostate?.familyCancerDetails,
    familyProstateGrowth: h.prostate?.familyGrowth,
    psaTest: h.prostate?.psa,
    psaResult: h.prostate?.psaResult,
    priorProstateUltrasound: h.prostate?.priorExam,
    utiLast6Months: h.uti?.last6,
    utiLast12Months: h.uti?.last12,
    worseAfterSex: h.uti?.worseAfterSex,
    menopause: h.uti?.menopause,
    priorStonesOrCatheters: h.uti?.stonesOrCatheters,
    sexualDiabetesHtnChol: h.sexual?.diabetesHtnChol,
    sexualSmoking: h.sexual?.smoking,
    sexualMeds: h.sexual?.meds,
    sexualSurgeries: h.sexual?.surgeries,
    stoneEpisodes: h.kidney?.stonesCount,
    stoneProcedures: h.kidney?.procedures,
    familyStones: h.kidney?.familyStones,
    waterIntake: h.kidney?.water,
    goutOrUricAcid: h.kidney?.gout,
    v2: { general: g, histories: h },
  };
};

export const notesToRow = (notes: MedicalNotes | undefined, files: AttachedFile[]): Row | null => {
  if (!notes && !files.length) return null;
  return { ...(notes ?? {}), attachedFiles: files };
};

export const visitToRow = (visit: Visit): Row => ({
  id: visit.id,
  created_at: visit.createdAt,
  full_name: visit.personal.fullName.trim(),
  age: visit.personal.age,
  gender: visit.personal.gender,
  phone: visit.personal.phone.trim(),
  email: visit.personal.email?.trim() || null,
  preferred_doctor: visit.preferredDoctor ?? null,
  status: visit.status,
  classification: visit.intake?.reasons ?? visit.legacyIntake?.reasons ?? [],
  symptoms: buildSymptomsEnvelope(visit),
  medical_history: buildMedicalHistory(visit.intake),
  medical_notes: notesToRow(visit.notes, visit.files),
});

// ---------------- Citas ----------------

export const rowToAppointment = (row: Row): Appointment => {
  const env: Row = row.symptoms && typeof row.symptoms === 'object' ? row.symptoms : {};
  const isV2 = env.version === 2;
  const status: AppointmentStatus = APPT_STATUSES.includes(row.status) ? row.status : 'scheduled';
  return {
    id: row.id,
    createdAt: isoUtc(row.created_at),
    status,
    visitId: isV2 ? env.visitId ?? undefined : row.patient_id ?? undefined,
    patientKey: patientKey(row.patient_phone ?? ''),
    patientName: row.patient_name ?? '',
    patientPhone: row.patient_phone ?? '',
    patient: isV2 ? env.patient ?? undefined : undefined,
    doctorUsername: row.doctor_username ?? '',
    doctorName: row.doctor_name ?? '',
    startsAt: isoUtc(row.appointment_date),
    durationMinutes: isV2 ? Number(env.durationMinutes) || 30 : 30,
    kind: isV2 && env.kind === 'followup' ? 'followup' : 'first',
    reason: isV2 ? env.reason ?? undefined : env.otherSymptoms || undefined,
    reasons: Array.isArray(row.classification) ? row.classification : [],
    notes: isV2 ? env.notes ?? undefined : undefined,
    source: isV2 ? env.source ?? 'reception' : 'web',
    createdBy: isV2 ? env.createdBy ?? undefined : undefined,
    prevVisitId: isV2 ? env.prevVisitId ?? undefined : undefined,
    confirmedAt: isV2 ? env.confirmedAt ?? undefined : undefined,
    checkedInAt: isV2 ? env.checkedInAt ?? undefined : undefined,
    cancelledAt: isV2 ? env.cancelledAt ?? undefined : undefined,
    cancelReason: isV2 ? env.cancelReason ?? undefined : undefined,
    noShowAt: isV2 ? env.noShowAt ?? undefined : undefined,
    history: isV2 && Array.isArray(env.history) ? env.history : undefined,
    rev: isV2 && typeof env.rev === 'number' ? env.rev : undefined,
    legacySymptoms: !isV2 ? env : undefined,
    legacyAiSummary: !isV2 ? env.aiSummary ?? undefined : undefined,
  };
};

export const appointmentToRow = (a: Appointment): Row => ({
  id: a.id,
  created_at: a.createdAt,
  patient_id: a.visitId ?? null,
  patient_name: a.patientName.trim(),
  patient_phone: a.patientPhone.trim(),
  doctor_username: a.doctorUsername,
  doctor_name: a.doctorName,
  appointment_date: a.startsAt,
  status: a.status,
  classification: a.reasons,
  symptoms: {
    version: 2,
    visitId: a.visitId ?? null,
    patient: a.patient ?? null,
    durationMinutes: a.durationMinutes,
    kind: a.kind,
    reason: a.reason ?? null,
    notes: a.notes ?? null,
    source: a.source,
    createdBy: a.createdBy ?? null,
    prevVisitId: a.prevVisitId ?? null,
    confirmedAt: a.confirmedAt ?? null,
    checkedInAt: a.checkedInAt ?? null,
    cancelledAt: a.cancelledAt ?? null,
    cancelReason: a.cancelReason ?? null,
    noShowAt: a.noShowAt ?? null,
    history: a.history ?? [],
    rev: a.rev ?? 0,
  },
});
