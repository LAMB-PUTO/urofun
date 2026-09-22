import { canTransition, TransitionRejected } from '../domain/status';
import type {
  ActorRole,
  AiState,
  AttachedFile,
  CancelReason,
  Intake,
  MedicalNotes,
  Patient,
  PersonalData,
  Visit,
  VisitEvent,
  VisitKind,
  VisitMeta,
  VisitSource,
  VisitStatus,
  WizardDraft,
} from '../domain/types';
import { OPEN_VISIT_STATUSES, patientKey } from '../domain/types';
import { startOfTodayClinicISO } from '../lib/dates';
import { kioskCode, uuid } from '../lib/ids';
import { buildMedicalHistory, buildSymptomsEnvelope, notesToRow, rowToVisit, visitToRow } from './mappers';
import type { Row } from './mappers';
import { DataError, TABLES, fail, supabase } from './supabase';

/**
 * Un UPDATE que devuelve 0 filas puede ser (a) otra pestaña movió la visita
 * (compare-and-set legítimo) o (b) la base rechazó la escritura sin error,
 * que es lo que hace PostgREST cuando RLS no tiene política de UPDATE para la
 * llave en uso. Se distinguen releyendo la fila: si sigue cumpliendo la
 * condición, es (b) y hay que decirlo fuerte, no tragárselo como transición.
 */
export const WRITE_REJECTED_MESSAGE = 'La base de datos no aplicó la actualización (0 filas). Revise las políticas RLS de patient_forms para la llave anon: supabase/sql/permisos-anon-temporal.sql.';

const table = () => supabase.from(TABLES.visits);

export class DuplicateOpenVisit extends Error {
  readonly existing: Visit;
  constructor(existing: Visit) {
    super('Este paciente ya tiene una visita abierta hoy.');
    this.name = 'DuplicateOpenVisit';
    this.existing = existing;
  }
}

export interface Actor {
  role: ActorRole;
  username?: string;
}

const event = (type: string, by: Actor, meta?: Record<string, unknown>): VisitEvent => ({ type, at: new Date().toISOString(), by: { role: by.role, username: by.username }, meta });

const withEvent = (meta: VisitMeta, ev: VisitEvent): VisitMeta => ({ ...meta, events: [...(meta.events ?? []).slice(-49), ev] });

// ---------------- lectura ----------------

export const getVisit = async (id: string): Promise<Visit | null> => {
  const { data, error } = await table().select('*').eq('id', id).maybeSingle();
  if (error) fail('No se pudo leer la visita.', error);
  return data ? rowToVisit(data) : null;
};

export const listVisits = async (opts: { statuses?: VisitStatus[]; since?: string; limit?: number; ascending?: boolean } = {}): Promise<Visit[]> => {
  let q = table().select('*').order('created_at', { ascending: opts.ascending ?? false });
  if (opts.statuses?.length) q = q.in('status', opts.statuses);
  if (opts.since) q = q.gte('created_at', opts.since);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) fail('No se pudieron cargar los pacientes.', error);
  return (data ?? []).map(rowToVisit);
};

/** Visitas abiertas (cualquier día, para incluir filas legacy) en orden de llegada. */
export const listOpenVisits = () => listVisits({ statuses: OPEN_VISIT_STATUSES, ascending: true });

export const listVisitsByPhone = async (phone: string): Promise<Visit[]> => {
  const key = patientKey(phone);
  if (key.length < 7) return [];
  const { data, error } = await table().select('*').ilike('phone', `%${key.slice(-7)}%`).order('created_at', { ascending: false });
  if (error) fail('No se pudo buscar el teléfono.', error);
  return (data ?? []).map(rowToVisit).filter((v) => patientKey(v.personal.phone) === key);
};

export const findOpenVisitByPhone = async (phone: string): Promise<Visit | null> => {
  const visits = await listVisitsByPhone(phone);
  const today = startOfTodayClinicISO();
  return visits.find((v) => OPEN_VISIT_STATUSES.includes(v.status) && v.createdAt >= today) ?? null;
};

const listByKioskCode = async (code: string): Promise<Visit[]> => {
  const { data, error } = await table()
    .select('*')
    .eq('status', 'arrived')
    .gte('created_at', startOfTodayClinicISO())
    .eq('symptoms->visit->>kioskCode', code.trim())
    .order('created_at', { ascending: false })
    .limit(2);
  if (error) fail('No se pudo buscar el código.', error);
  return (data ?? []).map(rowToVisit);
};

