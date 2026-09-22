// Supabase Edge Function: ai-proxy
// Envuelve OpenAI (resumen + transcripción) y Perplexity (investigación) para que
// las llaves NUNCA lleguen al navegador, y verifica el PIN de recepción. Despliegue:
//   supabase secrets set OPENAI_API_KEY=... PERPLEXITY_API_KEY=... RECEPTION_PIN=... AI_PROXY_ALLOWED_ORIGINS=https://tu-dominio
//   supabase functions deploy ai-proxy --no-verify-jwt
// y en el frontend: VITE_AI_PROXY_URL=https://<project>.supabase.co/functions/v1/ai-proxy
//
// Toda solicitud debe traer la llave anon del proyecto en `apikey` (la app ya la manda):
// no es un secreto, pero descarta el abuso anónimo casual; el resto lo hace el límite por IP.
//
// Rutas: POST /summary { user }  ->  { text, model }        (el prompt de sistema vive aquí)
//        POST /transcribe  (multipart: file, language?, prompt?) -> { text }
//        POST /research { messages[{role:user|assistant,content}], temperature } -> respuesta de Perplexity
//        POST /reception-login { pin } -> { ok }               (compara con RECEPTION_PIN)
//        GET  /health -> { openai: {ok, message}, perplexity: {ok, message} }   (cacheado 60 s)

