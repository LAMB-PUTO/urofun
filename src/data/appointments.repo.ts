import { canTransitionAppointment, TransitionRejected } from '../domain/status';
import type { ActorRole, Appointment, AppointmentSource, AppointmentStatus, Gender, VisitKind } from '../domain/types';
import { OPEN_APPOINTMENT_STATUSES, patientKey } from '../domain/types';
import { uuid } from '../lib/ids';
import { appointmentToRow, rowToAppointment } from './mappers';
import { DataError, TABLES, fail, supabase } from './supabase';

const table = () => supabase.from(TABLES.appointments);

export class SlotTakenError extends Error {
  readonly conflicts: Appointment[];
  constructor(conflicts: Appointment[]) {
    super('Ese horario ya está ocupado.');
    this.name = 'SlotTakenError';
    this.conflicts = conflicts;
  }
}

export interface CreateAppointmentInput {
  patientName: string;
  patientPhone: string;
  patient?: { age?: number; gender?: Gender; email?: string; birthDate?: string };
  doctorUsername: string;
  doctorName: string;
  startsAt: string;
  durationMinutes?: number;
  kind?: VisitKind;
  reason?: string;
  reasons?: string[];
  notes?: string;
  source: AppointmentSource;
  createdBy?: string;
  visitId?: string;
  prevVisitId?: string;
}

export const getAppointment = async (id: string): Promise<Appointment | null> => {
  const { data, error } = await table().select('*').eq('id', id).maybeSingle();
  if (error) fail('No se pudo leer la cita.', error);
  return data ? rowToAppointment(data) : null;
};

export const listAppointments = async (opts: { from?: string; to?: string; doctorUsername?: string; statuses?: AppointmentStatus[]; limit?: number } = {}): Promise<Appointment[]> => {
  let q = table().select('*').order('appointment_date', { ascending: true });
  if (opts.from) q = q.gte('appointment_date', opts.from);
  if (opts.to) q = q.lt('appointment_date', opts.to);
  if (opts.doctorUsername) q = q.eq('doctor_username', opts.doctorUsername);
  if (opts.statuses?.length) q = q.in('status', opts.statuses);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) fail('No se pudieron cargar las citas.', error);
  return (data ?? []).map(rowToAppointment);
};

/** Solo fecha y estado, para el booking público (sin nombres). */
export const listOccupiedSlots = async (doctorUsername: string, from: string, to: string): Promise<Appointment[]> => {
  // Solo columnas sin PII: nada del sobre (correo, comentarios) llega al navegador público.
  const { data, error } = await table()
    .select('id, appointment_date, status, doctor_username, duration:symptoms->durationMinutes')
    .eq('doctor_username', doctorUsername)
    .gte('appointment_date', from)
    .lt('appointment_date', to)
    .in('status', OPEN_APPOINTMENT_STATUSES);
  if (error) fail('No se pudo consultar la disponibilidad.', error);
  return (data ?? []).map((row: Record<string, unknown>) =>
    rowToAppointment({ id: row.id, appointment_date: row.appointment_date, status: row.status, doctor_username: row.doctor_username, patient_name: '', patient_phone: '', symptoms: { version: 2, durationMinutes: Number(row.duration) || 30 } }),
  );
};

export const listAppointmentsByPhone = async (phone: string): Promise<Appointment[]> => {
  const key = patientKey(phone);
  if (key.length < 7) return [];
  const { data, error } = await table().select('*').ilike('patient_phone', `%${key.slice(-7)}%`).order('appointment_date', { ascending: false });
  if (error) fail('No se pudieron cargar las citas del paciente.', error);
  return (data ?? []).map(rowToAppointment).filter((a) => a.patientKey === key);
};

/** Citas abiertas del mismo doctor que se traslapan con el intervalo. */
export const findConflicts = async (doctorUsername: string, startsAt: string, durationMinutes: number, excludeId?: string): Promise<Appointment[]> => {
  const start = new Date(startsAt).getTime();
  const end = start + durationMinutes * 60_000;
  const sameDay = await listAppointments({
    doctorUsername,
    from: new Date(start - 12 * 3600 * 1000).toISOString(),
    to: new Date(end + 12 * 3600 * 1000).toISOString(),
    statuses: OPEN_APPOINTMENT_STATUSES,
  });
  return sameDay.filter((a) => {
    if (a.id === excludeId) return false;
    const s = new Date(a.startsAt).getTime();
    const e = s + a.durationMinutes * 60_000;
    return s < end && e > start;
  });
};