/** Visita de hoy con ese código. Si el código está repetido (no debería), no adivina: null. */
export const findByKioskCode = async (code: string): Promise<Visit | null> => {
  const list = await listByKioskCode(code);
  return list.length === 1 ? list[0] : null;
};

/** Código de 4 dígitos que ninguna visita abierta de hoy esté usando. */
const freshKioskCode = async (): Promise<string> => {
  for (let i = 0; i < 8; i++) {
    const code = kioskCode();
    if (!(await listByKioskCode(code)).length) return code;
  }
  return kioskCode();
};

export const searchVisits = async (term: string, limit = 30): Promise<Visit[]> => {
  const t = term.trim();
  if (!t) return [];
  const digits = t.replace(/\D/g, '');
  let q = table().select('*').order('created_at', { ascending: false }).limit(limit);
  q = digits.length >= 4 ? q.or(`full_name.ilike.%${t}%,phone.ilike.%${digits}%`) : q.ilike('full_name', `%${t}%`);
  const { data, error } = await q;
  if (error) fail('No se pudo buscar.', error);
  return (data ?? []).map(rowToVisit);
};

// ---------------- escritura ----------------

export interface CreateVisitInput {
  personal: PersonalData;
  status: 'arrived' | 'waiting' | 'in_consultation';
  kind: VisitKind;
  source: VisitSource;
  by: Actor;
  intakeMode?: VisitMeta['intakeMode'];
  prevVisitId?: string;
  appointmentId?: string;
  preferredDoctor?: string;
  doctorUsername?: string;
  withKioskCode?: boolean;
  /** true: no aplica la invariante de una visita abierta por teléfono. */
  allowDuplicate?: boolean;
  intake?: Intake;
  phoneCollision?: boolean;
}

/** Crea una visita aplicando la invariante "una visita abierta por teléfono y día". */
export const createVisit = async (input: CreateVisitInput): Promise<Visit> => {
  if (!input.allowDuplicate) {
    const open = await findOpenVisitByPhone(input.personal.phone);
    if (open) throw new DuplicateOpenVisit(open);
  }
  const now = new Date().toISOString();
  const code = input.withKioskCode ? await freshKioskCode() : undefined;
  const meta: VisitMeta = withEvent(
    {
      kind: input.kind,
      source: input.source,
      intakeMode: input.intakeMode ?? 'tablet',
      prevVisitId: input.prevVisitId,
      appointmentId: input.appointmentId,
      kioskCode: code,
      rev: 0,
      doctorUsername: input.doctorUsername,
      registeredBy: input.by.username,
      checkedInAt: now,
      phoneCollision: input.phoneCollision,
      calledAt: input.status === 'in_consultation' ? now : undefined,
    },
    event('created', input.by, { status: input.status, source: input.source }),
  );
  const visit: Visit = {
    id: uuid(),
    createdAt: now,
    status: input.status,
    personal: input.personal,
    preferredDoctor: input.preferredDoctor,
    intake: input.intake,
    ai: { status: input.intake ? 'pending' : 'skipped' },
    meta,
    notes: input.status === 'in_consultation' ? { ...emptyNotes(), startedAt: now, doctorUsername: input.doctorUsername } : undefined,
    files: [],
  };
  const { error } = await table().insert([visitToRow(visit)]);
  if (error) fail('No se pudo guardar el registro del paciente.', error);
  return visit;
};

interface PatchOptions {
  /** Estados desde los que se permite la escritura (compare-and-set). */
  from?: VisitStatus[];
}

const MAX_WRITE_RETRIES = 3;

/**
 * Lee la fila fresca, aplica el parche y escribe con:
 *  - CAS opcional sobre `status` (transiciones),
 *  - concurrencia optimista sobre `meta.rev`: si otra pestaña escribió entre la
 *    lectura y la escritura, se relee y se vuelve a aplicar (hasta 3 veces), así
 *    ningún escritor pisa columnas que no tocó.
 * Si `apply` devuelve null no se escribe nada (no-op).
 */
