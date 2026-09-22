import { Copy, Search } from 'lucide-react';
import { redactFreeText } from '../../domain/deidentify';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button, Callout, Field, Skeleton, Textarea } from '../../components/ui';
import { RESEARCH_PRESETS, research } from '../../services/ai/research';
import type { ResearchMessage, ResearchResult, ResearchSource } from '../../services/ai/research';
import { aiAvailable } from '../../services/env';

const HISTORY_KEY = 'uf.research.recent';

const readHistory = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
};

const pushHistory = (q: string) => {
  const list = [q, ...readHistory().filter((x) => x !== q)].slice(0, 10);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    /* nada */
  }
  return list;
};

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** Convierte [n] en enlaces markdown a la fuente n. */
const linkify = (content: string, sources: ResearchSource[]): string =>
  content.replace(/\[(\d+)\](?!\()/g, (m, n) => {
    const s = sources.find((x) => x.index === Number(n));
    return s ? `[${n}](${s.url})` : m;
  });

interface Turn {
  question: string;
  result?: ResearchResult;
  error?: string;
}

export const ResearchPanel = ({ context, onInsert, compact }: { context?: string; onInsert?: (text: string, sources: string[]) => void; compact?: boolean }) => {
  const [question, setQuestion] = useState('');
  const [ctx, setCtx] = useState(context ?? '');
  const [useCtx, setUseCtx] = useState(Boolean(context));
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>(readHistory());

  useEffect(() => {
    if (context) setCtx(context);
  }, [context]);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setQuestion('');
    setHistory(pushHistory(text));
    const messages: ResearchMessage[] = [];
    // Teléfonos, correos y CURP nunca salen, aunque el doctor los haya escrito en el contexto o la pregunta.
    const safeCtx = redactFreeText(ctx);
    if (useCtx && safeCtx) messages.push({ role: 'user', content: `CONTEXTO DEL CASO (anonimizado): ${safeCtx}` }, { role: 'assistant', content: 'Entendido. ¿Cuál es la pregunta?' });
    for (const t of turns.slice(-3)) {
      messages.push({ role: 'user', content: t.question });
      if (t.result) messages.push({ role: 'assistant', content: t.result.content });
    }
    messages.push({ role: 'user', content: redactFreeText(text) ?? text });
    setTurns((ts) => [...ts, { question: text }]);
    try {
      const result = await research(messages);
      setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, result } : t)));
    } catch (err) {
      setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, error: err instanceof Error ? err.message : 'Error desconocido' } : t)));
    } finally {
      setBusy(false);
    }
  };

  const Answer = ({ turn }: { turn: Turn }) => {
    const r = turn.result;
    return (
      <div className="stack">
        <h3 className={compact ? 'h3' : 'h2'}>{turn.question}</h3>
        {turn.error && <Callout tone="warning" title="No se pudo consultar">{turn.error}</Callout>}
        {!r && !turn.error && <Skeleton lines={4} delayed={false} />}
        {r && (
          <>
            <div className="md research__answer">
              <ReactMarkdown
                components={{
                  a: ({ href, children }) => {
                    const label = String(children);
                    if (/^\d+$/.test(label)) {
                      return (
                        <sup>
                          <a href={href} target="_blank" rel="noreferrer">
                            {label}
                          </a>
                        </sup>
                      );
                    }
                    return (
                      <a href={href} target="_blank" rel="noreferrer">
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {linkify(r.content, r.sources)}
              </ReactMarkdown>
            </div>
            {r.sources.length > 0 && (
              <div className="sources">
                <div className="eyebrow">Fuentes</div>
                {r.sources.map((s) => (
                  <div key={s.index} className="sources__item">
                    <span className="sources__num">{s.index}</span>
                    <span>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title ?? s.url}
                      </a>{' '}
                      <span className="sources__domain">
                        {domainOf(s.url)}
                        {s.date ? ` · ${s.date}` : ''}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="row-wrap">
              <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => navigator.clipboard?.writeText(`${r.content}\n\nFuentes:\n${r.sources.map((s) => `[${s.index}] ${s.url}`).join('\n')}`)}>
                Copiar
              </Button>
              {onInsert && (
                <Button size="sm" variant="secondary" onClick={() => onInsert(`${r.content}\n\nFuentes: ${r.sources.map((s) => `[${s.index}] ${s.url}`).join('; ')}`, r.sources.map((s) => s.url))}>
                  Insertar en nota
                </Button>
              )}
              <span className="micro muted">{r.model}</span>
            </div>
          </>
        )}
      </div>
    );
  };

  if (!aiAvailable.research) {
    return <Callout tone="warning" title="Investigación no configurada">Configure `VITE_AI_PROXY_URL` (o `VITE_PERPLEXITY_API_KEY` solo en desarrollo) para usar Perplexity.</Callout>;
  }

  const form = (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void ask(question);
      }}
    >
      {context !== undefined && (
        <Field label="Contexto del caso" help="Editable. Nunca incluye nombre ni contacto.">
          <div className="stack-2">
            <Textarea rows={3} value={ctx} onChange={(e) => setCtx(e.target.value)} />
            <label className="row-2 small">
              <input type="checkbox" checked={useCtx} onChange={(e) => setUseCtx(e.target.checked)} /> Incluir contexto en la consulta
            </label>
          </div>
        </Field>
      )}
      <Field label={turns.length ? 'Preguntar más' : 'Pregunta'}>
        <Textarea
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ej. ¿Cuál es la primera línea para HPB con IPSS severo según AUA?"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void ask(question);
          }}
        />
      </Field>
      <Button type="submit" icon={<Search size={16} />} loading={busy} disabled={!question.trim()}>
        Buscar
      </Button>
      <div className="stack-2">
        <div className="eyebrow">Consultas rápidas</div>
        {RESEARCH_PRESETS.map((p) => (
          <button key={p.label} type="button" className="history-item" onClick={() => void ask(p.query)} disabled={busy}>
            {p.label}
          </button>
        ))}
      </div>
      {history.length > 0 && (
        <div className="stack-2">
          <div className="eyebrow">Recientes</div>
          {history.slice(0, 6).map((h) => (
            <button key={h} type="button" className="history-item truncate" onClick={() => setQuestion(h)}>
              {h}
            </button>
          ))}
        </div>
      )}
      <p className="micro muted">Apoyo bibliográfico; la decisión clínica es del médico tratante.</p>
    </form>
  );

  const answers = (
    <div className="research__read">
      {turns.length === 0 ? <p className="muted">Las respuestas aparecen aquí con sus fuentes numeradas.</p> : turns.map((t, i) => <Answer key={i} turn={t} />)}
    </div>
  );

  if (compact) {
    return (
      <div className="stack-6">
        {form}
        {answers}
      </div>
    );
  }
  return (
    <div className="research">
      <div className="card">{form}</div>
      {answers}
    </div>
  );
};
