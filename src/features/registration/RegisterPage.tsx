import { Check, MessageCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, Button, Callout, Field, Input, Segmented, Select, Tag, ToggleList, useToast } from '../../components/ui';
import { can } from '../../config/roles';
import { SlotTakenError, createAppointment } from '../../data/appointments.repo';
import { DuplicateOpenVisit, createVisit, groupPatients, listVisitsByPhone, skipIntake } from '../../data/visits.repo';
import { REASONS } from '../../domain/intake/catalog';
import type { ReasonKey } from '../../domain/intake/catalog';
import type { Gender, Patient, PersonalData, Visit } from '../../domain/types';
import { ageFromBirthDate } from '../../domain/types';
import { useDoctors, useDocumentTitle } from '../../hooks/useUtil';
import { buildIsoDate, formatDateLong, formatDateShort, formatTime } from '../../lib/dates';
import { formatMx, formatMxPartial, normalizeMx, whatsappLink } from '../../lib/phone';
import { confirmationMessage } from '../../services/agenda';
import { useSession } from '../../services/session';
import { SlotPicker } from '../agenda/SlotPicker';
import type { SlotValue } from '../agenda/SlotPicker';
import { actorOf } from '../shared/actor';
import { KioskCodeCard } from '../shared/KioskCodeCard';

type Arrival = 'here' | 'appointment' | 'now';