const patch = async (id: string, apply: (visit: Visit) => Partial<Visit> | null, opts: PatchOptions = {}): Promise<Visit> => {
  for (let attempt = 0; ; attempt++) {
    const current = await getVisit(id);
    if (!current) throw new Error('La visita ya no existe.');
    if (opts.from && !opts.from.includes(current.status)) throw new TransitionRejected(current.status, apply(current)?.status ?? current.status);
    const delta = apply(current);
    if (!delta) return current;
    const rev = current.meta.rev;
    const next: Visit = { ...current, ...delta };
    next.meta = { ...next.meta, rev: (rev ?? 0) + 1 };
    const row: Row = {
      status: next.status,
      symptoms: buildSymptomsEnvelope(next),
      classification: next.intake?.reasons ?? next.legacyIntake?.reasons ?? [],
      full_name: next.personal.fullName.trim(),
      age: next.personal.age,
      gender: next.personal.gender,
      phone: next.personal.phone.trim(),
      email: next.personal.email?.trim() || null,
      preferred_doctor: next.preferredDoctor ?? null,
      medical_notes: notesToRow(next.notes, next.files),
    };
    const history = buildMedicalHistory(next.intake);
    if (history) row.medical_history = history;
    let q = table().update(row).eq('id', id);
    if (opts.from) q = q.in('status', opts.from);
    q = rev === undefined ? q.is('symptoms->visit->>rev', null) : q.eq('symptoms->visit->>rev', String(rev));
    const { data, error } = await q.select('id');
    if (error) fail('No se pudo actualizar la visita.', error);
    if (data && data.length > 0) return next;
    const fresh = await getVisit(id);
    if (!fresh) throw new Error('La visita ya no existe.');
    if (opts.from && !opts.from.includes(fresh.status)) throw new TransitionRejected(fresh.status, next.status);
    if (fresh.meta.rev !== rev && attempt < MAX_WRITE_RETRIES) continue; // otra pestaña escribió: reaplicar sobre la fila fresca
    console.error('[db] UPDATE sin efecto en patient_forms', { id, from: opts.from, status: fresh.status, rev, freshRev: fresh.meta.rev });
    throw new DataError(WRITE_REJECTED_MESSAGE, { id, status: fresh.status });
  }
};

/** Liga una visita abierta (p. ej. creada desde el kiosko) con la cita a la que corresponde. */
export const linkAppointment = (id: string, appointmentId: string) => patch(id, (v) => (v.meta.appointmentId === appointmentId ? null : { meta: { ...v.meta, appointmentId } }));

export const updatePersonal = (id: string, personal: PersonalData, by: Actor) => patch(id, (v) => ({ personal, meta: withEvent(v.meta, event('personal_updated', by)) }));

/** Guarda el borrador del wizard (no cambia el estado). */
export const saveWizardDraft = (id: string, wizard: WizardDraft) =>
  patch(id, (v) => ({ meta: { ...v.meta, wizard: { ...wizard, lastSavedAt: new Date().toISOString() } } }), { from: ['arrived'] });

/**
 * El paciente terminó el interrogatorio: guarda y pasa a sala de espera. Si el
 * doctor ya lo llamó (in_consultation), el interrogatorio se guarda sin
 * regresar el estado: nunca se descartan 10 minutos de respuestas.
 */
export const completeIntake = (id: string, intake: Intake, by: Actor, personal?: PersonalData) =>
  patch(
    id,
    (v) => ({
      status: v.status === 'arrived' ? 'waiting' : v.status,
      intake,
      personal: personal ?? v.personal,
      ai: { status: 'pending', requestedAt: new Date().toISOString(), attempts: 0 },
      meta: withEvent({ ...v.meta, intakeMode: 'tablet', wizard: undefined }, event('intake_done', by)),
    }),
    { from: ['arrived', 'waiting', 'in_consultation'] },
  );

/** Recepción pasa al paciente a sala sin cuestionario. */
export const skipIntake = (id: string, by: Actor) =>
  patch(
    id,
    (v) => ({
      status: 'waiting',
      ai: v.intake ? v.ai : { status: 'skipped' },
      meta: withEvent({ ...v.meta, intakeMode: v.intake ? v.meta.intakeMode : 'skipped' }, event('intake_skipped', by)),
    }),
    { from: ['arrived'] },
  );

