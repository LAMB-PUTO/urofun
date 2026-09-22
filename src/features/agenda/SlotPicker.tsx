import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { listAppointments, listOccupiedSlots } from '../../data/appointments.repo';
import { getSlots, isWorkday, weekOf } from '../../domain/agenda';
import type { Appointment } from '../../domain/types';
import { addDays, formatDay, formatWeekday, startOfDayClinicISO, todayClinic } from '../../lib/dates';
import { CLINIC } from '../../config/clinic';

export interface SlotValue {
  day: string;
  time: string;
  startsAt: string;
}

interface Props {
  doctorUsername: string;
  value: SlotValue | null;
  onChange: (v: SlotValue | null) => void;
  /** Modo público: solo consulta fecha/estado sin nombres. */
  publicMode?: boolean;
  /** Minutos mínimos de anticipación. */
  leadMinutes?: number;
  /** Cita a excluir del choque (reagendar). */
  excludeId?: string;
  initialDay?: string;
}

export const SlotPicker = ({ doctorUsername, value, onChange, publicMode, leadMinutes = 0, excludeId, initialDay }: Props) => {
  const [day, setDay] = useState(initialDay ?? value?.day ?? todayClinic());
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const week = useMemo(() => weekOf(day), [day]);

  useEffect(() => {
    if (!doctorUsername) return;
    let alive = true;
    setLoading(true);
    const from = startOfDayClinicISO(day);
    const to = startOfDayClinicISO(addDays(day, 1));
    (publicMode ? listOccupiedSlots(doctorUsername, from, to) : listAppointments({ doctorUsername, from, to }))
      .then((a) => alive && setAppts(a.filter((x) => x.id !== excludeId)))
      .catch(() => alive && setAppts([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [doctorUsername, day, publicMode, excludeId]);

  const slots = useMemo(() => getSlots(day, appts, { doctorUsername, leadMinutes }), [day, appts, doctorUsername, leadMinutes]);
  const maxDay = addDays(todayClinic(), CLINIC.onlineHorizonDays);

  return (
    <div className="stack">
      <div className="daystrip">
        <button type="button" className="icon-btn" onClick={() => setDay(addDays(week[0], -7))} aria-label="Semana anterior" disabled={week[0] <= todayClinic() && publicMode}>
          <ChevronLeft size={18} />
        </button>
        {week.map((d) => {
          const closed = !isWorkday(d) || d < todayClinic() || (publicMode && d > maxDay);
          return (
            <button
              key={d}
              type="button"
              className={['daystrip__day', d === day ? 'is-selected' : '', d === todayClinic() ? 'is-today' : '', closed ? 'is-closed' : ''].filter(Boolean).join(' ')}
              onClick={() => !closed && setDay(d)}
              disabled={closed}
              aria-pressed={d === day}
            >
              <span className="micro">{formatWeekday(startOfDayClinicISO(d))}</span>
              <span className="daystrip__num">{d.slice(-2)}</span>
            </button>
          );
        })}
        <button type="button" className="icon-btn" onClick={() => setDay(addDays(week[0], 7))} aria-label="Semana siguiente">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="small muted">{formatDay(day, 'long')}</div>
      {!isWorkday(day) ? (
        <p className="small muted">No hay consulta este día.</p>
      ) : (
        <div className="timegrid" aria-busy={loading}>
          {slots.map((s) => {
            const selected = value?.startsAt === s.startsAt;
            const disabled = s.state !== 'free';
            return (
              <button
                key={s.time}
                type="button"
                className={['btn', selected ? 'btn--primary' : 'btn--secondary', 'num'].join(' ')}
                disabled={disabled && !selected}
                title={s.state === 'booked' ? 'Ocupado' : s.state === 'past' ? 'Pasado' : undefined}
                onClick={() => onChange(selected ? null : { day, time: s.time, startsAt: s.startsAt })}
              >
                {s.time}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
