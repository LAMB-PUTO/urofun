import { FileText, Paperclip, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button, Callout, Chip, DataList, ScoreBar, Skeleton, Tag } from '../../components/ui';
import { listVisitsByPhone } from '../../data/visits.repo';
import { reasonByLabel } from '../../domain/intake/catalog';
import { QUESTIONNAIRE_ORDER } from '../../domain/questionnaires';
import type { QuestionnaireScores } from '../../domain/questionnaires';
import { deterministicNote } from '../../domain/summary/deterministicNote';
import type { Visit } from '../../domain/types';
import { formatDateTime, formatDay } from '../../lib/dates';
import { aiAvailable } from '../../services/env';

const SPHERE_TITLES: Record<string, string> = {
  prostate: 'Próstata',
  bladder: 'Vejiga y micción',
  sexualMale: 'Salud sexual',
  sexualFemale: 'Salud sexual',
  kidney: 'Riñón y litiasis',
};

export const visitReasons = (v: Visit): string[] => v.intake?.reasons ?? v.legacyIntake?.reasons ?? [];
export const visitRedFlags = (v: Visit): string[] => v.intake?.redFlags ?? v.legacyIntake?.redFlags ?? [];
export const visitScores = (v: Visit): QuestionnaireScores => v.intake?.questionnaireScores ?? v.legacyIntake?.questionnaireScores ?? {};
export const hasIntake = (v: Visit): boolean => Boolean(v.intake || v.legacyIntake);

export const ReasonTags = ({ visit, max = 3 }: { visit: Visit; max?: number }) => {
  const reasons = visitReasons(visit);
  const shown = reasons.slice(0, max);
  return (
    <>
      {shown.map((r) => (
        <Tag key={r} navy>
          {reasonByLabel(r)?.short ?? r}
        </Tag>
      ))}
      {reasons.length > max && <Tag>+{reasons.length - max}</Tag>}
    </>
  );
};

export const AiStatusChip = ({ visit }: { visit: Visit }) => {
  if (!hasIntake(visit)) return <Chip tone="muted">Sin cuestionario</Chip>;
  switch (visit.ai.status) {
    case 'ready':
      return <Chip tone="success">Resumen listo</Chip>;
    case 'generating':
      return (
        <Chip tone="info" dot>
          Generando resumen
        </Chip>
      );
    case 'pending':
      return <Chip tone="info">Resumen en espera</Chip>;
    case 'failed':
      return <Chip tone="warning">Resumen falló</Chip>;
    default:
      return <Chip tone="muted">Sin resumen</Chip>;
  }
};

