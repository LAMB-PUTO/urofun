import { CalendarPlus, CalendarX, ChevronLeft, ChevronRight, MessageCircle, MoreHorizontal, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppointmentStatusChip, Avatar, Button, ButtonLink, ConfirmModal, Drawer, EmptyState, Field, Input, Menu, MenuItem, Segmented, Select, SkeletonRows, Tag, useToast } from '../../components/ui';
import { can } from '../../config/roles';
import { SlotTakenError, listAppointments, rescheduleAppointment, transitionAppointment } from '../../data/appointments.repo';
import { TABLES } from '../../data/supabase';
import { getSlots, isWorkday, suggestNoShows, weekOf } from '../../domain/agenda';
import { appointmentActions } from '../../domain/status';
import type { AppointmentAction } from '../../domain/status';
import type { Appointment } from '../../domain/types';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { useDoctors, useDocumentTitle, useNow } from '../../hooks/useUtil';
import { addDays, clinicTimeOf, formatDateShort, formatDay, formatTime, formatWeekday, relativeTime, startOfDayClinicISO, todayClinic } from '../../lib/dates';
import { formatMx, whatsappLink } from '../../lib/phone';
import { checkInAppointment, confirmationMessage } from '../../services/agenda';
import { useSession } from '../../services/session';
import { actorOf } from '../shared/actor';
import { KioskCodeCard } from '../shared/KioskCodeCard';
import { SlotPicker } from './SlotPicker';
import type { SlotValue } from './SlotPicker';
import type { Visit } from '../../domain/types';

const SOURCE_LABEL: Record<Appointment['source'], string> = { web: 'En línea', phone: 'Teléfono', reception: 'Recepción', doctor: 'Doctor', followup: 'Seguimiento' };

