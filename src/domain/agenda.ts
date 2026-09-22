import { CLINIC } from '../config/clinic';
import { addDays, clinicToUtc, todayClinic, weekdayOf } from '../lib/dates';
import type { Appointment } from './types';
import { OPEN_APPOINTMENT_STATUSES } from './types';

export type SlotState = 'free' | 'booked' | 'past' | 'closed';

export interface AgendaSlot {
  /** 'HH:mm' en la clínica. */
  time: string;
  startsAt: string;
  endsAt: string;
  state: SlotState;
  appointment?: Appointment;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

const fromMinutes = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const isWorkday = (day: string): boolean => (CLINIC.workdays as readonly number[]).includes(weekdayOf(day));

/** Slots del día para un doctor, marcando ocupados/pasados. */
export const getSlots = (
  day: string,
  appointments: Appointment[],
  opts: { doctorUsername?: string; now?: Date; leadMinutes?: number } = {},
): AgendaSlot[] => {
  const now = opts.now ?? new Date();
  const lead = (opts.leadMinutes ?? 0) * 60_000;
  const open = appointments.filter((a) => OPEN_APPOINTMENT_STATUSES.includes(a.status) && (!opts.doctorUsername || a.doctorUsername === opts.doctorUsername));
  const start = toMinutes(CLINIC.hours.start);
  const end = toMinutes(CLINIC.hours.end);
  const slots: AgendaSlot[] = [];
  const workday = isWorkday(day);
  for (let m = start; m + CLINIC.slotMinutes <= end; m += CLINIC.slotMinutes) {
    const time = fromMinutes(m);
    const startsAt = clinicToUtc(day, time);
    const endsAt = new Date(startsAt.getTime() + CLINIC.slotMinutes * 60_000);
    const booked = open.find((a) => {
      const s = new Date(a.startsAt).getTime();
      const e = s + a.durationMinutes * 60_000;
      return s < endsAt.getTime() && e > startsAt.getTime();
    });
    let state: SlotState = 'free';
    if (!workday) state = 'closed';
    else if (booked) state = 'booked';
    else if (startsAt.getTime() < now.getTime() + lead) state = 'past';
    slots.push({ time, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), state, appointment: booked });
  }
  return slots;
};

/** Próximos N días laborales a partir de hoy (incluye hoy si es laboral). */
export const upcomingWorkdays = (count: number, from = todayClinic()): string[] => {
  const out: string[] = [];
  let day = from;
  let guard = 0;
  while (out.length < count && guard < count * 3 + 14) {
    if (isWorkday(day)) out.push(day);
    day = addDays(day, 1);
    guard++;
  }
  return out;
};

/** Semana (lunes a domingo) que contiene `day`. */
export const weekOf = (day: string): string[] => {
  const wd = weekdayOf(day);
  const monday = addDays(day, wd === 0 ? -6 : 1 - wd);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
};

/** Citas que deberían haber hecho check-in y no lo hicieron. */
export const suggestNoShows = (appointments: Appointment[], now = new Date()): Appointment[] =>
  appointments.filter((a) => (a.status === 'scheduled' || a.status === 'confirmed') && new Date(a.startsAt).getTime() + CLINIC.noShowAfterMinutes * 60_000 < now.getTime());
