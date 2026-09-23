import { ArrowLeft, HelpCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { isReducedMotion } from '../../app/layouts/KioskLayout';
import { Button, Modal, Stepper, useToast } from '../../components/ui';
import { CLINIC } from '../../config/clinic';
import { DuplicateOpenVisit, completeIntake, createVisit, getVisit, listVisitsByPhone, saveWizardDraft } from '../../data/visits.repo';
import { TransitionRejected } from '../../domain/status';
import { SECTION_LABEL, buildIntake, buildPersonal, computeSteps, initialWizardState, sectionProgress, sectionsOf, stepBlocker, wizardStateFromVisit } from '../../domain/intake/formModel';
import type { SectionKey, WizardMode, WizardState } from '../../domain/intake/formModel';
import { OPEN_VISIT_STATUSES } from '../../domain/types';
import type { Visit } from '../../domain/types';
import { useDocumentTitle, useIdleTimer } from '../../hooks/useUtil';
import { ensureSummary } from '../../services/ai/summaryJob';
import { normalizeMx } from '../../lib/phone';
import { firstName } from '../../lib/text';
import { clearDraft, readDraft, takePrefillPhone, writeDraft } from './kioskDraft';
import { StepRenderer, stepCaption } from './steps';

const KIOSK_ACTOR = { role: 'patient' as const };

/** Índice del paso a reanudar: por clave si existe en la lista, si no el índice guardado. */
const resumeIndex = (state: WizardState, mode: WizardMode, key: string | undefined, fallback: number): number => {
  const steps = computeSteps(state, mode);
  const i = key ? steps.findIndex((s) => s.key === key) : -1;
  return i >= 0 ? i : Math.max(0, Math.min(fallback, steps.length - 1));
};

type Boot =
  | { status: 'loading' }
  | { status: 'ready'; mode: WizardMode; state: WizardState; visit?: Visit; base?: Visit; stepIndex: number }
  | { status: 'blocked'; message: string };

export const IntakeWizard = () => {
  useDocumentTitle('Cuestionario');
  const navigate = useNavigate();
  const toast = useToast();
  const { visitId: routeVisitId, prevVisitId } = useParams();

  const [boot, setBoot] = useState<Boot>({ status: 'loading' });
  const [state, setState] = useState<WizardState>(() => initialWizardState());
  const [mode, setMode] = useState<WizardMode>('new');
  const [visit, setVisit] = useState<Visit | null>(null);
  const [base, setBase] = useState<Visit | null>(null);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [busy, setBusy] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [idleOpen, setIdleOpen] = useState(false);
  const [idleLeft, setIdleLeft] = useState<number>(CLINIC.kioskIdleWarningSeconds);
  const [lookup, setLookup] = useState<{ visit: Visit; dismissed: boolean } | null>(null);
  const [remoteSave, setRemoteSave] = useState<'idle' | 'ok' | 'error'>('idle');
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- arranque ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const draft = readDraft();
        if (routeVisitId) {
          const v = await getVisit(routeVisitId);
          if (!alive) return;
          if (!v) return setBoot({ status: 'blocked', message: 'No encontramos su registro. Pida ayuda a la asistente.' });
          if (v.status === 'waiting' || v.status === 'in_consultation') return setBoot({ status: 'blocked', message: 'Su cuestionario ya fue enviado. Tome asiento; en un momento lo llamarán.' });
          if (v.status !== 'arrived') return setBoot({ status: 'blocked', message: 'Este registro ya no está activo. Pida ayuda a la asistente.' });
          const prev = v.meta.prevVisitId ? await getVisit(v.meta.prevVisitId) : null;
          const fromDraft = draft?.visitId === v.id ? draft : null;
          const fromRemote = v.meta.wizard?.state as WizardState | undefined;
          const initial = fromDraft?.state ?? fromRemote ?? (prev ? wizardStateFromVisit(prev) : wizardStateFromVisit(v));
          if (!fromDraft && !fromRemote && prev) initial.personal = wizardStateFromVisit(v).personal;
          setBoot({
            status: 'ready',
            mode: 'returning',
            state: initial,
            visit: v,
            base: prev ?? v,
            stepIndex: resumeIndex(initial, 'returning', fromDraft?.stepKey ?? v.meta.wizard?.stepKey, fromDraft?.stepIndex ?? v.meta.wizard?.stepIndex ?? 0),
          });
          return;
        }
        if (prevVisitId) {
          const prev = await getVisit(prevVisitId);
          if (!alive) return;
          if (!prev) return setBoot({ status: 'blocked', message: 'No encontramos su expediente. Pida ayuda a la asistente.' });
          const fromDraft = draft?.prevVisitId === prev.id && !draft.visitId ? draft : null;
          const initial = fromDraft?.state ?? wizardStateFromVisit(prev);
          setBoot({ status: 'ready', mode: 'returning', state: initial, base: prev, stepIndex: resumeIndex(initial, 'returning', fromDraft?.stepKey, fromDraft?.stepIndex ?? 0) });
          return;
        }
        const fromDraft = draft && !draft.visitId && !draft.prevVisitId ? draft : null;
        const initial = fromDraft?.state ?? initialWizardState();
        const prefill = takePrefillPhone();
        if (prefill && !initial.personal.phone) initial.personal.phone = prefill;
        setBoot({ status: 'ready', mode: 'new', state: initial, stepIndex: resumeIndex(initial, 'new', fromDraft?.stepKey, fromDraft?.stepIndex ?? 0) });
      } catch {
        if (alive) setBoot({ status: 'blocked', message: 'No se pudo cargar el cuestionario. Revise la conexión o pida ayuda.' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [routeVisitId, prevVisitId]);

  useEffect(() => {
    if (boot.status !== 'ready') return;
    setMode(boot.mode);
    setState(boot.state);
    setVisit(boot.visit ?? null);
    setBase(boot.base ?? null);
    setIndex(boot.stepIndex);
  }, [boot]);

  // ---------- pasos ----------
  const steps = useMemo(() => computeSteps(state, mode), [state, mode]);
  const safeIndex = Math.min(index, steps.length - 1);
  const step = steps[safeIndex];
  const sections = useMemo(() => sectionsOf(steps), [steps]);
  const sectionIndex = step ? sections.indexOf(step.section) : 0;
  const blocker = step ? stepBlocker(state, step) : null;
  const isLast = safeIndex === steps.length - 1;

  const update = useCallback((fn: (s: WizardState) => WizardState) => setState((s) => fn(s)), []);

  // foco y scroll al cambiar de paso (el documento es quien hace scroll; el contenedor interno es respaldo)
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('[data-step-title]');
    window.scrollTo({ top: 0 });
    document.querySelector('.wizard__scroll')?.scrollTo({ top: 0 });
    el?.focus({ preventScroll: true });
  }, [safeIndex]);

  // ---------- borrador ----------
  useEffect(() => {
    if (boot.status !== 'ready') return;
    writeDraft({ visitId: visit?.id, prevVisitId: base?.id !== visit?.id ? base?.id : undefined, mode, state, stepIndex: safeIndex, stepKey: step?.key });
    if (!visit) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveWizardDraft(visit.id, { stepKey: step?.key, stepIndex: safeIndex, stepCount: steps.length, state })
        .then(() => setRemoteSave('ok'))
        .catch((err: unknown) => {
          // Transición = la visita ya avanzó (p. ej. recepción la pasó a sala); no es un fallo de guardado.
          if (!(err instanceof TransitionRejected)) setRemoteSave('error');
        });
    }, 1500);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [state, safeIndex, visit, base, mode, boot.status, step?.key, steps.length]);

  // ---------- inactividad ----------
  const resetToHome = useCallback(() => {
    clearDraft();
    navigate('/', { replace: true });
  }, [navigate]);

  useIdleTimer(CLINIC.kioskIdleSeconds, () => setIdleOpen(true), boot.status === 'ready' && !idleOpen);
  useEffect(() => {
    if (!idleOpen) return;
    setIdleLeft(CLINIC.kioskIdleWarningSeconds);
    const t = setInterval(() => {
      setIdleLeft((n) => {
        if (n <= 1) {
          clearInterval(t);
          resetToHome();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [idleOpen, resetToHome]);

  // ---------- búsqueda por teléfono (paso teléfono, modo nuevo) ----------
  useEffect(() => {
    if (mode !== 'new' || step?.step.kind !== 'personal' || step.step.field !== 'phone') return;
    const key = normalizeMx(state.personal.phone);
    if (key.length !== 10) {
      setLookup(null);
      return;
    }
    // Solo se ofrece el expediente si además coincide el primer nombre que ya escribió: el teléfono solo no revela a nadie.
    const typed = firstName(state.personal.phone ? state.personal.fullName : '');
    if (!typed) return;
    let alive = true;
    listVisitsByPhone(key)
      .then((list) => {
        if (!alive) return;
        const match = list.find((v) => firstName(v.personal.fullName) === typed);
        if (!match) return;
        setLookup((prev) => (prev?.visit.id === match.id ? prev : { visit: match, dismissed: false }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [state.personal.phone, state.personal.fullName, mode, step]);

  // ---------- navegación ----------
  const goTo = (i: number, dir: 'forward' | 'back') => {
    setDirection(dir);
    setIndex(Math.max(0, Math.min(i, steps.length - 1)));
  };

  const ensureVisit = async (): Promise<Visit | null> => {
    if (visit) return visit;
    try {
      const personal = buildPersonal(state, base?.personal);
      const created = await createVisit({
        personal,
        status: 'arrived',
        kind: base ? 'followup' : 'first',
        source: 'kiosk',
        by: KIOSK_ACTOR,
        prevVisitId: base?.id,
        preferredDoctor: base?.preferredDoctor,
        phoneCollision: lookup?.dismissed || undefined,
      });
      setVisit(created);
      return created;
    } catch (err) {
      if (err instanceof DuplicateOpenVisit) {
        const existing = err.existing;
        if (existing.status === 'arrived') {
          // Conserva lo contestado: el borrador pasa a la visita existente y se reanuda por clave de paso.
          writeDraft({ visitId: existing.id, prevVisitId: existing.meta.prevVisitId, mode: 'returning', state, stepIndex: 0, stepKey: step?.key });
          toast.info('Ya tenía un registro empezado hoy. Continuamos donde se quedó.');
          navigate(`/kiosk/continuar/${existing.id}`, { replace: true });
        } else {
          setBoot({ status: 'blocked', message: 'Usted ya está registrado en la sala de espera. Tome asiento; en un momento lo llamarán.' });
        }
        return null;
      }
      toast.error('No se pudo guardar su registro.', { message: 'Revise la conexión o pida ayuda a la asistente.', action: { label: 'Reintentar', onClick: () => void next() } });
      return null;
    }
  };

  const next = async () => {
    if (!step || blocker || busy) return;
    const lastPersonal = mode === 'new' && step.section === 'datos' && steps[safeIndex + 1]?.section !== 'datos';
    if (lastPersonal && !visit) {
      setBusy(true);
      const v = await ensureVisit();
      setBusy(false);
      if (!v) return;
    }
    if (isLast) {
      await submit();
      return;
    }
    goTo(safeIndex + 1, 'forward');
  };

  const back = () => {
    if (safeIndex === 0) {
      setExitOpen(true);
      return;
    }
    goTo(safeIndex - 1, 'back');
  };

  const goToSection = (section: SectionKey) => {
    const i = steps.findIndex((s) => s.section === section);
    if (i >= 0) goTo(i, 'back');
  };

  const onAutoAdvance = () => {
    if (isReducedMotion()) return;
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => void next(), 350);
  };
  useEffect(() => () => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
  }, []);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const v = visit ?? (await ensureVisit());
      if (!v) return;
      const intake = buildIntake(state, 'kiosk');
      const personal = buildPersonal(state, base?.personal ?? v.personal);
      await completeIntake(v.id, intake, KIOSK_ACTOR, personal);
      clearDraft();
      void ensureSummary(v.id);
      navigate('/kiosk/listo', { replace: true });
    } catch (err) {
      // Solo se da por enviado si la consulta ya se cerró (el doctor lo atendió antes de que terminara).
      if (err instanceof TransitionRejected && err.from === 'completed') {
        clearDraft();
        navigate('/kiosk/listo', { replace: true });
        return;
      }
      if (err instanceof TransitionRejected && err.from === 'cancelled') {
        toast.error('Su registro fue cancelado en recepción. Pida ayuda a la asistente; sus respuestas siguen en esta tableta.');
        return;
      }
      console.error('[kiosk] submit', err);
      toast.error('No se pudo enviar. Sus respuestas siguen en esta tableta.', {
        message: err instanceof Error ? err.message : undefined,
        action: { label: 'Reintentar', onClick: () => void submit() },
      });
    } finally {
      setBusy(false);
    }
  };

  const acceptLookup = () => {
    if (!lookup) return;
    const open = OPEN_VISIT_STATUSES.includes(lookup.visit.status);
    clearDraft();
    if (open && lookup.visit.status === 'arrived') navigate(`/kiosk/continuar/${lookup.visit.id}`, { replace: true });
    else navigate(`/kiosk/recurrente/${lookup.visit.id}`, { replace: true });
  };

  // ---------- render ----------
  if (boot.status === 'loading') {
    return (
      <div className="kiosk-done">
        <p className="lead muted">Cargando…</p>
      </div>
    );
  }
  if (boot.status === 'blocked') {
    return (
      <div className="kiosk-done">
        <div className="kiosk-done__text">
          <h1 className="h1">Un momento</h1>
          <p className="lead muted">{boot.message}</p>
        </div>
        <Button size="lg" onClick={resetToHome}>
          Volver al inicio
        </Button>
      </div>
    );
  }
  if (!step) return null;

  const stepperSections = sections.map((s) => ({ key: s, label: SECTION_LABEL[s], progress: sectionProgress(state, steps, s) }));
  const caption = `${stepCaption(step, sectionIndex, sections.length)} · ${SECTION_LABEL[step.section]}`;

  return (
    <div className="wizard">
      <header className="wizard__header">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={22} />} onClick={back} className="btn--lg" aria-label={safeIndex === 0 ? 'Salir' : 'Atrás'}>
          <span className="btn__label">{safeIndex === 0 ? 'Salir' : 'Atrás'}</span>
        </Button>
        <Stepper sections={stepperSections} currentIndex={sectionIndex} caption={caption} />
        <Button variant="secondary" icon={<HelpCircle size={22} />} onClick={() => setHelpOpen(true)} className="btn--lg" aria-label="Ayuda">
          <span className="btn__label">Ayuda</span>
        </Button>
      </header>

      <div className="wizard__scroll">
        <div key={step.key} className={['wizard__body', direction === 'back' ? 'step-enter--back' : 'step-enter', step.step.kind === 'question-group' || step.step.kind === 'history' ? 'wizard__body--wide' : ''].filter(Boolean).join(' ')}>
          <StepRenderer
            state={state}
            update={update}
            step={step}
            base={base?.personal ?? visit?.personal}
            onAutoAdvance={onAutoAdvance}
            goToSection={goToSection}
            lookup={lookup && !lookup.dismissed ? { name: lookup.visit.personal.fullName, onYes: acceptLookup, onNo: () => setLookup({ ...lookup, dismissed: true }) } : null}
          />
        </div>
      </div>

      <footer className="wizard__footer">
        <span className="wizard__hint">{remoteSave === 'error' ? 'Sin conexión con el servidor: sus respuestas se guardan solo en esta tableta' : visit && remoteSave === 'ok' ? 'Guardado' : 'Sus respuestas son confidenciales'}</span>
        <div className="wizard__blocker">
          {blocker && <span className="wizard__hint">{blocker}</span>}
          <Button size="lg" onClick={() => void next()} disabled={Boolean(blocker)} loading={busy}>
            {isLast ? 'Enviar al doctor' : 'Siguiente'}
          </Button>
        </div>
      </footer>

      <Modal
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        title="¿Desea salir sin enviar?"
        subtitle="Perderá lo que ha contestado en esta tableta."
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => setExitOpen(false)}>
              Seguir contestando
            </Button>
            <Button variant="danger" size="lg" onClick={resetToHome}>
              Salir
            </Button>
          </>
        }
      />

      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="¿Necesita ayuda?"
        footer={
          <Button size="lg" onClick={() => setHelpOpen(false)}>
            Entendido
          </Button>
        }
      >
        <p className="lead">Levante la mano y la asistente vendrá a ayudarle. Puede dejar la tableta como está.</p>
      </Modal>

      <Modal
        open={idleOpen}
        onClose={() => setIdleOpen(false)}
        persistent
        title="¿Sigue ahí?"
        subtitle={`Por su privacidad, esta pantalla se cerrará en ${idleLeft} segundos.`}
        footer={
          <Button size="lg" onClick={() => setIdleOpen(false)}>
            Sí, continuar
          </Button>
        }
      />
    </div>
  );
};
