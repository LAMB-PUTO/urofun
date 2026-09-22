import { ArrowLeft, CalendarPlus, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Callout, Field, Input, OptionGroup, Select, Textarea, ToggleList, useToast } from '../../components/ui';
import { CLINIC } from '../../config/clinic';
import { SlotTakenError, createAppointment } from '../../data/appointments.repo';
import { listVisitsByPhone } from '../../data/visits.repo';
import { REASONS } from '../../domain/intake/catalog';
import type { ReasonKey } from '../../domain/intake/catalog';
import type { Appointment, Gender, Visit } from '../../domain/types';
import { useDoctors, useDocumentTitle } from '../../hooks/useUtil';
import { formatDateLong, formatTime } from '../../lib/dates';
import { formatMxPartial, maskName, normalizeMx, whatsappLink } from '../../lib/phone';
import { SlotPicker } from '../agenda/SlotPicker';
import type { SlotValue } from '../agenda/SlotPicker';

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const icsFor = (a: Appointment): string => {
  const start = new Date(a.startsAt);
  const end = new Date(start.getTime() + a.durationMinutes * 60_000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Urologia Funcional//ES', 'BEGIN:VEVENT', `UID:${a.id}`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`, `SUMMARY:Cita ${CLINIC.name} · ${a.doctorName}`, `LOCATION:${CLINIC.city}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
};

type Step = 'type' | 'data' | 'slot' | 'reason' | 'done';

export const BookingPage = () => {
  useDocumentTitle('Agendar cita');
  const navigate = useNavigate();
  const toast = useToast();
  const { doctors } = useDoctors();
  const [step, setStep] = useState<Step>('type');
  const [returning, setReturning] = useState<boolean | null>(null);
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [found, setFound] = useState<Visit | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [doctor, setDoctor] = useState('');
  const [slot, setSlot] = useState<SlotValue | null>(null);
  const [reasons, setReasons] = useState<ReasonKey[]>([]);
  const [comment, setComment] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Appointment | null>(null);

  useEffect(() => {
    if (!doctor && doctors.length) setDoctor(doctors[0].username);
  }, [doctors, doctor]);

  const key = normalizeMx(phone);

  const lookup = async () => {
    setBusy(true);
    setLookupError(null);
    try {
      const list = await listVisitsByPhone(key);
      const first = fold(firstName).split(/\s+/)[0];
      const match = list.find((v) => fold(v.personal.fullName).split(/\s+/)[0] === first);
      if (!match) {
        setLookupError('No encontramos un expediente con esos datos. Puede agendar como paciente nuevo.');
        return;
      }
      setFound(match);
      setFullName(match.personal.fullName);
      setGender(match.personal.gender);
      setAge(String(match.personal.age));
      setEmail(match.personal.email ?? '');
      setStep('slot');
    } catch {
      setLookupError('No se pudo buscar. Intente de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const dataValid = returning ? key.length === 10 && firstName.trim().length >= 2 : key.length === 10 && fullName.trim().split(/\s+/).length >= 2 && gender !== null && Number(age) > 0;
  const doctorObj = doctors.find((d) => d.username === doctor);

  const submit = async () => {
    if (!slot || !doctorObj || !consent) return;
    setBusy(true);
    try {
      const a = await createAppointment({
        patientName: fullName.trim(),
        patientPhone: key,
        patient: { age: Number(age) || found?.personal.age, gender: gender ?? undefined, email: email.trim() || undefined },
        doctorUsername: doctorObj.username,
        doctorName: doctorObj.fullName,
        startsAt: slot.startsAt,
        kind: found ? 'followup' : 'first',
        reasons: reasons.map((k) => REASONS.find((r) => r.key === k)!.label),
        notes: comment.trim() || undefined,
        source: 'web',
        prevVisitId: found?.id,
      });
      setDone(a);
      setStep('done');
    } catch (err) {
      if (err instanceof SlotTakenError) {
        toast.error('Ese horario se acaba de ocupar. Elija otro.');
        setSlot(null);
        setStep('slot');
      } else toast.error('No se pudo agendar. Intente de nuevo o escríbanos por WhatsApp.');
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (step === 'type') navigate('/');
    else if (step === 'data') setStep('type');
    else if (step === 'slot') setStep('data');
    else if (step === 'reason') setStep('slot');
  };

  const reasonItems = REASONS.filter((r) => !r.onlyFor || r.onlyFor === gender).map((r) => ({ key: r.key, label: r.label, gloss: r.description }));

  return (
    <div className="wizard">
      <header className="wizard__header">
        {step !== 'done' ? (
          <Button variant="ghost" icon={<ArrowLeft size={22} />} onClick={back} className="btn--lg">
            {step === 'type' ? 'Inicio' : 'Atrás'}
          </Button>
        ) : (
          <span />
        )}
        <div className="wizard__stepper">
          <div className="eyebrow">Agendar cita · {CLINIC.name}</div>
        </div>
        <span />
      </header>

      <div className="wizard__scroll">
        <div className="wizard__body">
          {step === 'type' && (
            <>
              <div className="wizard__question">
                <h2 className="h2">¿Es su primera cita con nosotros?</h2>
              </div>
              <OptionGroup
                value={returning === null ? null : returning ? 'no' : 'si'}
                onChange={(v) => {
                  setReturning(v === 'no');
                  setStep('data');
                }}
                options={[
                  { value: 'si', label: 'Sí, es mi primera vez' },
                  { value: 'no', label: 'No, ya tengo expediente' },
                ]}
              />
              <p className="small muted">
                También puede escribirnos por{' '}
                <a href={whatsappLink(CLINIC.whatsapp)} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
                .
              </p>
            </>
          )}

          {step === 'data' && (
            <>
              <div className="wizard__question">
                <h2 className="h2">{returning ? 'Busquemos su expediente.' : 'Sus datos de contacto.'}</h2>
              </div>
              <Field label="Teléfono (10 dígitos)">
                <Input inputMode="tel" mono value={formatMxPartial(phone)} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="667 123 4567" autoFocus />
              </Field>
              {returning ? (
                <>
                  <Field label="Su primer nombre">
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ej. Juan" />
                  </Field>
                  {lookupError && (
                    <Callout tone="warning">
                      {lookupError}{' '}
                      <Button variant="link" onClick={() => { setReturning(false); setLookupError(null); }}>
                        Agendar como nuevo
                      </Button>
                    </Callout>
                  )}
                </>
              ) : (
                <>
                  <Field label="Nombre completo">
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoCapitalize="words" placeholder="Nombre y apellidos" />
                  </Field>
                  <Field label="Sexo">
                    <OptionGroup
                      layout="inline"
                      value={gender}
                      onChange={setGender}
                      options={[
                        { value: 'Masculino' as const, label: 'Hombre' },
                        { value: 'Femenino' as const, label: 'Mujer' },
                      ]}
                    />
                  </Field>
                  <Field label="Edad">
                    <Input inputMode="numeric" maxLength={3} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} placeholder="Ej. 58" />
                  </Field>
                  <Field label="Correo electrónico" optional>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </Field>
                </>
              )}
            </>
          )}

          {step === 'slot' && (
            <>
              <div className="wizard__question">
                <h2 className="h2">{found ? `Bienvenido de nuevo, ${maskName(found.personal.fullName)}. Elija su horario.` : 'Elija doctor y horario.'}</h2>
              </div>
              {doctors.length > 1 && (
                <Field label="Doctor">
                  <Select value={doctor} onChange={(e) => { setDoctor(e.target.value); setSlot(null); }}>
                    {doctors.map((d) => (
                      <option key={d.username} value={d.username}>
                        {d.fullName}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {doctor && <SlotPicker doctorUsername={doctor} value={slot} onChange={setSlot} publicMode leadMinutes={CLINIC.onlineLeadMinutes} />}
            </>
          )}

          {step === 'reason' && (
            <>
              <div className="wizard__question">
                <h2 className="h2">¿Cuál es el motivo de su cita?</h2>
                <p className="muted">Puede elegir varias opciones. Los detalles se los preguntaremos en el consultorio.</p>
              </div>
              <ToggleList items={reasonItems} value={reasons} onChange={setReasons} />
              <Field label="Comentario" optional>
                <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ej. traigo estudios recientes" />
              </Field>
              <label className="consent">
                <input type="checkbox" className="visually-hidden" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span className="toggle__box" aria-hidden="true" style={{ marginTop: 4 }}>
                  <svg className="toggle__check" viewBox="0 0 24 24" style={{ opacity: consent ? 1 : 0, strokeDashoffset: 0 }}>
                    <path d="M5 12.5 10 17.5 19 7" />
                  </svg>
                </span>
                <span className="consent__text small">Acepto que mis datos de contacto y el motivo de consulta se usen únicamente para agendar y confirmar mi cita, conforme al aviso de privacidad del consultorio.</span>
              </label>
              {slot && doctorObj && (
                <Callout tone="info" title={`${formatDateLong(slot.startsAt)} · ${slot.time}`}>
                  {doctorObj.fullName}
                </Callout>
              )}
            </>
          )}

          {step === 'done' && done && (
            <div className="kiosk-done" style={{ minHeight: 0, padding: 0 }}>
              <svg className="success-check" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="28" />
                <path d="M20 33 28 41 44 25" />
              </svg>
              <div className="kiosk-done__text">
                <h1 className="h1">Cita agendada.</h1>
                <p className="lead">
                  {formatDateLong(done.startsAt)} a las {formatTime(done.startsAt)} con {done.doctorName}.
                </p>
                <p className="muted">Le pedimos llegar 10 minutos antes para llenar un breve cuestionario en la tablet del consultorio.</p>
              </div>
              <div className="row-wrap" style={{ justifyContent: 'center' }}>
                <a className="btn btn--secondary" href={`data:text/calendar;charset=utf-8,${encodeURIComponent(icsFor(done))}`} download="cita-urologia-funcional.ics">
                  <CalendarPlus size={18} /> Agregar al calendario
                </a>
                <a className="btn btn--ghost" href={whatsappLink(CLINIC.whatsapp, `Hola, agendé una cita para el ${formatDateLong(done.startsAt)} a las ${formatTime(done.startsAt)}.`)} target="_blank" rel="noreferrer">
                  <MessageCircle size={18} /> WhatsApp del consultorio
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {step !== 'done' && step !== 'type' && (
        <footer className="wizard__footer">
          <span className="wizard__hint">{step === 'slot' ? 'Horario de la clínica: ' + CLINIC.hours.start + ' a ' + CLINIC.hours.end : ' '}</span>
          {step === 'data' && (
            <Button size="lg" disabled={!dataValid} loading={busy} onClick={() => (returning ? void lookup() : setStep('slot'))}>
              {returning ? 'Buscar expediente' : 'Siguiente'}
            </Button>
          )}
          {step === 'slot' && (
            <Button size="lg" disabled={!slot} onClick={() => setStep('reason')}>
              Siguiente
            </Button>
          )}
          {step === 'reason' && (
            <Button size="lg" disabled={!consent || !slot} loading={busy} onClick={() => void submit()}>
              Confirmar cita
            </Button>
          )}
        </footer>
      )}
    </div>
  );
};
