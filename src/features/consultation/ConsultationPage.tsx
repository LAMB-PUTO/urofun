import { ArrowLeft, BookOpen, Printer, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar, Button, Callout, Chip, ConfirmModal, Drawer, Field, Input, Skeleton, Tag, Textarea, Toggle, VisitStatusChip, useToast } from '../../components/ui';
import { SlotTakenError, createAppointment, transitionAppointment } from '../../data/appointments.repo';
import { uploadPatientFile } from '../../data/files.repo';
import { useTableSubscription } from '../../data/realtime';
import { TABLES } from '../../data/supabase';
import { addFile, appendResearch, emptyNotes, getVisit, returnToWaiting, saveConsultation, saveNoteDraft, setFollowUp as saveFollowUp, startConsultation } from '../../data/visits.repo';
import type { MedicalNotes, Visit, Vitals } from '../../domain/types';
import { useDictation } from '../../hooks/useDictation';
import { useDoctors, useDocumentTitle, useHotkey } from '../../hooks/useUtil';
import { formatDateTime, formatDay, formatTime } from '../../lib/dates';
import { formatMx } from '../../lib/phone';
import { regenerateSummary } from '../../services/ai/summaryJob';
import { caseContext } from '../../services/ai/research';
import { useSession } from '../../services/session';
import { SlotPicker } from '../agenda/SlotPicker';
import type { SlotValue } from '../agenda/SlotPicker';
import { ResearchPanel } from '../research/ResearchPanel';
import { actorOf } from '../shared/actor';
import { VisitContextPanel, usePreviousVisit, visitReasons } from '../shared/VisitContext';
import { DictationButton, insertAtCaret } from './DictationButton';

type NoteFields = Pick<MedicalNotes, 'currentIllness' | 'interrogation' | 'physicalExam' | 'diagnosis' | 'prescription' | 'recommendations'>;
const TEXT_FIELDS: Array<{ key: keyof NoteFields; label: string; required?: boolean; placeholder: string; rows: number }> = [
  { key: 'currentIllness', label: 'Padecimiento actual', required: true, placeholder: 'Descripción del padecimiento por el que acude hoy…', rows: 4 },
  { key: 'interrogation', label: 'Interrogatorio por aparatos y sistemas', placeholder: 'Síntomas generales, cardiovascular, digestivo…', rows: 3 },
  { key: 'physicalExam', label: 'Exploración física', required: true, placeholder: 'Aspecto general, abdomen, genitales, tacto rectal…', rows: 4 },
  { key: 'diagnosis', label: 'Diagnóstico clínico', required: true, placeholder: 'Ej. Hiperplasia prostática benigna con LUTS moderados', rows: 3 },
  { key: 'prescription', label: 'Receta', required: true, placeholder: 'Ej. Tamsulosina 0.4 mg, 1 cápsula cada 24 h por 30 días', rows: 5 },
  { key: 'recommendations', label: 'Recomendaciones', placeholder: 'Ej. Ingesta de 2 L de agua al día, evitar irritantes vesicales', rows: 3 },
];

const VITALS: Array<{ key: keyof Vitals; label: string; unit: string; placeholder: string }> = [
  { key: 'ta', label: 'TA', unit: 'mmHg', placeholder: '120/80' },
  { key: 'fc', label: 'FC', unit: 'lpm', placeholder: '72' },
  { key: 'fr', label: 'FR', unit: 'rpm', placeholder: '16' },
  { key: 'temp', label: 'Temp', unit: '°C', placeholder: '36.5' },
  { key: 'peso', label: 'Peso', unit: 'kg', placeholder: '78' },
  { key: 'talla', label: 'Talla', unit: 'cm', placeholder: '172' },
];

const vitalsToString = (v: Vitals): string =>
  VITALS.filter((x) => v[x.key]?.trim())
    .map((x) => `${x.label}: ${v[x.key]!.trim()} ${x.unit}`)
    .join(', ');

const localKey = (id: string) => `uf.note.${id}`;

