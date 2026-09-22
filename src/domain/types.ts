import type { SphereKey, SymptomSelection } from './intake/catalog';
import type { QuestionnaireAnswers, QuestionnaireScores } from './questionnaires';

/**
 * Modelo de dominio. Una fila de `patient_forms` representa UNA VISITA
 * (registro + interrogatorio + consulta). La identidad del paciente entre
 * visitas se resuelve por teléfono normalizado (ver `patientKey`).
 */

export type Gender = 'Masculino' | 'Femenino';

/**
 * Ciclo de vida de la visita. Se persiste tal cual en `patient_forms.status`.
 *
 * arrived          -> el paciente está en el consultorio; tablet en curso o por entregar
 * waiting          -> interrogatorio completo (o saltado por recepción); en sala de espera
 * in_consultation  -> el doctor abrió la consulta
 * completed        -> consulta guardada
 * cancelled        -> se retiró / error de captura / abandonado
 */
export type VisitStatus = 'arrived' | 'waiting' | 'in_consultation' | 'completed' | 'cancelled';

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  arrived: 'Llenando cuestionario',
  waiting: 'En sala de espera',
  in_consultation: 'En consulta',
  completed: 'Atendido',
  cancelled: 'Cancelado',
};

export const OPEN_VISIT_STATUSES: VisitStatus[] = ['arrived', 'waiting', 'in_consultation'];

export type AiStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'skipped';

export type VisitSource = 'kiosk' | 'checkin' | 'reception' | 'doctor' | 'web' | 'legacy';
export type VisitKind = 'first' | 'followup';
export type IntakeMode = 'tablet' | 'skipped' | 'staff';
export type CancelReason = 'se_retiro' | 'error_captura' | 'abandonado' | 'otro';

export interface PersonalData {
  fullName: string;
  birthDate?: string;
  age: number;
  gender: Gender;
  phone: string;
  email?: string;
  isFirstTime?: boolean;
  referralSource?: string;
  referredByDoctor?: string;
}

export interface GeneralHistory {
  conditions: string[];
  otherCondition?: string;
  surgeries?: string;
  meds?: string;
  allergies?: string;
  smoking: string;
  alcohol: string;
  familyHistory: string[];
}

export interface ProstateHistory {
  familyCancer: string;
  familyCancerDetails?: string;
  familyGrowth: string;
  psa: string;
  psaResult?: string;
  priorExam: boolean;
}

export interface UtiHistory {
  last6: string;
  last12: string;
  worseAfterSex: string;
  menopause?: boolean;
  stonesOrCatheters: boolean;
}

export interface SexualHistory {
  diabetesHtnChol: boolean;
  smoking: string;
  meds?: string;
  surgeries?: string;
}

export interface KidneyHistory {
  stonesCount?: string;
  procedures?: string;
  familyStones: string;
  water: string;
  gout: boolean;
}

export interface Intake {
  version: 2;
  source: VisitSource;
  reasons: string[];
  otherReason?: string;
  /** Claves de ALARM_SYMPTOMS marcadas en la pantalla de alarma. */
  alarms: string[];
  symptoms: SymptomSelection;
  /** Etiquetas legibles de los síntomas marcados (para IA, PDF e historial). */
  symptomLabels: Partial<Record<SphereKey, string[]>>;
  questionnaireAnswers: QuestionnaireAnswers;
  questionnaireScores: QuestionnaireScores;
  redFlags: string[];
  general: GeneralHistory;
  histories: {
    prostate?: ProstateHistory;
    uti?: UtiHistory;
    sexual?: SexualHistory;
    kidney?: KidneyHistory;
  };
  otherTopics?: string;
  consentAcceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
}

/** Interrogatorio de filas anteriores a la versión 2 (solo lectura). */
export interface LegacyIntake {
  version: 1;
  reasons: string[];
  symptomLabels: Partial<Record<SphereKey, string[]>>;
  questionnaireScores: QuestionnaireScores;
  redFlags: string[];
  otherTopics?: string;
  raw?: Record<string, unknown>;
}

export interface AiState {
  status: AiStatus;
  summary?: string;
  error?: string;
  requestedAt?: string;
  startedAt?: string;
  generatedAt?: string;
  model?: string;
  attempts?: number;
  generatedBy?: 'proxy' | 'client';
}

export type ActorRole = 'patient' | 'reception' | 'doctor' | 'admin' | 'system';

export interface VisitEvent {
  type: string;
  at: string;
  by: { role: ActorRole; username?: string };
  meta?: Record<string, unknown>;
}