export const transitionVisit = async (id: string, to: VisitStatus, by: Actor, extra: Partial<VisitMeta> = {}): Promise<Visit> => {
  const current = await getVisit(id);
  if (!current) throw new Error('La visita ya no existe.');
  if (!canTransition(current.status, to, by.role)) throw new TransitionRejected(current.status, to);
  const now = new Date().toISOString();
  const stamps: Partial<VisitMeta> =
    to === 'in_consultation' ? { calledAt: now, doctorUsername: by.username ?? current.meta.doctorUsername } : to === 'completed' ? { completedAt: now } : to === 'cancelled' ? { cancelledAt: now } : {};
  return patch(id, (v) => ({ status: to, meta: withEvent({ ...v.meta, ...stamps, ...extra }, event(`status:${to}`, by)) }), { from: [current.status] });
};

export const startConsultation = async (id: string, by: Actor & { fullName?: string }): Promise<Visit> => {
  const current = await getVisit(id);
  if (!current) throw new Error('La visita ya no existe.');
  if (!canTransition(current.status, 'in_consultation', by.role)) throw new TransitionRejected(current.status, 'in_consultation');
  const now = new Date().toISOString();
  return patch(
    id,
    (v) => ({
      status: 'in_consultation',
      meta: withEvent({ ...v.meta, calledAt: now, doctorUsername: by.username }, event('consult_start', by)),
      notes: { ...(v.notes ?? emptyNotes()), startedAt: v.notes?.startedAt ?? now, doctorUsername: by.username, doctorName: by.fullName },
    }),
    { from: ['waiting', 'arrived'] },
  );
};

export const returnToWaiting = (id: string, by: Actor) => transitionVisit(id, 'waiting', by);

export const cancelVisit = (id: string, by: Actor, reason: CancelReason, note?: string) =>
  transitionVisit(id, 'cancelled', by, { cancelReason: reason, cancelNote: note });

export const reactivateVisit = (id: string, by: Actor) => transitionVisit(id, 'arrived', by, { cancelReason: undefined, cancelNote: undefined, cancelledAt: undefined });

/** Marca como abandonadas las visitas abiertas de días anteriores. Devuelve cuántas. */
export const sweepAbandoned = async (by: Actor): Promise<number> => {
  const today = startOfTodayClinicISO();
  const stale = (await listOpenVisits()).filter((v) => v.createdAt < today && v.meta.source !== 'legacy');
  let n = 0;
  for (const v of stale) {
    try {
      await patch(v.id, (x) => ({ status: 'cancelled', meta: withEvent({ ...x.meta, cancelledAt: new Date().toISOString(), cancelReason: 'abandonado' }, event('status:cancelled', by, { auto: true })) }), { from: OPEN_VISIT_STATUSES });
      n++;
    } catch {
      /* otra pestaña lo movió */
    }
  }
  return n;
};

// ---------------- IA ----------------

/** Una generación con reintentos puede tardar hasta ~4.5 min; solo después se considera colgada. */
export const AI_STALE_MS = 5 * 60_000;

/**
 * Reclama la generación del resumen (compare-and-set sobre ai.status, startedAt y rev).
 * Devuelve la visita reclamada (su `ai.startedAt` es el token para finishAi) o null si otro cliente la tiene.
 */
export const claimAi = async (id: string, force = false): Promise<Visit | null> => {
  const current = await getVisit(id);
  if (!current || !current.intake) return null;
  const st = current.ai.status;
  const stale = st === 'generating' && current.ai.startedAt && Date.now() - new Date(current.ai.startedAt).getTime() > AI_STALE_MS;
  const claimable = force ? st !== 'generating' || stale : st === 'pending' || (st === 'failed' && (current.ai.attempts ?? 0) < 3) || stale;
  if (!claimable) return null;
  const rev = current.meta.rev;
  const next: Visit = {
    ...current,
    ai: { ...current.ai, status: 'generating', startedAt: new Date().toISOString(), attempts: (current.ai.attempts ?? 0) + 1, error: undefined },
    meta: { ...current.meta, rev: (rev ?? 0) + 1 },
  };
  let q = table().update({ symptoms: buildSymptomsEnvelope(next) }).eq('id', id).eq('symptoms->ai->>status', st);
  if (stale && current.ai.startedAt) q = q.eq('symptoms->ai->>startedAt', current.ai.startedAt);
  q = rev === undefined ? q.is('symptoms->visit->>rev', null) : q.eq('symptoms->visit->>rev', String(rev));
  const { data, error } = await q.select('id');
  if (error) fail('No se pudo reclamar el resumen.', error);
  if (!data || data.length === 0) {
    const fresh = await getVisit(id);
    if (fresh && fresh.ai.status === st && fresh.meta.rev === rev) throw new DataError(WRITE_REJECTED_MESSAGE, { id, ai: st });
    return null;
  }
  return next;
};