export const ConsultationPage = () => {
  const { visitId } = useParams();
  const session = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const actor = actorOf(session);
  const { doctors } = useDoctors();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notes, setNotes] = useState<MedicalNotes>(emptyNotes());
  const [vitals, setVitals] = useState<Vitals>({});
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<'finish' | 'return' | 'start' | 'upload' | null>(null);
  const [followUp, setFollowUp] = useState(false);
  const [slot, setSlot] = useState<SlotValue | null>(null);
  const [researchOpen, setResearchOpen] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  /** Cambios sin guardar en el servidor (independiente del autosave local). */
  const remoteDirty = useRef(false);
  /** Mientras se cierra o se devuelve a sala, el autosave remoto se detiene. */
  const finishing = useRef(false);
  const dictation = useDictation();
  const previous = usePreviousVisit(visit);
  useDocumentTitle(visit ? `Consulta · ${visit.personal.fullName}` : 'Consulta');

  const load = useCallback(async () => {
    if (!visitId) return;
    try {
      const v = await getVisit(visitId);
      if (!v) return setLoadError('La visita no existe.');
      setVisit(v);
      const remote = v.notes?.draft;
      let local: (Partial<MedicalNotes> & { savedAt?: string }) | null = null;
      try {
        const raw = localStorage.getItem(localKey(v.id));
        local = raw ? JSON.parse(raw) : null;
      } catch {
        local = null;
      }
      const base: MedicalNotes = v.status === 'completed' && v.notes ? v.notes : emptyNotes();
      const pick = local && (!remote?.savedAt || (local.savedAt ?? '') > remote.savedAt) ? local : remote;
      const merged: MedicalNotes = { ...base, ...(v.status === 'completed' ? {} : pick ?? {}) };
      setNotes(merged);
      setVitals(merged.vitals ?? {});
      if (merged.nextAppointment) setFollowUp(true);
      setSavedAt(pick?.savedAt ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo cargar.');
    }
  }, [visitId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Si el cuestionario o el resumen llegan mientras la consulta está abierta, el contexto se actualiza sin tocar la nota.
  useTableSubscription(
    [TABLES.visits],
    () => {
      if (!visitId || finishing.current) return;
      getVisit(visitId)
        .then((v) => {
          if (!v) return;
          setVisit((prev) => (prev && prev.status === v.status && prev.ai.status === v.ai.status && Boolean(prev.intake) === Boolean(v.intake) && prev.files.length === v.files.length ? prev : v));
        })
        .catch(() => undefined);
    },
    30_000,
  );

  const markDirty = () => {
    setDirty(true);
    remoteDirty.current = true;
  };

  const update = (patch: Partial<MedicalNotes>) => {
    setNotes((n) => ({ ...n, ...patch }));
    markDirty();
  };

  // autosave local (1 s) + remoto (10 s)
  useEffect(() => {
    if (!visit || !dirty || visit.status === 'completed') return;
    const draft = { ...notes, vitals, vitalSigns: vitalsToString(vitals), savedAt: new Date().toISOString() };
    const t = setTimeout(() => {
      try {
        localStorage.setItem(localKey(visit.id), JSON.stringify(draft));
      } catch {
        /* sin almacenamiento */
      }
      setSavedAt(draft.savedAt);
    }, 1000);
    return () => clearTimeout(t);
  }, [notes, vitals, dirty, visit]);

  useEffect(() => {
    if (!visit || visit.status === 'completed') return;
    const t = setInterval(() => {
      if (!remoteDirty.current || finishing.current) return;
      remoteDirty.current = false;
      saveNoteDraft(visit.id, { ...notes, vitals, vitalSigns: vitalsToString(vitals) }).catch(() => {
        remoteDirty.current = true;
      });
    }, 10_000);
    return () => clearInterval(t);
  }, [visit, notes, vitals]);

  const otherDoctor = Boolean(visit && visit.status === 'in_consultation' && visit.meta.doctorUsername && visit.meta.doctorUsername !== session?.username && !session?.isAdmin);
  const canWrite = Boolean(visit && visit.status === 'in_consultation' && !otherDoctor);

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!vitalsToString(vitals)) m.push('Signos vitales');
    for (const f of TEXT_FIELDS) if (f.required && !notes[f.key]?.trim()) m.push(f.label);
    return m;
  }, [notes, vitals]);

  const finish = async () => {
    if (!visit || missing.length || !canWrite) return;
    setBusy('finish');
    finishing.current = true;
    try {
      // 1) Primero la nota: si falla, no queda ninguna cita huérfana.
      const final: MedicalNotes = { ...notes, vitals, vitalSigns: vitalsToString(vitals), nextAppointment: followUp ? notes.nextAppointment : undefined, nextAppointmentId: undefined };
      await saveConsultation(visit.id, final, actor);
      // 2) Después la cita de seguimiento; si el horario se ocupó, la consulta ya quedó cerrada y se avisa.
      let followText = '';
      if (followUp && slot) {
        try {
          const doctorObj = doctors.find((d) => d.username === session?.username);
          const a = await createAppointment({
            patientName: visit.personal.fullName,
            patientPhone: visit.personal.phone,
            patient: { age: visit.personal.age, gender: visit.personal.gender, email: visit.personal.email, birthDate: visit.personal.birthDate },
            doctorUsername: session?.username ?? visit.meta.doctorUsername ?? '',
            doctorName: doctorObj?.fullName ?? session?.fullName ?? '',
            startsAt: slot.startsAt,
            kind: 'followup',
            reasons: visitReasons(visit),
            source: 'followup',
            createdBy: session?.username,
            prevVisitId: visit.id,
          });
          await saveFollowUp(visit.id, { nextAppointment: a.startsAt, nextAppointmentId: a.id }).catch(() => undefined);
          followText = ` · Próxima cita ${formatDay(slot.day, 'medium')} ${slot.time}`;
        } catch (err) {
          toast.error('La consulta se cerró, pero la cita de seguimiento no se pudo agendar.', {
            message: err instanceof SlotTakenError ? 'Ese horario se acaba de ocupar. Agende otro desde la agenda.' : err instanceof Error ? err.message : undefined,
            action: { label: 'Ir a agenda', onClick: () => navigate(`/panel/registrar?mode=cita&phone=${visit.personal.phone}`) },
          });
        }
      }
      if (visit.meta.appointmentId) transitionAppointment(visit.meta.appointmentId, 'completed', 'system').catch(() => undefined);
      try {
        localStorage.removeItem(localKey(visit.id));
      } catch {
        /* nada */
      }
      toast.success(`Consulta cerrada${followText}.`, { action: { label: 'Ver PDF', onClick: () => window.open(`/expediente/${visit.id}/print`, '_blank') } });
      navigate('/panel/espera');
    } catch (err) {
      finishing.current = false;
      toast.error('No se pudo cerrar la consulta.', { message: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
      setConfirmFinish(false);
    }
  };

  useHotkey('mod+enter', () => {
    if (canWrite && !missing.length) setConfirmFinish(true);
  });

  const start = async () => {
    if (!visit) return;
    setBusy('start');
    try {
      setVisit(await startConsultation(visit.id, actor));
    } catch (err) {
      toast.error('No se pudo iniciar la consulta.', { message: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const back = async () => {
    if (!visit) return;
    setBusy('return');
    finishing.current = true;
    try {
      await saveNoteDraft(visit.id, { ...notes, vitals, vitalSigns: vitalsToString(vitals) });
      await returnToWaiting(visit.id, actor);
      navigate('/panel/espera');
    } catch (err) {
      finishing.current = false;
      toast.error('No se pudo devolver a sala.', { message: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const bringSummary = () => {
    if (!visit) return;
    const reasons = visitReasons(visit).join(', ');
    const labels = Object.values(visit.intake?.symptomLabels ?? visit.legacyIntake?.symptomLabels ?? {})
      .flat()
      .filter(Boolean)
      .join('; ');
    const text = [reasons && `Acude por ${reasons.toLowerCase()}.`, labels && `Refiere: ${labels}.`, visit.intake?.otherTopics && `Otros temas: ${visit.intake.otherTopics}`].filter(Boolean).join(' ');
    update({ currentIllness: insertAtCaret(refs.current.currentIllness, notes.currentIllness, text) });
  };

  const onFiles = async (files: FileList | null) => {
    if (!visit || !files?.length) return;
    setBusy('upload');
    try {
      let list = visit.files;
      for (const f of Array.from(files)) {
        const meta = await uploadPatientFile(f, visit.id);
        list = await addFile(visit.id, { ...meta, uploadedBy: session?.username });
      }
      setVisit({ ...visit, files: list });
      toast.success(`${files.length} archivo${files.length > 1 ? 's' : ''} agregado${files.length > 1 ? 's' : ''}.`);
    } catch (err) {
      toast.error('No se pudo subir el archivo.', { message: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const retryAi = async () => {
    if (!visit) return;
    setRetrying(true);
    try {
      const v = await regenerateSummary(visit.id);
      if (v) setVisit(v);
    } finally {
      setRetrying(false);
    }
  };

  if (loadError) {
    return (
      <div className="page">
        <Callout tone="warning" title="No se pudo abrir la consulta">
          {loadError}
        </Callout>
        <Link to="/panel/espera" className="btn btn--ghost">
          Volver a sala
        </Link>
      </div>
    );
  }
  if (!visit) {
    return (
      <div className="page">
        <Skeleton lines={6} />
      </div>
    );
  }

  const readOnly = visit.status === 'completed';

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 'var(--sp-4)' }}>
        <Link to="/panel/espera" className="btn btn--ghost btn--sm">
          <ArrowLeft size={16} /> Sala de espera
        </Link>
      </div>

      <div className="consult">
        <aside className="consult__context">
          <div className="card stack">
            <div className="row">
              <Avatar name={visit.personal.fullName} size="lg" />
              <div className="stack-2" style={{ gap: 2 }}>
                <h1 className="h2">{visit.personal.fullName}</h1>
                <div className="small muted num">
                  {visit.personal.age} años · {visit.personal.gender} · {formatMx(visit.personal.phone)}
                </div>
                <div className="row-wrap">
                  <VisitStatusChip status={visit.status} />
                  {visit.meta.kind === 'followup' ? <Tag>Subsecuente</Tag> : <Tag>Primera vez</Tag>}
                  {previous && <Tag>Última visita {formatDay(previous.createdAt.slice(0, 10), 'short')}</Tag>}
                </div>
              </div>
            </div>
          </div>
          <VisitContextPanel visit={visit} previous={previous} clinical onRetryAi={retryAi} retrying={retrying} />
          <div className="section">
            <div className="section__head">
              <div className="h4">Estudios y archivos</div>
            </div>
            <label className="dropzone">
              <UploadCloud size={24} />
              <span className="small">{busy === 'upload' ? 'Subiendo…' : 'Toque para subir laboratorios, imágenes o recetas'}</span>
              <input type="file" multiple className="visually-hidden" onChange={(e) => void onFiles(e.target.files)} disabled={busy === 'upload'} />
            </label>
          </div>
        </aside>

        <section className="consult__note">
          <div className="between">
            <div>
              <div className="eyebrow">Nota de consulta · NOM-004</div>
              <div className="small muted num">
                {notes.startedAt ? `Inicio ${formatDateTime(notes.startedAt)}` : formatDateTime(new Date())} · {session?.fullName}
              </div>
            </div>
            <div className="row-wrap">
              <Button variant="secondary" size="sm" icon={<BookOpen size={14} />} onClick={() => setResearchOpen(true)}>
                Investigar caso
              </Button>
              <a className="btn btn--ghost btn--sm" href={`/expediente/${visit.id}/print`} target="_blank" rel="noreferrer">
                <Printer size={14} /> PDF
              </a>
            </div>
          </div>

          {readOnly && <Callout tone="neutral" title="Consulta cerrada">Esta nota ya fue guardada{notes.savedAt ? ` el ${formatDateTime(notes.savedAt)}` : ''}. Se muestra en modo lectura.</Callout>}
          {otherDoctor && <Callout tone="warning" title={`En consulta con ${visit.meta.doctorUsername}`}>Otro doctor tiene abierta esta consulta.</Callout>}
          {(visit.status === 'waiting' || visit.status === 'arrived') && (
            <Callout tone="info" title="La consulta no ha iniciado">
              <div className="row-wrap" style={{ marginTop: 'var(--sp-2)' }}>
                <Button size="sm" onClick={() => void start()} loading={busy === 'start'}>
                  Iniciar consulta
                </Button>
              </div>
            </Callout>
          )}

          <nav className="consult__nav" aria-label="Secciones de la nota">
            <a href="#vitales">Signos vitales</a>
            {TEXT_FIELDS.map((f) => (
              <a key={f.key} href={`#${f.key}`}>
                {f.label.split(' ')[0]}
              </a>
            ))}
            <a href="#proxima">Próxima cita</a>
          </nav>

          <fieldset className="fieldset stack" disabled={!canWrite && !readOnly ? true : readOnly}>
            <div className="section" id="vitales">
              <div className="section__head">
                <div className="h4">Signos vitales</div>
              </div>
              <div className="vitals">
                {VITALS.map((v) => (
                  <Field key={v.key} label={v.label}>
                    <Input mono unit={v.unit} placeholder={v.placeholder} value={vitals[v.key] ?? ''} onChange={(e) => { setVitals({ ...vitals, [v.key]: e.target.value }); markDirty(); }} />
                  </Field>
                ))}
              </div>
            </div>

            {TEXT_FIELDS.map((f) => (
              <div key={f.key} className="section" id={f.key}>
                <Field
                  label={
                    <span className="row-2">
                      {f.label}
                      {f.required && <span className="muted">*</span>}
                    </span>
                  }
                  corner={
                    !readOnly && (
                      <span className="row-2">
                        {f.key === 'currentIllness' && (
                          <Button size="sm" variant="ghost" onClick={bringSummary}>
                            Traer del cuestionario
                          </Button>
                        )}
                        <DictationButton field={f.key} dictation={dictation} textareaRef={{ current: refs.current[f.key] ?? null }} value={notes[f.key]} onChange={(v) => update({ [f.key]: v })} />
                      </span>
                    )
                  }
                >
                  <Textarea
                    ref={(el) => {
                      refs.current[f.key] = el;
                    }}
                    rows={f.rows}
                    value={notes[f.key]}
                    onChange={(e) => update({ [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                  />
                </Field>
              </div>
            ))}

            <div className="section" id="proxima">
              <div className="section__head">
                <div className="h4">Próxima cita</div>
              </div>
              {readOnly ? (
                <p className="small">{notes.nextAppointment ? `${formatDay(notes.nextAppointment.slice(0, 10), 'long')} ${notes.nextAppointment.length > 10 ? formatTime(notes.nextAppointment) : ''}` : 'Sin cita de seguimiento.'}</p>
              ) : (
                <div className="stack">
                  <Toggle checked={followUp} onChange={setFollowUp} label="Agendar cita de seguimiento" gloss="Se crea en la agenda al cerrar la consulta." />
                  {followUp && session?.username && <SlotPicker doctorUsername={session.username} value={slot} onChange={setSlot} />}
                  {followUp && slot && (
                    <Chip tone="info">
                      {formatDay(slot.day, 'long')} · {slot.time}
                    </Chip>
                  )}
                </div>
              )}
            </div>
          </fieldset>

          {dictation.error && (
            <Callout tone="warning" title="Dictado">
              {dictation.error}{' '}
              {dictation.canRetry && (
                <Button size="sm" variant="ghost" onClick={() => void dictation.retry((t, f) => update({ [f]: insertAtCaret(refs.current[f], notes[f as keyof NoteFields], t) } as Partial<MedicalNotes>))}>
                  Reintentar transcripción
                </Button>
              )}
            </Callout>
          )}

          {!readOnly && (
            <div className="consult__bar">
              <span className="small muted num">{savedAt ? `Borrador guardado ${formatTime(savedAt)}` : 'Sin cambios'}</span>
              <div className="row-wrap">
                {visit.status === 'in_consultation' && (
                  <Button variant="ghost" onClick={() => void back()} loading={busy === 'return'} disabled={!canWrite}>
                    Devolver a sala
                  </Button>
                )}
                <Button onClick={() => setConfirmFinish(true)} disabled={!canWrite || missing.length > 0} title={missing.length ? `Faltan: ${missing.join(', ')}` : 'Ctrl + Enter'}>
                  Terminar consulta
                </Button>
              </div>
            </div>
          )}
          {!readOnly && missing.length > 0 && canWrite && <div className="small muted">Para cerrar faltan: {missing.join(', ')}.</div>}
        </section>
      </div>

      <ConfirmModal open={confirmFinish} onClose={() => setConfirmFinish(false)} onConfirm={finish} title="Terminar consulta" message={followUp && slot ? `Se guardará la nota y se agendará el seguimiento el ${formatDay(slot.day, 'long')} a las ${slot.time}.` : 'Se guardará la nota y el paciente pasará al historial.'} confirmLabel="Guardar y cerrar" />

      <Drawer open={researchOpen} onClose={() => setResearchOpen(false)} title="Investigar caso" subtitle="Contexto desidentificado: sin nombre ni datos de contacto." size="lg">
        <ResearchPanel
          context={caseContext({ ...visit, notes: { ...(visit.notes ?? emptyNotes()), diagnosis: notes.diagnosis } })}
          compact
          onInsert={(text, sources) => {
            update({ recommendations: insertAtCaret(refs.current.recommendations, notes.recommendations, text) });
            appendResearch(visit.id, { query: text.slice(0, 120), answer: text, sources, at: new Date().toISOString() }).catch(() => undefined);
            setResearchOpen(false);
            toast.success('Texto insertado en Recomendaciones.');
          }}
        />
      </Drawer>
    </div>
  );
};
