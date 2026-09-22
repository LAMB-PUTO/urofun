import { Armchair, RefreshCw, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar, Button, ButtonLink, ConfirmModal, EmptyState, Field, Select, SkeletonRows, Tag, VisitStatusChip, useToast } from '../../components/ui';
import { can } from '../../config/roles';
import { cancelVisit, skipIntake, startConsultation, transitionVisit } from '../../data/visits.repo';
import { visitActions } from '../../domain/status';
import type { StatusAction } from '../../domain/status';
import type { CancelReason, Visit, VisitStatus } from '../../domain/types';
import { useOpenVisits } from '../../hooks/useVisits';
import { useDocumentTitle, useHotkey, useNow } from '../../hooks/useUtil';
import { minutesSince, relativeTime } from '../../lib/dates';
import { formatMx } from '../../lib/phone';
import { regenerateSummary } from '../../services/ai/summaryJob';
import { useSession } from '../../services/session';
import { actorOf } from '../shared/actor';
import { KioskCodeCard } from '../shared/KioskCodeCard';
import { AiStatusChip, ReasonTags, VisitContextPanel, hasIntake, usePreviousVisit, visitRedFlags } from '../shared/VisitContext';

const SECTIONS: Array<{ status: VisitStatus; label: string }> = [
  { status: 'waiting', label: 'Listos para pasar' },
  { status: 'arrived', label: 'Llenando cuestionario' },
  { status: 'in_consultation', label: 'En consulta' },
];

const sortQueue = (list: Visit[]): Visit[] =>
  [...list].sort((a, b) => {
    const fa = visitRedFlags(a).length > 0 ? 0 : 1;
    const fb = visitRedFlags(b).length > 0 ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return a.createdAt.localeCompare(b.createdAt);
  });