export const createAppointment = async (input: CreateAppointmentInput): Promise<Appointment> => {
  const duration = input.durationMinutes ?? 30;
  const conflicts = await findConflicts(input.doctorUsername, input.startsAt, duration);
  if (conflicts.length) throw new SlotTakenError(conflicts);
  const a: Appointment = {
    id: uuid(),
    createdAt: new Date().toISOString(),
    status: 'scheduled',
    visitId: input.visitId,
    patientKey: patientKey(input.patientPhone),
    patientName: input.patientName.trim(),
    patientPhone: input.patientPhone.trim(),
    patient: input.patient,
    doctorUsername: input.doctorUsername,
    doctorName: input.doctorName,
    startsAt: input.startsAt,
    durationMinutes: duration,
    kind: input.kind ?? 'first',
    reason: input.reason,
    reasons: input.reasons ?? [],
    notes: input.notes,
    source: input.source,
    createdBy: input.createdBy,
    prevVisitId: input.prevVisitId,
    history: [],
  };
  const { error } = await table().insert([appointmentToRow(a)]);
  if (error) {
    if (error.code === '23505') throw new SlotTakenError([]); // índice único de horario (supabase/sql/indices-recomendados.sql)
    if (error.code === '23502' && /patient_id/.test(error.message ?? '')) {
      fail('La base exige patient_id en appointments (esquema anterior). Ejecute supabase/sql/citas-patient-id-opcional.sql en el SQL Editor.', error);
    }
    fail('No se pudo guardar la cita.', error);
  }
  return a;
};

/** Escribe la cita con CAS sobre status (opcional) y sobre rev (siempre): nadie pisa lo que otro escribió. */
const write = async (a: Appointment, from?: AppointmentStatus[]): Promise<Appointment> => {
  const rev = a.rev;
  const next: Appointment = { ...a, rev: (rev ?? 0) + 1 };
  const row = appointmentToRow(next);
  delete row.id;
  delete row.created_at;
  let q = table().update(row).eq('id', a.id);
  if (from) q = q.in('status', from);
  q = rev === undefined ? q.is('symptoms->>rev', null) : q.eq('symptoms->>rev', String(rev));
  const { data, error } = await q.select('id');
  if (error) fail('No se pudo actualizar la cita.', error);
  if (!data || data.length === 0) {
    const fresh = await getAppointment(a.id);
    if (!fresh) throw new Error('La cita ya no existe.');
    if (from && !from.includes(fresh.status)) throw new TransitionRejected(fresh.status, a.status);
    if (fresh.rev !== rev) throw new DataError('La cita cambió en otra pestaña. Actualice la agenda y vuelva a intentar.', { id: a.id, rev, freshRev: fresh.rev });
    console.error('[db] UPDATE sin efecto en appointments', { id: a.id, from, status: fresh.status });
    throw new DataError('La base de datos no aplicó la actualización de la cita (0 filas). Revise las políticas RLS de appointments: supabase/sql/permisos-anon-temporal.sql.', { id: a.id, status: fresh.status });
  }
  return next;
};

export const transitionAppointment = async (id: string, to: AppointmentStatus, role: ActorRole, extra: Partial<Appointment> = {}): Promise<Appointment> => {
  const current = await getAppointment(id);
  if (!current) throw new Error('La cita ya no existe.');
  if (!canTransitionAppointment(current.status, to, role)) throw new TransitionRejected(current.status, to);
  const now = new Date().toISOString();
  const stamps: Partial<Appointment> =
    to === 'confirmed' ? { confirmedAt: now } : to === 'checked_in' ? { checkedInAt: now } : to === 'cancelled' ? { cancelledAt: now } : to === 'no_show' ? { noShowAt: now } : {};
  return write({ ...current, ...stamps, ...extra, status: to }, [current.status]);
};

export const rescheduleAppointment = async (id: string, startsAt: string, by: string | undefined, role: ActorRole): Promise<Appointment> => {
  const current = await getAppointment(id);
  if (!current) throw new Error('La cita ya no existe.');
  const conflicts = await findConflicts(current.doctorUsername, startsAt, current.durationMinutes, id);
  if (conflicts.length) throw new SlotTakenError(conflicts);
  const reopened = current.status === 'cancelled' || current.status === 'no_show';
  if (reopened && !canTransitionAppointment(current.status, 'scheduled', role)) throw new TransitionRejected(current.status, 'scheduled');
  const next: Appointment = {
    ...current,
    status: reopened ? 'scheduled' : current.status,
    startsAt,
    cancelledAt: reopened ? undefined : current.cancelledAt,
    cancelReason: reopened ? undefined : current.cancelReason,
    noShowAt: reopened ? undefined : current.noShowAt,
    history: [...(current.history ?? []), { from: current.startsAt, to: startsAt, by, at: new Date().toISOString() }],
  };
  return write(next, [current.status]);
};

export const updateAppointmentDetails = async (id: string, patchData: Partial<Pick<Appointment, 'reason' | 'reasons' | 'notes' | 'doctorUsername' | 'doctorName' | 'visitId' | 'patientName' | 'patientPhone'>>): Promise<Appointment> => {
  const current = await getAppointment(id);
  if (!current) throw new Error('La cita ya no existe.');
  return write({ ...current, ...patchData });
};