/**
 * Guarda el resultado de la generación. Con `token` (el `ai.startedAt` de la
 * reclamación) solo escribe si esa reclamación sigue vigente: una generación
 * tardía nunca pisa un resumen que otro cliente ya terminó.
 */
export const finishAi = (id: string, ai: AiState, token?: string) =>
  patch(id, (v) => {
    if (token && (v.ai.status !== 'generating' || v.ai.startedAt !== token)) return null;
    return { ai: { ...v.ai, ...ai } };
  });

// ---------------- consulta ----------------

export const emptyNotes = (): MedicalNotes => ({
  vitalSigns: '',
  currentIllness: '',
  interrogation: '',
  physicalExam: '',
  diagnosis: '',
  prescription: '',
  recommendations: '',
});

/** Borrador de la nota; solo mientras la consulta sigue abierta (nunca sobre una nota firmada). */
export const saveNoteDraft = (id: string, draft: Partial<MedicalNotes>) =>
  patch(id, (v) => ({ notes: { ...(v.notes ?? emptyNotes()), draft: { ...draft, savedAt: new Date().toISOString() } } }), { from: ['in_consultation', 'waiting', 'arrived'] });

export const saveConsultation = (id: string, notes: MedicalNotes, by: Actor & { fullName?: string }) =>
  patch(
    id,
    (v) => {
      const savedAt = new Date().toISOString();
      // Se conserva lo que el formulario no administra (investigación, cita ligada) y se quita el borrador.
      const saved: MedicalNotes = {
        ...(v.notes ?? {}),
        ...notes,
        research: notes.research ?? v.notes?.research,
        attachedFiles: undefined,
        draft: undefined,
        savedAt,
        startedAt: v.notes?.startedAt ?? savedAt,
        doctorUsername: by.username ?? v.notes?.doctorUsername,
        doctorName: by.fullName ?? v.notes?.doctorName,
      };
      return { status: 'completed', notes: saved, meta: withEvent({ ...v.meta, completedAt: savedAt, doctorUsername: by.username ?? v.meta.doctorUsername }, event('consult_end', by)) };
    },
    { from: ['in_consultation', 'waiting', 'arrived', 'completed'] },
  );

/** Registra en la nota la cita de seguimiento creada al cerrar la consulta. */
export const setFollowUp = (id: string, follow: { nextAppointment?: string; nextAppointmentId?: string }) =>
  patch(id, (v) => ({ notes: { ...(v.notes ?? emptyNotes()), nextAppointment: follow.nextAppointment, nextAppointmentId: follow.nextAppointmentId } }));

export const addFile = async (id: string, file: AttachedFile): Promise<AttachedFile[]> => {
  const next = await patch(id, (v) => ({ files: [...v.files, file] }));
  return next.files;
};

export const appendResearch = (id: string, entry: NonNullable<MedicalNotes['research']>[number]) =>
  patch(id, (v) => ({ notes: { ...(v.notes ?? emptyNotes()), research: [...(v.notes?.research ?? []), entry] } }));

// ---------------- agrupación ----------------

export const groupPatients = (visits: Visit[]): Patient[] => {
  const map = new Map<string, Visit[]>();
  for (const v of visits) {
    const key = patientKey(v.personal.phone) || `id:${v.id}`;
    map.set(key, [...(map.get(key) ?? []), v]);
  }
  return Array.from(map.entries())
    .map(([key, vs]) => {
      const sorted = [...vs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const latest = sorted[0];
      return { key, personal: latest.personal, visits: sorted, latestVisit: latest, firstVisitAt: sorted[sorted.length - 1].createdAt, lastVisitAt: latest.createdAt };
    })
    .sort((a, b) => b.lastVisitAt.localeCompare(a.lastVisitAt));
};