export const AgendaPage = () => {
  useDocumentTitle('Agenda');
  const session = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow(60_000);
  const { doctors } = useDoctors();
  const actor = actorOf(session);
  const [day, setDay] = useState(todayClinic());
  const [view, setView] = useState<'day' | 'week'>('day');
  const [doctor, setDoctor] = useState<string>(session?.role === 'doctor' && session.username ? session.username : '');
  const week = useMemo(() => weekOf(day), [day]);
  const [reschedule, setReschedule] = useState<Appointment | null>(null);
  const [newSlot, setNewSlot] = useState<SlotValue | null>(null);
  const [cancelFor, setCancelFor] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [checkedIn, setCheckedIn] = useState<{ visit: Visit; reused: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const doctorFilter = doctor || undefined;
  const fetcher = useCallback(() => listAppointments({ from: startOfDayClinicISO(week[0]), to: startOfDayClinicISO(addDays(week[6], 1)), doctorUsername: doctorFilter }), [week, doctorFilter]);
  const { data, loading, refresh, updatedAt, error } = useLiveQuery(fetcher, [TABLES.appointments], 30_000);
  const appts = useMemo(() => data ?? [], [data]);

  const dayAppts = useMemo(() => appts.filter((a) => a.startsAt >= startOfDayClinicISO(day) && a.startsAt < startOfDayClinicISO(addDays(day, 1))), [appts, day]);
  const slots = useMemo(() => getSlots(day, dayAppts, { doctorUsername: doctorFilter, now }), [day, dayAppts, doctorFilter, now]);
  const noShows = useMemo(() => suggestNoShows(dayAppts, now), [dayAppts, now]);
  const unconfirmed = useMemo(() => appts.filter((a) => a.status === 'scheduled' && a.startsAt > now.toISOString()), [appts, now]);
  const nowTime = clinicTimeOf(now);
  const isToday = day === todayClinic();

  const run = async (a: Appointment, action: AppointmentAction) => {
    if (action.key === 'reschedule' || action.key === 'reactivate') {
      setReschedule(a);
      setNewSlot(null);
      return;
    }
    if (action.key === 'cancel') {
      setCancelFor(a);
      setCancelReason('');
      return;
    }
    setBusy(a.id);
    try {
      if (action.key === 'checkin') {
        const r = await checkInAppointment(a.id, actor);
        setCheckedIn({ visit: r.visit, reused: r.reused });
      } else if (action.key === 'confirm') await transitionAppointment(a.id, 'confirmed', actor.role);
      else if (action.key === 'no_show') await transitionAppointment(a.id, 'no_show', actor.role);
      await refresh({ silent: true });
    } catch (err) {
      toast.error('No se pudo aplicar la acción.', { message: err instanceof Error ? err.message : undefined });
      await refresh({ silent: true });
    } finally {
      setBusy(null);
    }
  };

  const doReschedule = async () => {
    if (!reschedule || !newSlot) return;
    setBusy(reschedule.id);
    try {
      await rescheduleAppointment(reschedule.id, newSlot.startsAt, session?.username ?? session?.fullName, actor.role);
      toast.success(`Cita movida al ${formatDay(newSlot.day, 'medium')} ${newSlot.time}.`);
      setReschedule(null);
      await refresh({ silent: true });
    } catch (err) {
      if (err instanceof SlotTakenError) toast.error('Ese horario ya está ocupado.');
      else toast.error('No se pudo reagendar.', { message: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const doCancel = async () => {
    if (!cancelFor) return;
    try {
      await transitionAppointment(cancelFor.id, 'cancelled', actor.role, { cancelReason: cancelReason.trim() || undefined });
    } catch (err) {
      await refresh({ silent: true });
      throw err; // el modal muestra el motivo y sigue abierto
    }
    toast.success('Cita cancelada.');
    await refresh({ silent: true });
  };

  const newAppointmentLink = (slotTime?: string, startsAt?: string) => `/panel/registrar?mode=cita&date=${day}${slotTime ? `&time=${slotTime}&startsAt=${encodeURIComponent(startsAt ?? '')}` : ''}${doctorFilter ? `&doctor=${encodeURIComponent(doctorFilter)}` : ''}`;

  const ApptRow = ({ a }: { a: Appointment }) => {
    const actions = appointmentActions(a, actor.role, now);
    const suggested = noShows.some((n) => n.id === a.id);
    return (
      <div className="slot__appt" onClick={() => a.visitId && (a.status === 'checked_in' ? navigate(`/panel/espera/${a.visitId}`) : undefined)}>
        <Avatar name={a.patientName} size="sm" />
        <div className="stack-2" style={{ gap: 2, minWidth: 0 }}>
          <div className="row-2">
            <span className="strong truncate">{a.patientName}</span>
            {a.kind === 'followup' && <Tag>Subsecuente</Tag>}
            {!doctorFilter && <Tag>{a.doctorName}</Tag>}
          </div>
          <div className="small muted num">
            {formatMx(a.patientPhone)} · {SOURCE_LABEL[a.source]}
            {a.reasons.length ? ` · ${a.reasons.join(', ')}` : ''}
            {a.notes ? ` · ${a.notes}` : ''}
          </div>
        </div>
        <div className="row-2" onClick={(e) => e.stopPropagation()}>
          {suggested && a.status !== 'no_show' ? <Tag>¿No llegó?</Tag> : <AppointmentStatusChip status={a.status} />}
          {actions[0] && (
            <Button size="sm" variant={actions[0].variant} onClick={() => void run(a, actions[0])} loading={busy === a.id}>
              {actions[0].label}
            </Button>
          )}
          {actions.length > 1 && (
            <Menu
              trigger={
                <button type="button" className="icon-btn icon-btn--sm" aria-label="Más acciones">
                  <MoreHorizontal size={18} />
                </button>
              }
            >
              {actions.slice(1).map((ac) => (
                <MenuItem key={ac.key} danger={ac.variant === 'danger'} onClick={() => void run(a, ac)}>
                  {ac.label}
                </MenuItem>
              ))}
              {a.status !== 'cancelled' && (
                <MenuItem onClick={() => window.open(whatsappLink(a.patientPhone, confirmationMessage(a)), '_blank')} icon={<MessageCircle size={14} />}>
                  WhatsApp de confirmación
                </MenuItem>
              )}
            </Menu>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      <header className="page__header">
        <div className="page__title">
          <h1 className="h1">Agenda</h1>
          <span className="live">
            <span className={['live-dot', error ? 'live-dot--off' : ''].join(' ')} />
            {updatedAt ? `Actualizado ${relativeTime(updatedAt, now)}` : 'Cargando'}
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => void refresh()} aria-label="Actualizar">
              <RefreshCw size={16} />
            </button>
          </span>
        </div>
        <div className="page__actions">
          {doctors.length > 1 && can(session, 'agenda.manage') && (
            <Select value={doctor} onChange={(e) => setDoctor(e.target.value)} aria-label="Doctor" style={{ width: 220 }}>
              <option value="">Todos los doctores</option>
              {doctors.map((d) => (
                <option key={d.username} value={d.username}>
                  {d.fullName}
                </option>
              ))}
            </Select>
          )}
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: 'Día' },
              { value: 'week', label: 'Semana' },
            ]}
          />
          {can(session, 'agenda.manage') && (
            <ButtonLink to={newAppointmentLink()} icon={<CalendarPlus size={16} />}>
              Nueva cita
            </ButtonLink>
          )}
        </div>
      </header>

      <div className="daystrip" style={{ marginBottom: 'var(--sp-4)' }}>
        <button type="button" className="icon-btn" onClick={() => setDay(addDays(week[0], -7))} aria-label="Semana anterior">
          <ChevronLeft size={18} />
        </button>
        {week.map((d) => {
          const count = appts.filter((a) => a.startsAt >= startOfDayClinicISO(d) && a.startsAt < startOfDayClinicISO(addDays(d, 1)) && a.status !== 'cancelled').length;
          return (
            <button key={d} type="button" className={['daystrip__day', d === day ? 'is-selected' : '', d === todayClinic() ? 'is-today' : '', !isWorkday(d) ? 'is-closed' : ''].filter(Boolean).join(' ')} onClick={() => setDay(d)} aria-pressed={d === day}>
              <span className="micro">{formatWeekday(startOfDayClinicISO(d))}</span>
              <span className="daystrip__num">{d.slice(-2)}</span>
              <span className="daystrip__count num">{count ? `${count} cita${count > 1 ? 's' : ''}` : ' '}</span>
            </button>
          );
        })}
        <button type="button" className="icon-btn" onClick={() => setDay(addDays(week[0], 7))} aria-label="Semana siguiente">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="between" style={{ marginBottom: 'var(--sp-3)' }}>
        <span className="h3">{formatDay(day, 'long')}</span>
        {!isToday && (
          <Button variant="ghost" size="sm" onClick={() => setDay(todayClinic())}>
            Hoy
          </Button>
        )}
      </div>

      {loading && !data ? (
        <SkeletonRows rows={6} />
      ) : view === 'day' ? (
        !isWorkday(day) && !dayAppts.length ? (
          <EmptyState icon={<CalendarX />} title="Sin consulta este día" text="La agenda está cerrada. Puede cambiar los días laborales en la configuración." />
        ) : (
          <div className="ledger-agenda">
            {slots.map((s, i) => {
              const nextTime = slots[i + 1]?.time ?? '24:00';
              const showNow = isToday && nowTime >= s.time && nowTime < nextTime;
              return (
                <div key={s.time} className={['slot', `slot--${s.state}`].join(' ')}>
                  {showNow && <div className="slot__now" />}
                  <div className="slot__time">{s.time}</div>
                  <div className="slot__body">
                    {s.appointment ? (
                      <ApptRow a={s.appointment} />
                    ) : s.state === 'free' && can(session, 'agenda.manage') ? (
                      <button type="button" className="slot__free" onClick={() => navigate(newAppointmentLink(s.time, s.startsAt))}>
                        Disponible
                      </button>
                    ) : (
                      <div className="slot__free">{s.state === 'past' ? 'Pasado' : 'Sin consulta'}</div>
                    )}
                  </div>
                </div>
              );
            })}
            {dayAppts
              .filter((a) => !slots.some((s) => s.appointment?.id === a.id))
              .map((a) => (
                <div key={a.id} className="slot slot--free">
                  <div className="slot__time">{formatTime(a.startsAt)}</div>
                  <div className="slot__body">
                    <ApptRow a={a} />
                  </div>
                </div>
              ))}
          </div>
        )
      ) : (
        <div className="stack">
          {week.map((d) => {
            const items = appts.filter((a) => a.startsAt >= startOfDayClinicISO(d) && a.startsAt < startOfDayClinicISO(addDays(d, 1)));
            return (
              <div key={d} className="card card--flush">
                <div className="queue__section">
                  <span className="eyebrow">{formatDay(d, 'medium')}</span>
                  <span className="badge-count">{items.length}</span>
                </div>
                {items.length ? (
                  items.map((a) => (
                    <div key={a.id} className="slot slot--free">
                      <div className="slot__time">{formatTime(a.startsAt)}</div>
                      <div className="slot__body">
                        <ApptRow a={a} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="small muted" style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
                    Sin citas
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {unconfirmed.length > 0 && can(session, 'agenda.manage') && (
        <div className="section" style={{ marginTop: 'var(--sp-8)' }}>
          <div className="section__head">
            <div className="h4">Por confirmar esta semana</div>
            <span className="small muted">{unconfirmed.length}</span>
          </div>
          {unconfirmed.slice(0, 8).map((a) => (
            <div key={a.id} className="file-row small">
              <span className="num muted">
                {formatDateShort(a.startsAt)} {formatTime(a.startsAt)}
              </span>
              <span className="grow strong truncate">{a.patientName}</span>
              <a className="btn btn--link" href={whatsappLink(a.patientPhone, confirmationMessage(a))} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
              <Button size="sm" variant="ghost" onClick={() => void run(a, { key: 'confirm', label: 'Confirmar', variant: 'secondary' })}>
                Confirmar
              </Button>
            </div>
          ))}
        </div>
      )}

      <Drawer
        open={Boolean(reschedule)}
        onClose={() => setReschedule(null)}
        title="Reagendar cita"
        subtitle={reschedule ? `${reschedule.patientName} · actualmente ${formatDay(reschedule.startsAt.slice(0, 10), 'medium')} ${formatTime(reschedule.startsAt)}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReschedule(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void doReschedule()} disabled={!newSlot} loading={busy === reschedule?.id}>
              Guardar nuevo horario
            </Button>
          </>
        }
      >
        {reschedule && <SlotPicker doctorUsername={reschedule.doctorUsername} value={newSlot} onChange={setNewSlot} excludeId={reschedule.id} />}
      </Drawer>

      <ConfirmModal
        open={Boolean(cancelFor)}
        onClose={() => setCancelFor(null)}
        onConfirm={doCancel}
        title="Cancelar cita"
        message={
          <Field label="Motivo" optional>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Ej. el paciente llamó para cancelar" />
          </Field>
        }
        confirmLabel="Cancelar cita"
        cancelLabel="Volver"
        danger
      />

      <Drawer
        open={Boolean(checkedIn)}
        onClose={() => setCheckedIn(null)}
        title="Paciente en consultorio"
        subtitle={checkedIn?.reused ? 'Ya tenía una visita abierta hoy; se reutilizó.' : 'Se creó la visita de hoy.'}
        footer={
          <Button
            onClick={() => {
              const id = checkedIn?.visit.id;
              setCheckedIn(null);
              if (id) navigate(`/panel/espera/${id}`);
            }}
          >
            Ir a sala de espera
          </Button>
        }
      >
        {checkedIn && <KioskCodeCard visit={checkedIn.visit} />}
      </Drawer>
    </div>
  );
};
