import { ENV } from '../env';

/**
 * Canal único hacia los proveedores de IA.
 *  - Con VITE_AI_PROXY_URL: todo pasa por la Edge Function `ai-proxy`
 *    (las llaves viven en el servidor).
 *  - Sin proxy (solo desarrollo): llamada directa con las llaves VITE_*.
 */

export class AiError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  /** Texto crudo del proveedor (para consola/diagnóstico). */
  readonly detail?: string;
  constructor(message: string, status?: number, retryable = false, detail?: string) {
    super(message);
    this.name = 'AiError';
    this.status = status;
    this.retryable = retryable;
    this.detail = detail;
  }
}

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/** Nombre del proveedor según la URL (directa o ruta del proxy). */
const providerOf = (url: string): 'OpenAI' | 'Perplexity' | 'la Edge Function ai-proxy' => {
  if (/api\.openai\.com|\/summary$|\/transcribe$/.test(url)) return 'OpenAI';
  if (/api\.perplexity\.ai|\/research$/.test(url)) return 'Perplexity';
  return 'la Edge Function ai-proxy';
};

/** Extrae el mensaje del cuerpo de error (JSON anidado del proxy o del proveedor). */
const unwrap = (body: string): string => {
  let value: unknown = body;
  for (let i = 0; i < 3 && typeof value === 'string'; i++) {
    try {
      const j = JSON.parse(value) as { error?: unknown; message?: unknown };
      const next = typeof j.error === 'string' ? j.error : j.error && typeof j.error === 'object' && 'message' in j.error ? (j.error as { message?: unknown }).message : j.message;
      if (typeof next !== 'string') break;
      value = next;
    } catch {
      break;
    }
  }
  return String(value ?? body)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
};

/** Convierte una respuesta no-OK en un AiError con mensaje accionable en español. */
export const describeAiError = (url: string, status: number, body: string): AiError => {
  const provider = providerOf(url);
  const viaProxy = Boolean(ENV.aiProxyUrl) && url.startsWith(ENV.aiProxyUrl);
  const detail = unwrap(body);
  const where = viaProxy ? 'en los secretos de la Edge Function ai-proxy (supabase secrets set …) y vuelva a desplegarla' : 'en .env y reinicie "npm run dev"';
  const retryable = RETRYABLE.has(status);
  switch (status) {
    case 401:
      return new AiError(`Llave de ${provider} inválida o revocada. Genere una nueva y actualícela ${where}.`, status, false, detail);
    case 402:
      return new AiError(`${provider} rechazó la solicitud por falta de crédito en la cuenta.`, status, false, detail);
    case 403:
      return new AiError(`${provider} no autoriza la solicitud (permisos de la llave u origen no permitido). ${detail}`, status, false, detail);
    case 404:
      return new AiError(`${provider}: modelo o ruta no encontrada. ${detail}`, status, false, detail);
    case 429:
      return new AiError(`${provider} está limitando las solicitudes; intente de nuevo en un momento.`, status, true, detail);
    default:
      if (status >= 500) return new AiError(`${provider} no responde (${status}). ${retryable ? 'Se reintentará.' : ''}`.trim(), status, retryable, detail);
      return new AiError(`${provider} devolvió ${status}: ${detail}`, status, retryable, detail);
  }
};

export const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  { retries = 2, timeoutMs = 60_000, baseDelayMs = 1_000 }: { retries?: number; timeoutMs?: number; baseDelayMs?: number } = {},
): Promise<Response> => {
  let attempt = 0;
  let lastError: unknown;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      const body = await res.text().catch(() => '');
      lastError = describeAiError(url, res.status, body);
      console.warn('[ai]', url.replace(/\?.*$/, ''), res.status, (lastError as AiError).detail);
      if (!RETRYABLE.has(res.status)) throw lastError;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof AiError && !err.retryable) throw err;
      lastError =
        err instanceof AiError
          ? err
          : new AiError(
              err instanceof Error && err.name === 'AbortError' ? `${providerOf(url)} tardó demasiado en responder.` : `No se pudo conectar con ${providerOf(url)} (red o CORS). ${err instanceof Error ? err.message : ''}`.trim(),
              undefined,
              true,
            );
    }
    attempt++;
    if (attempt <= retries) await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)));
  }
  throw lastError instanceof Error ? lastError : new AiError('Error desconocido');
};

export const hasProxy = () => Boolean(ENV.aiProxyUrl);

/** POST JSON al proxy. `path` = summary | research. */
export const proxyJson = async <T>(path: string, body: unknown, opts?: { timeoutMs?: number }): Promise<T> => {
  const res = await fetchWithRetry(
    `${ENV.aiProxyUrl}/${path}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ENV.supabaseAnonKey, Authorization: `Bearer ${ENV.supabaseAnonKey}` },
      body: JSON.stringify(body),
    },
    { timeoutMs: opts?.timeoutMs },
  );
  return (await res.json()) as T;
};

export const proxyForm = async <T>(path: string, form: FormData, opts?: { timeoutMs?: number }): Promise<T> => {
  const res = await fetchWithRetry(
    `${ENV.aiProxyUrl}/${path}`,
    { method: 'POST', headers: { apikey: ENV.supabaseAnonKey, Authorization: `Bearer ${ENV.supabaseAnonKey}` }, body: form },
    { timeoutMs: opts?.timeoutMs, retries: 1 },
  );
  return (await res.json()) as T;
};