/** Borrador del wizard del kiosko, para reanudar si la tablet se cierra. */
export interface WizardDraft {
  stepKey?: string;
  stepIndex?: number;
  stepCount?: number;
  answered?: number;
  lastSavedAt?: string;
  /** Estado serializado del wizard (opaco para el dominio). */
  state?: unknown;
}

export interface VisitMeta {
  kind?: VisitKind;
  source?: VisitSource;
  intakeMode?: IntakeMode;
  prevVisitId?: string;
  appointmentId?: string;
  kioskCode?: string;
  doctorUsername?: string;
  registeredBy?: string;
  checkedInAt?: string;
  handoffAt?: string;
  calledAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: CancelReason;
  cancelNote?: string;
  phoneCollision?: boolean;
  events?: VisitEvent[];
  wizard?: WizardDraft;
  /** Contador de escrituras (concurrencia optimista): cada patch exige el rev leído y lo incrementa. */
  rev?: number;
}

export interface AttachedFile {
  name: string;
  url: string;
  type: string;
  size?: number;
  uploadedAt?: string;
  uploadedBy?: string;
  path?: string;
}

export interface Vitals {
  ta?: string;
  fc?: string;
  fr?: string;
  temp?: string;
  peso?: string;
  talla?: string;
}

export interface MedicalNotes {
  vitalSigns: string;
  vitals?: Vitals;
  currentIllness: string;
  interrogation: string;
  physicalExam: string;
  diagnosis: string;
  prescription: string;
  recommendations: string;
  nextAppointment?: string;
  nextAppointmentId?: string;
  startedAt?: string;
  savedAt?: string;
  doctorUsername?: string;
  doctorName?: string;
  /** Borrador sin firmar (autosave). */
  draft?: Partial<MedicalNotes> & { savedAt?: string };
  /** Compatibilidad: los archivos viven dentro de medical_notes en la fila. */
  attachedFiles?: AttachedFile[];
  research?: Array<{ query: string; answer: string; sources: string[]; at: string }>;
}

export interface Visit {
  id: string;
  createdAt: string;
  status: VisitStatus;
  personal: PersonalData;
  preferredDoctor?: string;
  intake?: Intake;
  legacyIntake?: LegacyIntake;
  ai: AiState;
  meta: VisitMeta;
  notes?: MedicalNotes;
  files: AttachedFile[];
}

/** Paciente = grupo de visitas con el mismo teléfono normalizado. */
export interface Patient {
  key: string;
  personal: PersonalData;
  visits: Visit[];
  latestVisit: Visit;
  firstVisitAt: string;
  lastVisitAt: string;
}

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Programada',
  confirmed: 'Confirmada',
  checked_in: 'En consultorio',
  completed: 'Atendida',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
};

export const OPEN_APPOINTMENT_STATUSES: AppointmentStatus[] = ['scheduled', 'confirmed', 'checked_in'];

export type AppointmentSource = 'web' | 'phone' | 'reception' | 'doctor' | 'followup';

export interface Appointment {
  id: string;
  createdAt: string;
  status: AppointmentStatus;
  /** id de la visita (patient_forms) creada en el check-in. */
  visitId?: string;
  patientKey: string;
  patientName: string;
  patientPhone: string;
  /** Datos capturados al agendar a un paciente nuevo (sin visita todavía). */
  patient?: { age?: number; gender?: Gender; email?: string; birthDate?: string };
  doctorUsername: string;
  doctorName: string;
  startsAt: string;
  durationMinutes: number;
  kind: VisitKind;
  reason?: string;
  reasons: string[];
  notes?: string;
  source: AppointmentSource;
  createdBy?: string;
  prevVisitId?: string;
  confirmedAt?: string;
  checkedInAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  noShowAt?: string;
  history?: Array<{ from: string; to: string; by?: string; at: string }>;
  /** Contador de escrituras (concurrencia optimista). */
  rev?: number;
  /** Síntomas de la cita web antigua (solo lectura). */
  legacySymptoms?: Record<string, unknown>;
  legacyAiSummary?: string;
}

export interface Doctor {
  id: string;
  fullName: string;
  username: string;
}

/** Teléfono normalizado: solo dígitos, últimos 10 (México). */
export const patientKey = (phone: string): string => {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export const ageFromBirthDate = (birthDate: string, today = new Date()): number | null => {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
};

export const initials = (fullName: string): string =>
  fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

export const displayName = (fullName: string): string => fullName.trim().replace(/\s+/g, ' ');