export const WaitingRoomPage = () => {
  useDocumentTitle('Sala de espera');
  const session = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const { visitId } = useParams();
  const now = useNow();
  const { data, loading, error, refresh, updatedAt } = useOpenVisits();
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<Visit | null>(null);
  const [cancelReason, setCancelReason] = useState<CancelReason>('se_retiro');
  const [retrying, setRetrying] = useState(false);

  const clinical = can(session, 'waiting_room.clinical');
  const actor = actorOf(session);
  const visits = useMemo(() => data ?? [], [data]);
  const selected = visits.find((v) => v.id === visitId) ?? null;
  const previous = usePreviousVisit(clinical ? selected : null);

  const grouped = useMemo(() => SECTIONS.map((s) => ({ ...s, items: sortQueue(visits.filter((v) => v.status === s.status)) })).filter((g) => g.items.length), [visits]);
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  useEffect(() => {
    document.title = `${visits.length ? `(${visits.length}) ` : ''}Sala de espera · Urología Funcional`;
  }, [visits.length]);

  const select = (v: Visit | null) => navigate(v ? `/panel/espera/${v.id}` : '/panel/espera');

  useHotkey('j', () => {
    const i = flat.findIndex((v) => v.id === selected?.id);
    select(flat[Math.min(flat.length - 1, i + 1)] ?? null);
  });
  useHotkey('k', () => {
    const i = flat.findIndex((v) => v.id === selected?.id);
    select(flat[Math.max(0, i - 1)] ?? flat[0] ?? null);
  });
  useHotkey('escape', () => select(null));

  const run = async (v: Visit, action: StatusAction) => {
    if (action.to === 'cancelled') {
      setCancelFor(v);
      return;
    }
    if (action.to === 'completed') {
      // Cerrar una consulta exige la nota: siempre desde la página de consulta.
      navigate(`/panel/consulta/${v.id}`);
      return;
    }
    setBusy(v.id);
    try {
      if (action.to === 'in_consultation') {
        await startConsultation(v.id, actor);
        navigate(`/panel/consulta/${v.id}`);
        return;
      }
      if (action.to === 'waiting' && v.status === 'arrived') await skipIntake(v.id, actor);
      else await transitionVisit(v.id, action.to, actor);
      await refresh({ silent: true });
    } catch (err) {
      toast.error('Este paciente ya cambió de estado.', { message: err instanceof Error ? err.message : undefined });
      await refresh({ silent: true });
    } finally {
      setBusy(null);
    }
  };

  const doCancel = async () => {
    if (!cancelFor) return;
    try {
      await cancelVisit(cancelFor.id, actor, cancelReason);
    } catch (err) {
      await refresh({ silent: true });
      throw err; // el modal muestra el motivo y sigue abierto
    }
    toast.success('Visita marcada como cancelada.');
    if (selected?.id === cancelFor.id) select(null);
    await refresh({ silent: true });
  };

  const retryAi = async () => {
    if (!selected) return;
    setRetrying(true);
    try {
      await regenerateSummary(selected.id);
      await refresh({ silent: true });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <div className="page__title">
          <h1 className="h1">Sala de espera</h1>
          <span className="live">
            <span className={['live-dot', error ? 'live-dot--off' : ''].join(' ')} />
            {error ? 'Sin conexión' : updatedAt ? `Actualizado ${relativeTime(updatedAt, now)}` : 'Cargando'}
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => void refresh()} aria-label="Actualizar">
              <RefreshCw size={16} />
            </button>
          </span>
        </div>
        <div className="page__actions">
          {can(session, 'patient.register') && (
            <ButtonLink to="/panel/registrar" icon={<UserPlus size={16} />}>
              Registrar paciente
            </ButtonLink>
          )}
        </div>
      </header>

      {loading && !data ? (
        <SkeletonRows rows={5} />
      ) : !visits.length ? (
        <EmptyState icon={<Armchair />} title="No hay pacientes en espera" text="Los pacientes aparecen aquí cuando se registran en la tablet o cuando recepción hace el check-in de una cita." action={can(session, 'patient.register') ? <ButtonLink to="/panel/registrar" variant="secondary">Registrar paciente</ButtonLink> : undefined} />
      ) : (
        <div className={['split', selected ? 'has-selection' : ''].join(' ')}>
          <div className="split__list">
            {grouped.map((g) => (
              <div key={g.status}>
                <div className="queue__section">
                  <span className="eyebrow">{g.label}</span>
                  <span className="badge-count">{g.items.length}</span>
                </div>
                {g.items.map((v) => {
                  const flags = visitRedFlags(v).length;
                  const arrivedAt = v.meta.checkedInAt ?? v.createdAt;
                  const wait = minutesSince(arrivedAt, now) < 720 ? `hace ${minutesSince(arrivedAt, now)} min` : relativeTime(arrivedAt, now);
                  return (
                    <button key={v.id} type="button" className={['queue__row', selected?.id === v.id ? 'is-selected' : '', v.status === 'in_consultation' ? 'is-busy' : ''].filter(Boolean).join(' ')} onClick={() => select(v)}>
                      <Avatar name={v.personal.fullName} />
                      <span className="stack-2" style={{ gap: 2, minWidth: 0 }}>
                        <span className="queue__name">
                          {flags > 0 && <span className="flag-dot" title={`${flags} bandera(s) roja(s)`} />}
                          <span className="truncate">{v.personal.fullName}</span>
                        </span>
                        <span className="queue__meta">
                          {v.personal.age} a · {v.personal.gender} · {wait}
                          {v.meta.kind === 'followup' && <Tag>Subsecuente</Tag>}
                        </span>
                        <span className="queue__tags">
                          <ReasonTags visit={v} max={2} />
                        </span>
                      </span>
                      <span className="queue__right">
                        {v.status === 'in_consultation' ? <VisitStatusChip status={v.status} /> : <AiStatusChip visit={v} />}
                        {v.preferredDoctor && v.preferredDoctor !== session?.username && <span className="micro warning-text">Prefiere {v.preferredDoctor}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="split__detail">
            {selected ? (
              <>
                <div className="detail__header">
                  <div className="row">
                    <Avatar name={selected.personal.fullName} size="lg" />
                    <div className="stack-2" style={{ gap: 2 }}>
                      <h2 className="h2">{selected.personal.fullName}</h2>
                      <div className="small muted num">
                        {selected.personal.age} años · {selected.personal.gender} · {formatMx(selected.personal.phone)}
                        {selected.personal.email ? ` · ${selected.personal.email}` : ''}
                      </div>
                      <div className="row-wrap">
                        <VisitStatusChip status={selected.status} />
                        {hasIntake(selected) && clinical && <AiStatusChip visit={selected} />}
                        {selected.meta.kind === 'followup' ? <Tag>Subsecuente</Tag> : <Tag>Primera vez</Tag>}
                        {selected.meta.source === 'legacy' && <Tag>Registro anterior</Tag>}
                        {selected.meta.doctorUsername && selected.status === 'in_consultation' && <Tag navy>Con {selected.meta.doctorUsername}</Tag>}
                      </div>
                    </div>
                  </div>
                  <div className="row-wrap">
                    <Button variant="ghost" size="sm" onClick={() => select(null)} className="hide-desktop">
                      Cerrar
                    </Button>
                    {visitActions(selected, actor.role, actor.username).map((a) => (
                      <Button key={a.to + a.label} variant={a.variant} size="sm" onClick={() => void run(selected, a)} loading={busy === selected.id && a.variant === 'primary'} disabled={busy === selected.id}>
                        {a.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="detail__body">
                  {selected.status === 'arrived' && (
                    <div className="span-2">
                      <KioskCodeCard visit={selected} onSkipIntake={() => void run(selected, { label: 'Sin tablet', to: 'waiting', variant: 'secondary' })} skipping={busy === selected.id} />
                    </div>
                  )}
                  <VisitContextPanel visit={selected} previous={previous} clinical={clinical} onRetryAi={can(session, 'ai.retry') ? retryAi : undefined} retrying={retrying} />
                </div>
              </>
            ) : (
              <EmptyState icon={<Armchair />} title="Elija un paciente" text="Seleccione una fila para ver su información. Use j / k para moverse y Esc para cerrar." />
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(cancelFor)}
        onClose={() => setCancelFor(null)}
        onConfirm={doCancel}
        title="Marcar como no atendido"
        message={
          <Field label="Motivo">
            <Select value={cancelReason} onChange={(e) => setCancelReason(e.target.value as CancelReason)}>
              <option value="se_retiro">Se retiró</option>
              <option value="error_captura">Error de captura</option>
              <option value="otro">Otro</option>
            </Select>
          </Field>
        }
        confirmLabel="Confirmar"
        danger
      />
    </div>
  );
};
