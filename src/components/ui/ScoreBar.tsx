import type { QuestionnaireId, ScoreResult } from '../../domain/questionnaires';
import { QUESTIONNAIRES } from '../../domain/questionnaires';
import { SeverityChip } from './Chip';

/** Cortes oficiales por instrumento (ticks en la barra). */
const TICKS: Partial<Record<QuestionnaireId, number[]>> = {
  ipss: [8, 20],
  iciq_ui_sf: [6, 13, 19],
  iief_5: [8, 12, 17, 22],
  pedt: [9, 11],
  fsfi_6: [20],
};

const SUBTITLE: Record<QuestionnaireId, string> = {
  ipss: 'Síntomas prostáticos',
  nih_cpsi: 'Prostatitis / dolor pélvico',
  iciq_ui_sf: 'Incontinencia urinaria',
  iciq_oab: 'Vejiga hiperactiva',
  oleary_sant: 'Cistitis intersticial',
  iief_5: 'Función eréctil',
  pedt: 'Eyaculación precoz',
  adam: 'Deficiencia androgénica',
  fsfi_6: 'Función sexual femenina',
};

const Bar = ({ value, min, max, severity, ticks }: { value: number; min: number; max: number; severity: ScoreResult['severity']; ticks?: number[] }) => {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div className="scorebar__track" aria-hidden="true">
      {ticks?.map((t) => <span key={t} className="scorebar__tick" style={{ left: `${((t - min) / (max - min)) * 100}%` }} />)}
      <div className={`scorebar__fill scorebar__fill--${severity}`} style={{ width: `${pct}%` }} />
    </div>
  );
};

export const ScoreBar = ({ score, previous }: { score: ScoreResult; previous?: ScoreResult }) => {
  const q = QUESTIONNAIRES[score.id];
  const delta = previous ? score.total - previous.total : null;

  if (score.id === 'adam') {
    return (
      <div className="scorebar">
        <div className="scorebar__name">
          {q.acronym}
          <span className="scorebar__sub">{SUBTITLE[score.id]}</span>
        </div>
        <div className="small muted">
          {score.total} de {score.max} respuestas afirmativas
        </div>
        <SeverityChip severity={score.severity} label={score.positive ? 'Positivo' : 'Negativo'} />
      </div>
    );
  }

  if (score.id === 'oleary_sant' || score.id === 'nih_cpsi') {
    return (
      <div className="scorebar scorebar--stack">
        <div className="between">
          <div className="scorebar__name">
            {q.acronym}
            <span className="scorebar__sub">{SUBTITLE[score.id]}</span>
          </div>
          <SeverityChip severity={score.severity} label={score.severity === 'info' ? undefined : score.interpretation.split(' (')[0]} />
        </div>
        {score.subscales?.map((s) => (
          <div key={s.key} className="scorebar__row">
            <div className="stack-2">
              <span className="small muted">{s.label}</span>
              <Bar value={s.value} min={0} max={s.max} severity={score.severity === 'info' ? 'info' : score.severity} />
            </div>
            <span className="scorebar__value">
              <span className="scorebar__total">{s.value}</span>
              <span className="scorebar__max">/{s.max}</span>
            </span>
          </div>
        ))}
        {!score.complete && <span className="small danger-text">Instrumento incompleto</span>}
      </div>
    );
  }

  return (
    <div className="scorebar">
      <div className="scorebar__name">
        {q.acronym}
        <span className="scorebar__sub">{SUBTITLE[score.id]}</span>
      </div>
      <Bar value={score.total} min={score.min} max={score.max} severity={score.severity} ticks={TICKS[score.id]} />
      <div className="row-2">
        <span className="scorebar__value" title={score.interpretation}>
          <span className="scorebar__total">{score.total}</span>
          <span className="scorebar__max">/{score.max}</span>
          {delta !== null && delta !== 0 && (
            <span className={`small num ${delta < 0 ? 'success-text' : 'danger-text'}`} title="Cambio respecto a la visita anterior">
              {' '}
              {delta > 0 ? '+' : ''}
              {delta}
            </span>
          )}
        </span>
        <SeverityChip severity={score.severity} />
        {!score.complete && <span className="small danger-text">Incompleto</span>}
      </div>
    </div>
  );
};
