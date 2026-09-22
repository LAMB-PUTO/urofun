import { AI_STALE_MS, claimAi, finishAi, getVisit } from '../../data/visits.repo';
import type { Visit } from '../../domain/types';
import { ENV, aiAvailable } from '../env';
import { hasProxy } from './client';
import { buildSummaryInput, generateSummary } from './summary';

/**
 * Genera el resumen pre-consulta para una visita de forma idempotente:
 * reclama (CAS), genera, guarda. Varios clientes pueden llamar `ensureSummary`
 * a la vez sin duplicar trabajo.
 */
const inFlight = new Map<string, Promise<Visit | null>>();

export const ensureSummary = (visitId: string, opts: { force?: boolean } = {}): Promise<Visit | null> => {
  if (!aiAvailable.summary) return Promise.resolve(null);
  const running = inFlight.get(visitId);
  if (running) return running;
  const job = (async () => {
    const claimed = await claimAi(visitId, opts.force);
    if (!claimed || !claimed.intake) return null;
    const token = claimed.ai.startedAt;
    try {
      const input = buildSummaryInput(claimed);
      const { text, model } = await generateSummary(input);
      return await finishAi(visitId, { status: 'ready', summary: text, model, generatedAt: new Date().toISOString(), generatedBy: hasProxy() ? 'proxy' : 'client', error: undefined }, token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      return await finishAi(visitId, { status: 'failed', error: message.slice(0, 300) }, token);
    }
  })().finally(() => inFlight.delete(visitId));
  inFlight.set(visitId, job);
  return job;
};

/** Watchdog del panel: reintenta pendientes/fallidos recientes y generaciones colgadas. */
export const retryStaleSummaries = async (visits: Visit[]): Promise<void> => {
  if (!aiAvailable.summary) return;
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  for (const v of visits) {
    if (!v.intake || new Date(v.createdAt).getTime() < dayAgo) continue;
    const st = v.ai.status;
    const requestedAgo = v.ai.requestedAt ? Date.now() - new Date(v.ai.requestedAt).getTime() : Infinity;
    const stale = st === 'generating' && v.ai.startedAt && Date.now() - new Date(v.ai.startedAt).getTime() > AI_STALE_MS;
    if ((st === 'pending' && requestedAgo > 20_000) || (st === 'failed' && (v.ai.attempts ?? 0) < 3) || stale) {
      void ensureSummary(v.id);
    }
  }
};

export const regenerateSummary = async (visitId: string): Promise<Visit | null> => {
  const v = await getVisit(visitId);
  if (!v?.intake) return null;
  return ensureSummary(visitId, { force: true });
};

export const summaryProviderLabel = (): string => (hasProxy() ? 'Edge Function' : ENV.isDev ? 'llave local (desarrollo)' : 'sin proveedor');