import { RESEARCH_SYSTEM_PROMPT, summarySystemPrompt } from './prompts.ts';

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const PERPLEXITY_KEY = Deno.env.get('PERPLEXITY_API_KEY') ?? '';
const RECEPTION_PIN = Deno.env.get('RECEPTION_PIN') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ALLOWED_ORIGINS = (Deno.env.get('AI_PROXY_ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim());
const SUMMARY_MODEL = Deno.env.get('OPENAI_SUMMARY_MODEL') ?? 'gpt-4o-mini';
const TRANSCRIBE_MODEL = Deno.env.get('OPENAI_TRANSCRIBE_MODEL') ?? 'whisper-1';
const RESEARCH_MODEL = Deno.env.get('PERPLEXITY_MODEL') ?? 'sonar-pro';
const DOCTOR_NAME = Deno.env.get('DOCTOR_NAME') ?? 'Dr. Miguel Ángel Sandoval Valle';
const SUMMARY_SYSTEM_PROMPT = summarySystemPrompt(DOCTOR_NAME);

// Límite por IP y global en memoria (por instancia). La IP se toma del ÚLTIMO salto de
// x-forwarded-for (el que agrega la plataforma), no del primero, que el cliente puede inventar.
const bucket = new Map<string, { count: number; reset: number }>();
const LIMIT_PER_MIN = 20;
const GLOBAL_LIMIT_PER_MIN = 120;
const globalBucket = { count: 0, reset: 0 };

const clientIp = (req: Request): string => {
  const cf = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip');
  if (cf) return cf.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (!xff) return 'unknown';
  const hops = xff.split(',').map((s) => s.trim()).filter(Boolean);
  return hops[hops.length - 1] ?? 'unknown';
};

const rateLimited = (ip: string): boolean => {
  const now = Date.now();
  if (globalBucket.reset < now) {
    globalBucket.count = 0;
    globalBucket.reset = now + 60_000;
  }
  globalBucket.count++;
  if (globalBucket.count > GLOBAL_LIMIT_PER_MIN) return true;
  const b = bucket.get(ip);
  if (!b || b.reset < now) {
    bucket.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  b.count++;
  return b.count > LIMIT_PER_MIN;
};

const timingSafeEqual = (a: string, b: string): boolean => {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};

let healthCache: { at: number; body: unknown } | null = null;

const cors = (origin: string | null) => {
  const allow = ALLOWED_ORIGINS.includes('*') || (origin && ALLOWED_ORIGINS.includes(origin)) ? origin ?? '*' : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const path = new URL(req.url).pathname.split('/').filter(Boolean).pop();
  if (req.method !== 'POST' && !(req.method === 'GET' && path === 'health')) return json({ error: 'Método no permitido' }, 405, headers);

  const ip = clientIp(req);
  if (rateLimited(ip)) return json({ error: 'Demasiadas solicitudes, intenta en un minuto.' }, 429, headers);

  // La app manda la llave anon en `apikey`; sin ella no se atiende nada.
  const apikey = req.headers.get('apikey') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (ANON_KEY && !timingSafeEqual(apikey, ANON_KEY)) return json({ error: 'No autorizado' }, 401, headers);

  try {
    if (path === 'reception-login') {
      if (!RECEPTION_PIN) return json({ error: 'RECEPTION_PIN no configurado en los secretos' }, 500, headers);
      const { pin } = await req.json().catch(() => ({}));
      if (typeof pin !== 'string' || pin.length > 32) return json({ error: 'Entrada inválida' }, 400, headers);
      if (!timingSafeEqual(pin.trim(), RECEPTION_PIN)) return json({ ok: false, error: 'PIN incorrecto' }, 401, headers);
      return json({ ok: true }, 200, headers);
    }

    if (path === 'health') {
      if (healthCache && Date.now() - healthCache.at < 60_000) return json(healthCache.body, 200, headers);
      const probe = async (name: string, fn: () => Promise<Response>, okMessage: string) => {
        try {
          const r = await fn();
          if (r.ok) return { ok: true, message: okMessage };
          const text = (await r.text()).replace(/\s+/g, ' ').slice(0, 200);
          const message = r.status === 401 ? `Llave de ${name} inválida o revocada: actualice el secreto y vuelva a desplegar ai-proxy.` : `${name} devolvió ${r.status}: ${text}`;
          return { ok: false, status: r.status, message };
        } catch (err) {
          return { ok: false, message: `No se pudo conectar con ${name}: ${err instanceof Error ? err.message : 'error'}` };
        }
      };
      const openai = OPENAI_KEY
        ? await probe('OpenAI', () => fetch(`https://api.openai.com/v1/models/${encodeURIComponent(SUMMARY_MODEL)}`, { headers: { Authorization: `Bearer ${OPENAI_KEY}` } }), `Llave válida · modelo ${SUMMARY_MODEL} disponible`)
        : { ok: false, message: 'OPENAI_API_KEY no configurada en los secretos' };
      const perplexity = PERPLEXITY_KEY
        ? await probe(
            'Perplexity',
            () =>
              fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PERPLEXITY_KEY}` },
                body: JSON.stringify({ model: RESEARCH_MODEL, messages: [{ role: 'user', content: 'Responde únicamente: ok' }], max_tokens: 16 }),
              }),
            `Llave válida · modelo ${RESEARCH_MODEL} responde`,
          )
        : { ok: false, message: 'PERPLEXITY_API_KEY no configurada en los secretos' };
      const body = { openai, perplexity, models: { summary: SUMMARY_MODEL, transcribe: TRANSCRIBE_MODEL, research: RESEARCH_MODEL } };
      healthCache = { at: Date.now(), body };
      return json(body, 200, headers);
    }

    if (path === 'summary') {
      if (!OPENAI_KEY) return json({ error: 'OPENAI_API_KEY no configurada' }, 500, headers);
      // El prompt de sistema es del servidor: el cliente solo manda los datos desidentificados.
      const { user } = await req.json();
      if (typeof user !== 'string' || user.length > 60_000) return json({ error: 'Entrada inválida' }, 400, headers);
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({ model: SUMMARY_MODEL, temperature: 0.2, max_tokens: 1500, messages: [{ role: 'system', content: SUMMARY_SYSTEM_PROMPT }, { role: 'user', content: user }] }),
      });
      if (!r.ok) return json({ error: await r.text() }, r.status, headers);
      const data = await r.json();
      return json({ text: data.choices?.[0]?.message?.content ?? '', model: SUMMARY_MODEL }, 200, headers);
    }

    if (path === 'transcribe') {
      if (!OPENAI_KEY) return json({ error: 'OPENAI_API_KEY no configurada' }, 500, headers);
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File) || file.size > 25 * 1024 * 1024) return json({ error: 'Archivo inválido' }, 400, headers);
      const out = new FormData();
      out.append('file', file, file.name || 'audio.webm');
      out.append('model', TRANSCRIBE_MODEL);
      out.append('language', String(form.get('language') ?? 'es'));
      const prompt = form.get('prompt');
      if (typeof prompt === 'string') out.append('prompt', prompt);
      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}` }, body: out });
      if (!r.ok) return json({ error: await r.text() }, r.status, headers);
      const data = await r.json();
      return json({ text: data.text ?? '' }, 200, headers);
    }

    if (path === 'research') {
      if (!PERPLEXITY_KEY) return json({ error: 'PERPLEXITY_API_KEY no configurada' }, 500, headers);
      const body = await req.json();
      if (!Array.isArray(body?.messages) || body.messages.length > 12) return json({ error: 'Entrada inválida' }, 400, headers);
      // Solo turnos de usuario/asistente acotados; el prompt de sistema es del servidor.
      const messages = (body.messages as Array<{ role?: unknown; content?: unknown }>)
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map((m) => ({ role: m.role as string, content: (m.content as string).slice(0, 8_000) }));
      if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'Entrada inválida' }, 400, headers);
      const r = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PERPLEXITY_KEY}` },
        body: JSON.stringify({ model: RESEARCH_MODEL, messages: [{ role: 'system', content: RESEARCH_SYSTEM_PROMPT }, ...messages], temperature: typeof body.temperature === 'number' ? Math.min(1, Math.max(0, body.temperature)) : 0.1 }),
      });
      if (!r.ok) return json({ error: await r.text() }, r.status, headers);
      return new Response(await r.text(), { status: 200, headers: { 'Content-Type': 'application/json', ...headers } });
    }

    return json({ error: 'Ruta no encontrada' }, 404, headers);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500, headers);
  }
});