export const RedFlagsCallout = ({ flags }: { flags: string[] }) => {
  if (!flags.length) return null;
  return (
    <Callout tone="alert" title={flags.length === 1 ? 'Bandera roja' : `${flags.length} banderas rojas`}>
      <ul>
        {flags.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </Callout>
  );
};

export const AiSummaryCard = ({ visit, onRetry, retrying }: { visit: Visit; onRetry?: () => void; retrying?: boolean }) => {
  const ai = visit.ai;
  const fallback = hasIntake(visit) ? deterministicNote(visit) : null;
  const retry = onRetry && aiAvailable.summary && visit.intake && (
    <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry} loading={retrying}>
      {ai.status === 'ready' ? 'Regenerar' : 'Reintentar'}
    </Button>
  );
  return (
    <div className="section">
      <div className="section__head">
        <div>
          <div className="h4">Resumen previo (IA)</div>
          <div className="micro muted">
            {ai.status === 'ready' ? `Generado automáticamente${ai.generatedAt ? ` · ${formatDateTime(ai.generatedAt)}` : ''}${ai.model ? ` · ${ai.model}` : ''} · revisar` : 'Generado automáticamente · revisar'}
          </div>
        </div>
        {retry}
      </div>
      {ai.status === 'ready' && ai.summary ? (
        <div className="md small">
          <ReactMarkdown>{ai.summary}</ReactMarkdown>
        </div>
      ) : ai.status === 'generating' || ai.status === 'pending' ? (
        <div className="stack-2">
          <Callout tone="info">{ai.status === 'generating' ? 'Generando el resumen con IA…' : aiAvailable.summary ? 'El resumen se generará en unos segundos.' : 'No hay proveedor de IA configurado; se muestra el resumen estructurado.'}</Callout>
          {aiAvailable.summary ? <Skeleton lines={4} delayed={false} /> : fallback && <div className="md small"><ReactMarkdown>{fallback}</ReactMarkdown></div>}
        </div>
      ) : (
        <div className="stack-2">
          {ai.status === 'failed' && <Callout tone="warning" title="El resumen con IA no se pudo generar">{ai.error ? <span className="small">{ai.error}</span> : null}</Callout>}
          {fallback ? (
            <div className="md small">
              <ReactMarkdown>{fallback}</ReactMarkdown>
            </div>
          ) : (
            <p className="muted small">Este paciente no llenó el cuestionario en la tablet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export const SymptomsSection = ({ visit }: { visit: Visit }) => {
  const labels = visit.intake?.symptomLabels ?? visit.legacyIntake?.symptomLabels ?? {};
  const entries = Object.entries(labels).filter(([, v]) => v && v.length);
  const reasons = visitReasons(visit);
  const other = visit.intake?.otherReason;
  if (!reasons.length && !entries.length) return null;
  return (
    <div className="section">
      <div className="section__head">
        <div className="h4">Motivo y síntomas</div>
      </div>
      <div className="row-wrap">
        {reasons.map((r) => (
          <Tag key={r} navy>
            {r}
          </Tag>
        ))}
      </div>
      {other && <p className="small">Otro motivo: {other}</p>}
      {entries.length > 0 && (
        <DataList items={entries.map(([sphere, v]) => [SPHERE_TITLES[sphere] ?? sphere, <span className="small" key={sphere}>{v!.join('; ')}</span>])} />
      )}
    </div>
  );
};

export const ScoresSection = ({ visit, previous }: { visit: Visit; previous?: Visit | null }) => {
  const scores = visitScores(visit);
  const prevScores = previous ? visitScores(previous) : {};
  const ids = QUESTIONNAIRE_ORDER.filter((id) => scores[id]);
  return (
    <div className="section">
      <div className="section__head">
        <div className="h4">Cuestionarios</div>
        {previous && <span className="micro muted">Cambio vs. {formatDay(previous.createdAt.slice(0, 10), 'short')}</span>}
      </div>
      {ids.length ? ids.map((id) => <ScoreBar key={id} score={scores[id]!} previous={prevScores[id]} />) : <p className="small muted">Sin instrumentos aplicados.</p>}
    </div>
  );
};

export const HistorySection = ({ visit }: { visit: Visit }) => {
  const g = visit.intake?.general;
  const h = visit.intake?.histories;
  if (!g) {
    const legacy = visit.legacyIntake?.raw as Record<string, unknown> | undefined;
    if (!legacy) return null;
    return (
      <div className="section">
        <div className="section__head">
          <div className="h4">Antecedentes</div>
        </div>
        <p className="small muted">Registro anterior a la versión actual; consulte las respuestas completas más abajo.</p>
      </div>
    );
  }
  const yn = (v?: boolean) => (v === undefined ? undefined : v ? 'Sí' : 'No');
  const items: Array<[string, string | undefined]> = [
    ['Enfermedades', g.conditions.filter((c) => c !== 'Ninguna').join(', ') || 'Niega'],
    ['Otra', g.otherCondition || undefined],
    ['Cirugías', g.surgeries || 'Niega'],
    ['Medicamentos', g.meds || 'Niega'],
    ['Alergias', g.allergies || 'Niega'],
    ['Tabaquismo', g.smoking],
    ['Alcohol', g.alcohol],
    ['Heredofamiliares', g.familyHistory.join(', ') || 'Niega'],
  ];
  const specific: Array<[string, string | undefined]> = [];
  if (h?.prostate) {
    specific.push(['Cáncer de próstata familiar', `${h.prostate.familyCancer}${h.prostate.familyCancerDetails ? ` (${h.prostate.familyCancerDetails})` : ''}`]);
    specific.push(['Crecimiento prostático familiar', h.prostate.familyGrowth]);
    specific.push(['PSA', `${h.prostate.psa}${h.prostate.psaResult ? ` · ${h.prostate.psaResult}` : ''}`]);
    specific.push(['Ultrasonido / tacto previo', yn(h.prostate.priorExam)]);
  }
  if (h?.uti) {
    specific.push(['IVU 6 meses / 12 meses', `${h.uti.last6} / ${h.uti.last12}`]);
    specific.push(['Relación con actividad sexual', h.uti.worseAfterSex]);
    if (h.uti.menopause !== undefined) specific.push(['Menopausia', yn(h.uti.menopause)]);
    specific.push(['Cálculos o sondas previas', yn(h.uti.stonesOrCatheters)]);
  }
  if (h?.sexual) {
    specific.push(['DM / HTA / colesterol', yn(h.sexual.diabetesHtnChol)]);
    specific.push(['Tabaquismo (salud sexual)', h.sexual.smoking]);
    specific.push(['Medicamentos (salud sexual)', h.sexual.meds || 'Niega']);
    specific.push(['Cirugías de próstata o pelvis', h.sexual.surgeries || 'Niega']);
  }
  if (h?.kidney) {
    specific.push(['Episodios de cálculos', h.kidney.stonesCount || 'Sin dato']);
    specific.push(['Procedimientos', h.kidney.procedures || 'Ninguno']);
    specific.push(['Cálculos familiares', h.kidney.familyStones]);
    specific.push(['Ingesta de agua', h.kidney.water]);
    specific.push(['Gota / ácido úrico', yn(h.kidney.gout)]);
  }
  return (
    <div className="section">
      <div className="section__head">
        <div className="h4">Antecedentes</div>
      </div>
      <DataList items={items.filter(([, v]) => v).map(([k, v]) => [k, <span className="small" key={k}>{v}</span>])} />
      {specific.length > 0 && (
        <>
          <div className="eyebrow">Específicos</div>
          <DataList items={specific.filter(([, v]) => v).map(([k, v]) => [k, <span className="small" key={k}>{v}</span>])} />
        </>
      )}
    </div>
  );
};

export const OtherTopicsSection = ({ visit }: { visit: Visit }) => {
  const t = visit.intake?.otherTopics ?? visit.legacyIntake?.otherTopics;
  if (!t) return null;
  return (
    <div className="section">
      <div className="section__head">
        <div className="h4">Otros temas que quiere tratar</div>
      </div>
      <p className="small">
        <em>{t}</em>
      </p>
    </div>
  );
};

export const FilesList = ({ files }: { files: Visit['files'] }) => {
  if (!files.length) return null;
  return (
    <div className="section">
      <div className="section__head">
        <div className="h4 row-2">
          <Paperclip size={16} /> Archivos ({files.length})
        </div>
      </div>
      <div>
        {files.map((f, i) => (
          <div key={i} className="file-row small">
            <FileText size={16} />
            <a href={f.url} target="_blank" rel="noreferrer" className="grow truncate">
              {f.name}
            </a>
            {f.uploadedAt && <span className="micro muted num">{formatDateTime(f.uploadedAt)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Visita completada anterior del mismo paciente (para deltas). */
export const usePreviousVisit = (visit: Visit | null) => {
  const [previous, setPrevious] = useState<Visit | null>(null);
  useEffect(() => {
    if (!visit) return;
    let alive = true;
    listVisitsByPhone(visit.personal.phone)
      .then((list) => {
        if (!alive) return;
        const prev = list.find((v) => v.id !== visit.id && v.createdAt < visit.createdAt && hasIntake(v));
        setPrevious(prev ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [visit]);
  return previous;
};

export const VisitContextPanel = ({ visit, previous, clinical, onRetryAi, retrying }: { visit: Visit; previous?: Visit | null; clinical: boolean; onRetryAi?: () => void; retrying?: boolean }) => {
  const flags = visitRedFlags(visit);
  return (
    <>
      {clinical ? <RedFlagsCallout flags={flags} /> : flags.length > 0 && <Callout tone="alert">Este paciente marcó {flags.length} síntoma{flags.length > 1 ? 's' : ''} de alarma.</Callout>}
      {clinical && <AiSummaryCard visit={visit} onRetry={onRetryAi} retrying={retrying} />}
      <SymptomsSection visit={visit} />
      {clinical && <ScoresSection visit={visit} previous={previous} />}
      {clinical && <HistorySection visit={visit} />}
      {clinical && <OtherTopicsSection visit={visit} />}
      <FilesList files={visit.files} />
    </>
  );
};
