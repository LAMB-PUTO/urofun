import { ENV } from '../env';
import { AiError, fetchWithRetry, hasProxy } from './client';

/**
 * Diagnóstico de proveedores de IA. Con proxy consulta `GET /health` de la
 * Edge Function; sin proxy prueba las llaves locales directamente:
 *  - OpenAI: GET /v1/models/<modelo> (no consume tokens).
 *  - Perplexity: una solicitud mínima (max_tokens 5); no existe endpoint gratuito.
 */

export interface ProviderCheck {
  ok: boolean;
  message: string;
  status?: number;
}

export interface AiHealth {
  mode: 'proxy' | 'local' | 'none';
  openai: ProviderCheck;
  perplexity: ProviderCheck;
  checkedAt: string;
}

const probe = async (fn: () => Promise<void>, okMessage: string): Promise<ProviderCheck> => {
  try {
    await fn();
    return { ok: true, message: okMessage };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error desconocido', status: err instanceof AiError ? err.status : undefined };
  }
};

const missing = (name: string): ProviderCheck => ({ ok: false, message: `Sin ${name} en .env` });

export const checkAiProviders = async (): Promise<AiHealth> => {
  const checkedAt = new Date().toISOString();

  if (hasProxy()) {
    try {
      const res = await fetchWithRetry(
        `${ENV.aiProxyUrl}/health`,
        { method: 'GET', headers: { apikey: ENV.supabaseAnonKey, Authorization: `Bearer ${ENV.supabaseAnonKey}` } },
        { retries: 0, timeoutMs: 30_000 },
      );
      const data = (await res.json()) as Partial<Pick<AiHealth, 'openai' | 'perplexity'>>;
      return {
        mode: 'proxy',
        openai: data.openai ?? { ok: false, message: 'El proxy no reportó OpenAI.' },
        perplexity: data.perplexity ?? { ok: false, message: 'El proxy no reportó Perplexity.' },
        checkedAt,
      };
    } catch (err) {
      const message = `No se pudo consultar la Edge Function ai-proxy: ${err instanceof Error ? err.message : 'error desconocido'}`;
      return { mode: 'proxy', openai: { ok: false, message }, perplexity: { ok: false, message }, checkedAt };
    }
  }

  if (!ENV.openaiKey && !ENV.perplexityKey) {
    return { mode: 'none', openai: missing('VITE_OPENAI_API_KEY'), perplexity: missing('VITE_PERPLEXITY_API_KEY'), checkedAt };
  }

  const openai = ENV.openaiKey
    ? await probe(async () => {
        await fetchWithRetry(`https://api.openai.com/v1/models/${encodeURIComponent(ENV.openaiModel)}`, { headers: { Authorization: `Bearer ${ENV.openaiKey}` } }, { retries: 0, timeoutMs: 20_000 });
      }, `Llave válida · modelo ${ENV.openaiModel} disponible`)
    : missing('VITE_OPENAI_API_KEY');

  const perplexity = ENV.perplexityKey
    ? await probe(async () => {
        const res = await fetchWithRetry(
          'https://api.perplexity.ai/chat/completions',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ENV.perplexityKey}` },
            body: JSON.stringify({ model: ENV.perplexityModel, messages: [{ role: 'user', content: 'Responde únicamente: ok' }], max_tokens: 16 }),
          },
          { retries: 0, timeoutMs: 30_000 },
        );
        await res.json();
      }, `Llave válida · modelo ${ENV.perplexityModel} responde`)
    : missing('VITE_PERPLEXITY_API_KEY');

  return { mode: 'local', openai, perplexity, checkedAt };
};

/** Texto de ayuda según el modo, para mostrar junto a un diagnóstico fallido. */
export const aiFixHint = (mode: AiHealth['mode']): string =>
  mode === 'proxy'
    ? 'Actualice el secreto en Supabase (supabase secrets set OPENAI_API_KEY=… PERPLEXITY_API_KEY=…) y vuelva a desplegar la función ai-proxy.'
    : 'Edite .env (VITE_OPENAI_API_KEY / VITE_PERPLEXITY_API_KEY), guarde y reinicie "npm run dev": Vite solo lee .env al arrancar.';