export const RegisterPage = () => {
  useDocumentTitle('Registrar paciente');
  const session = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const { doctors } = useDoctors();
  const actor = actorOf(session);
  const isDoctor = session?.role === 'doctor';

  const [phone, setPhone] = useState(params.get('phone') ?? '');
  const [existing, setExisting] = useState<Patient[]>([]);
  const [usePatient, setUsePatient] = useState<Patient | null | 'other'>(null);
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<Gender>('Masculino');
  const [birth, setBirth] = useState({ d: '', m: '', y: '' });
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [reasons, setReasons] = useState<ReasonKey[]>([]);
  const [doctor, setDoctor] = useState(params.get('doctor') ?? '');
  const [arrival, setArrival] = useState<Arrival>(params.get('mode') === 'cita' ? 'appointment' : 'here');
  const [slot, setSlot] = useState<SlotValue | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ visit?: Visit; appointmentText?: string; appointmentPhone?: string } | null>(null);
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    if (!doctor && doctors.length) setDoctor(isDoctor && session?.username ? session.username : doctors[0].username);
  }, [doctors, doctor, isDoctor, session?.username]);

  useEffect(() => {
    const day = params.get('date');
    const time = params.get('time');
    const starts = params.get('startsAt');
    if (day && time && starts) setSlot({ day, time, startsAt: starts });
  }, [params]);

  const key = normalizeMx(phone);
  useEffect(() => {
    setUsePatient(null);
    if (key.length !== 10) {
      setExisting([]);
      return;
    }
    let alive = true;
    listVisitsByPhone(key)
      .then((list) => alive && setExisting(groupPatients(list)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key]);

  const applyPatient = (p: Patient) => {
    setUsePatient(p);
    setFullName(p.personal.fullName);
    setGender(p.personal.gender);
    if (p.personal.birthDate) {
      const [y, m, d] = p.personal.birthDate.split('-');
      setBirth({ d, m, y });
    } else setAge(String(p.personal.age || ''));
    setEmail(p.personal.email ?? '');
  };

  const birthDate = buildIsoDate(birth.d, birth.m, birth.y);
  const computedAge = birthDate ? ageFromBirthDate(birthDate) : age ? Number(age) : null;
  const doctorObj = doctors.find((d) => d.username === doctor);
  const reasonLabels = reasons.map((k) => REASONS.find((r) => r.key === k)!.label);
  const valid = key.length === 10 && fullName.trim().split(/\s+/).length >= 2 && computedAge !== null && computedAge >= 0 && Boolean(doctor) && (arrival !== 'appointment' || Boolean(slot));

  const personal = (): PersonalData => ({
    fullName: fullName.trim().replace(/\s+/g, ' '),
    phone: key,
    gender,
    age: computedAge ?? 0,
    birthDate: birthDate ?? undefined,
    email: email.trim() || undefined,
    isFirstTime: !(usePatient && usePatient !== 'other'),
  });

  const prev = usePatient && usePatient !== 'other' ? usePatient.latestVisit : undefined;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (arrival === 'appointment') {
        const a = await createAppointment({
          patientName: personal().fullName,
          patientPhone: key,
          patient: { age: computedAge ?? undefined, gender, email: email.trim() || undefined, birthDate: birthDate ?? undefined },
          doctorUsername: doctor,
          doctorName: doctorObj?.fullName ?? doctor,
          startsAt: slot!.startsAt,
          kind: prev ? 'followup' : 'first',
          reasons: reasonLabels,
          notes: notes.trim() || undefined,
          source: isDoctor ? 'doctor' : 'phone',
          createdBy: session?.username ?? session?.fullName,
          prevVisitId: prev?.id,
        });
        setCreated({ appointmentText: confirmationMessage(a), appointmentPhone: key });
        toast.success(`Cita agendada para el ${formatDateLong(a.startsAt)} a las ${formatTime(a.startsAt)}.`);
        return;
      }
      const v = await createVisit({
        personal: personal(),
        status: arrival === 'now' ? 'in_consultation' : 'arrived',
        kind: prev ? 'followup' : 'first',
        source: isDoctor ? 'doctor' : 'reception',
        by: actor,
        intakeMode: arrival === 'now' ? 'staff' : 'tablet',
        prevVisitId: prev?.id,
        preferredDoctor: doctor,
        doctorUsername: arrival === 'now' ? session?.username : doctor,
        withKioskCode: arrival === 'here',
        phoneCollision: usePatient === 'other' && existing.length > 0,
      });
      if (arrival === 'now') {
        navigate(`/panel/consulta/${v.id}`);
        return;
      }
      setCreated({ visit: v });
    } catch (err) {
      if (err instanceof DuplicateOpenVisit) {
        toast.error('Este paciente ya tiene una visita abierta hoy.', { action: { label: 'Ver en sala', onClick: () => navigate(`/panel/espera/${err.existing.id}`) } });
      } else if (err instanceof SlotTakenError) {
        toast.error('Ese horario se acaba de ocupar. Elija otro.');
        setSlot(null);
      } else toast.error('No se pudo registrar.', { message: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const doSkip = async () => {
    if (!created?.visit) return;
    setSkipping(true);
    try {
      await skipIntake(created.visit.id, actor);
      toast.success('Paciente en sala de espera sin cuestionario.');
      navigate(`/panel/espera/${created.visit.id}`);
    } catch (err) {
      toast.error('No se pudo pasar a sala.', { message: err instanceof Error ? err.message : undefined });
    } finally {
      setSkipping(false);
    }
  };

  /** Formulario en blanco para el siguiente paciente (conserva el doctor). */
  const resetForm = () => {
    setCreated(null);
    setPhone('');
    setExisting([]);
    setUsePatient(null);
    setFullName('');
    setGender('Masculino');
    setBirth({ d: '', m: '', y: '' });
    setAge('');
    setEmail('');
    setReasons([]);
    setArrival('here');
    setSlot(null);
    setNotes('');
  };

  const reasonItems = useMemo(() => REASONS.filter((r) => !r.onlyFor || r.onlyFor === gender).map((r) => ({ key: r.key, label: r.short })), [gender]);

  if (created) {
    return (
      <div className="page">
        <header className="page__header">
          <div className="page__title">
            <h1 className="h1">{created.visit ? 'Paciente registrado' : 'Cita agendada'}</h1>
          </div>
        </header>
        <div className="card stack" style={{ maxWidth: 640 }}>
          {created.visit ? (
            <>
              <div className="row">
                <Avatar name={created.visit.personal.fullName} size="lg" />
                <div>
                  <div className="h3">{created.visit.personal.fullName}</div>
                  <div className="small muted">
                    {created.visit.personal.age} años · {created.visit.personal.gender} · {formatMx(created.visit.personal.phone)}
                  </div>
                </div>
              </div>
              <KioskCodeCard visit={created.visit} onSkipIntake={doSkip} skipping={skipping} />
              <div className="row-wrap">
                <Button onClick={() => navigate(`/panel/espera/${created.visit!.id}`)}>Ir a sala de espera</Button>
                <Button variant="ghost" onClick={resetForm}>
                  Registrar otro
                </Button>
              </div>
            </>
          ) : (
            <>
              <Callout tone="info" icon={<Check size={20} />} title="Confirmación lista para enviar">
                <p className="small">{created.appointmentText}</p>
              </Callout>
              <div className="row-wrap">
                <a className="btn btn--secondary" href={whatsappLink(created.appointmentPhone!, created.appointmentText)} target="_blank" rel="noreferrer">
                  <MessageCircle size={16} /> Enviar por WhatsApp
                </a>
                <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(created.appointmentText!)}>
                  Copiar mensaje
                </Button>
                <Link className="btn btn--ghost" to="/panel/agenda">
                  Ver agenda
                </Link>
                <Button variant="ghost" onClick={resetForm}>
                  Registrar otro
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page__header">
        <div className="page__title">
          <h1 className="h1">Registrar paciente</h1>
          <span className="small muted">Teléfono primero: si ya existe, se precarga el expediente.</span>
        </div>
      </header>

      <form
        className="stack-6"
        style={{ maxWidth: 760 }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="card stack">
          <Field label="Teléfono (10 dígitos)">
            <Input inputMode="tel" mono value={formatMxPartial(phone)} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} autoFocus placeholder="667 123 4567" autoComplete="off" />
          </Field>
          {existing.length > 0 && usePatient === null && (
            <div className="stack-2">
              <div className="small strong">Ya existe expediente con este teléfono:</div>
              {existing.map((p) => (
                <button key={p.key + p.personal.fullName} type="button" className="lookup-result" onClick={() => applyPatient(p)}>
                  <Avatar name={p.personal.fullName} />
                  <span className="grow">
                    <span className="strong">{p.personal.fullName}</span>
                    <span className="small muted" style={{ display: 'block' }}>
                      {p.visits.length} visita{p.visits.length > 1 ? 's' : ''} · última {formatDateShort(p.lastVisitAt)} · {p.personal.age} años
                    </span>
                  </span>
                  <span className="btn btn--secondary btn--sm">Usar expediente</span>
                </button>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setUsePatient('other')}>
                Es otra persona con el mismo teléfono
              </Button>
            </div>
          )}
          {usePatient && usePatient !== 'other' && (
            <Callout tone="info" title={`Expediente de ${usePatient.personal.fullName}`}>
              <span className="small">Se registrará como visita subsecuente.</span>
            </Callout>
          )}
        </div>

        <div className="card stack">
          <div className="two-col">
            <Field label="Nombre completo">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoCapitalize="words" placeholder="Nombre y apellidos" />
            </Field>
            <Field label="Sexo">
              <Segmented
                block
                value={gender}
                onChange={setGender}
                options={[
                  { value: 'Masculino', label: 'Hombre' },
                  { value: 'Femenino', label: 'Mujer' },
                ]}
              />
            </Field>
          </div>
          <div className="two-col">
            <Field label="Fecha de nacimiento" help={birthDate ? `${computedAge} años` : 'DD / MM / AAAA'}>
              <div className="dob">
                <Input inputMode="numeric" maxLength={2} placeholder="DD" value={birth.d} onChange={(e) => setBirth({ ...birth, d: e.target.value.replace(/\D/g, '') })} />
                <Input inputMode="numeric" maxLength={2} placeholder="MM" value={birth.m} onChange={(e) => setBirth({ ...birth, m: e.target.value.replace(/\D/g, '') })} />
                <Input inputMode="numeric" maxLength={4} placeholder="AAAA" value={birth.y} onChange={(e) => setBirth({ ...birth, y: e.target.value.replace(/\D/g, '') })} />
              </div>
            </Field>
            <Field label="Edad (si no tiene la fecha)" optional>
              <Input inputMode="numeric" maxLength={3} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} disabled={Boolean(birthDate)} placeholder="Ej. 58" />
            </Field>
          </div>
          <Field label="Correo electrónico" optional>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
          </Field>
        </div>

        <div className="card stack">
          <Field label="Motivo de consulta" optional help="El paciente lo puede completar en la tablet.">
            <ToggleList items={reasonItems} value={reasons} onChange={setReasons} grid />
          </Field>
          <Field label="Doctor">
            <Select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
              {doctors.map((d) => (
                <option key={d.username} value={d.username}>
                  {d.fullName}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="card stack">
          <Field label="¿Cómo llega?">
            <Segmented
              block
              value={arrival}
              onChange={setArrival}
              options={[
                { value: 'here', label: 'Está aquí' },
                { value: 'appointment', label: 'Agendar cita' },
                ...(isDoctor && can(session, 'visit.attend') ? [{ value: 'now' as Arrival, label: 'Atender ahora' }] : []),
              ]}
            />
          </Field>
          {arrival === 'here' && <p className="small muted">Se crea la visita de hoy y un código de 4 dígitos para que llene el cuestionario en la tablet.</p>}
          {arrival === 'now' && <p className="small muted">Se abre la consulta de inmediato sin cuestionario; puede mandarlo a la tablet después.</p>}
          {arrival === 'appointment' && doctor && (
            <>
              <SlotPicker doctorUsername={doctor} value={slot} onChange={setSlot} initialDay={params.get('date') ?? undefined} />
              {slot && (
                <Tag navy>
                  {formatDateLong(slot.startsAt)} · {slot.time}
                </Tag>
              )}
              <Field label="Nota para la cita" optional>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. trae estudios de laboratorio" />
              </Field>
            </>
          )}
        </div>

        <div className="row-wrap">
          <Button type="submit" size="lg" disabled={!valid} loading={busy}>
            {arrival === 'here' ? 'Registrar llegada' : arrival === 'appointment' ? 'Agendar cita' : 'Registrar y atender'}
          </Button>
          <Link to="/panel/espera" className="btn btn--ghost">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
};
