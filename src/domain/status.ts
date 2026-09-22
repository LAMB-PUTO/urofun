import { clinicDayOf } from '../lib/dates';
import type { ActorRole, Appointment, AppointmentStatus, Visit, VisitStatus } from './types';

/**
 * Única tabla de transiciones. Ningún componente decide por su cuenta quién
 * puede mover una visita; los repos la validan y además usan compare-and-set.
 */
export const VISIT_TRANSITIONS: Record<VisitStatus, Partial<Record<ActorRole, VisitStatus[]>>> = {
  arrived: {
    patient: ['waiting'],
    reception: ['waiting', 'cancelled'],
    doctor: ['waiting', 'in_consultation', 'cancelled'],
    admin: ['waiting', 'in_consultation', 'cancelled'],
    system: ['cancelled'],
  },
  waiting: {
    reception: ['arrived', 'cancelled'],
    doctor: ['in_consultation', 'arrived', 'cancelled'],
    admin: ['in_consultation', 'arrived', 'cancelled'],
    system: ['cancelled'],
  },
  in_consultation: {
    doctor: ['completed', 'waiting'],
    admin: ['completed', 'waiting', 'cancelled'],
  },
  completed: {
    doctor: ['completed'],
    admin: ['completed'],
  },
  cancelled: {
    admin: ['arrived'],
  },
};

export const canTransition = (from: VisitStatus, to: VisitStatus, role: ActorRole): boolean =>
  (VISIT_TRANSITIONS[from]?.[role] ?? []).includes(to);

export interface StatusAction {
  label: string;
  to: VisitStatus;
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  confirm?: string;
}

/** Acciones disponibles para una visita según el rol (para botones). */
export const visitActions = (visit: Visit, role: ActorRole, me?: string): StatusAction[] => {
  const out: StatusAction[] = [];
  const allowed = VISIT_TRANSITIONS[visit.status]?.[role] ?? [];
  const attending = visit.meta.doctorUsername;
  const isOwner = !attending || attending === me || role === 'admin';

  if (allowed.includes('in_consultation') && (role === 'doctor' || role === 'admin')) {
    out.push({ label: visit.status === 'arrived' ? 'Atender ahora' : 'Atender', to: 'in_consultation', variant: 'primary' });
  }
  if (allowed.includes('waiting') && visit.status === 'arrived') {
    out.push({ label: 'Sin tablet', to: 'waiting', variant: 'secondary' });
  }
  if (allowed.includes('completed') && visit.status === 'in_consultation' && isOwner) {
    out.push({ label: 'Terminar consulta', to: 'completed', variant: 'primary' });
  }
  if (allowed.includes('waiting') && visit.status === 'in_consultation' && isOwner) {
    out.push({ label: 'Devolver a sala', to: 'waiting', variant: 'ghost' });
  }
  if (allowed.includes('arrived') && visit.status === 'waiting') {
    out.push({ label: 'Reaplicar cuestionario', to: 'arrived', variant: 'ghost' });
  }
  if (allowed.includes('cancelled') && visit.status !== 'in_consultation') {
    out.push({ label: 'Se retiró', to: 'cancelled', variant: 'danger', confirm: '¿Marcar que el paciente se retiró sin ser atendido?' });
  }
  if (allowed.includes('arrived') && visit.status === 'cancelled') {
    out.push({ label: 'Reactivar', to: 'arrived', variant: 'secondary' });
  }
  return out;
};

export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, Partial<Record<ActorRole, AppointmentStatus[]>>> = {
  scheduled: {
    reception: ['confirmed', 'checked_in', 'cancelled', 'no_show', 'scheduled'],
    doctor: ['confirmed', 'checked_in', 'cancelled', 'no_show', 'scheduled'],
    admin: ['confirmed', 'checked_in', 'cancelled', 'no_show', 'scheduled'],
    patient: ['cancelled'],
  },
  confirmed: {
    reception: ['checked_in', 'cancelled', 'no_show', 'scheduled'],
    doctor: ['checked_in', 'cancelled', 'no_show', 'scheduled'],
    admin: ['checked_in', 'cancelled', 'no_show', 'scheduled'],
  },
  checked_in: {
    reception: ['cancelled'],
    doctor: ['completed', 'cancelled'],
    admin: ['completed', 'cancelled'],
    system: ['completed'],
  },
  completed: {},
  cancelled: {
    reception: ['scheduled'],
    doctor: ['scheduled'],
    admin: ['scheduled'],
  },
  no_show: {
    reception: ['scheduled'],
    doctor: ['scheduled'],
    admin: ['scheduled'],
  },
};

export const canTransitionAppointment = (from: AppointmentStatus, to: AppointmentStatus, role: ActorRole): boolean =>
  (APPOINTMENT_TRANSITIONS[from]?.[role] ?? []).includes(to);

export interface AppointmentAction {
  key: 'confirm' | 'checkin' | 'reschedule' | 'cancel' | 'no_show' | 'reactivate';
  label: string;
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
}

export const appointmentActions = (a: Appointment, role: ActorRole, now = new Date()): AppointmentAction[] => {
  const out: AppointmentAction[] = [];
  const allowed = APPOINTMENT_TRANSITIONS[a.status]?.[role] ?? [];
  const startsAt = new Date(a.startsAt).getTime();
  const isToday = clinicDayOf(a.startsAt) === clinicDayOf(now);
  if (allowed.includes('checked_in') && isToday) out.push({ key: 'checkin', label: 'Llegó', variant: 'primary' });
  if (allowed.includes('confirmed') && a.status === 'scheduled') out.push({ key: 'confirm', label: 'Confirmar', variant: 'secondary' });
  if (allowed.includes('scheduled') && (a.status === 'scheduled' || a.status === 'confirmed')) out.push({ key: 'reschedule', label: 'Reagendar', variant: 'ghost' });
  if (allowed.includes('no_show') && startsAt + 30 * 60_000 < now.getTime()) out.push({ key: 'no_show', label: 'No llegó', variant: 'ghost' });
  if (allowed.includes('cancelled')) out.push({ key: 'cancel', label: 'Cancelar', variant: 'danger' });
  if (allowed.includes('scheduled') && (a.status === 'cancelled' || a.status === 'no_show')) out.push({ key: 'reactivate', label: 'Reagendar', variant: 'secondary' });
  return out;
};

export class TransitionRejected extends Error {
  readonly from: VisitStatus | AppointmentStatus;
  readonly to: VisitStatus | AppointmentStatus;
  constructor(from: VisitStatus | AppointmentStatus, to: VisitStatus | AppointmentStatus) {
    super(`Transición no permitida: ${from} → ${to}`);
    this.name = 'TransitionRejected';
    this.from = from;
    this.to = to;
  }
}
