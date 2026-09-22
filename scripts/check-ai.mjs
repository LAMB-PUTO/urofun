// Verifica las llaves de IA configuradas (en .env o vía VITE_AI_PROXY_URL) sin abrir la app.
//   npm run check:ai
// OpenAI se prueba con un endpoint gratuito; Perplexity con una solicitud mínima.
import { createServer } from 'vite';

const server = await createServer({ root: process.cwd(), configFile: 'vite.config.ts', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
const H = await server.ssrLoadModule('/src/services/ai/health.ts');
const r = await H.checkAiProviders();
const mode = r.mode === 'proxy' ? 'Edge Function (VITE_AI_PROXY_URL)' : r.mode === 'local' ? 'llaves locales de .env' : 'sin proveedor configurado';
console.log(`\nProveedores de IA · modo: ${mode}\n`);
for (const [label, check] of [
  ['OpenAI (resumen y dictado)', r.openai],
  ['Perplexity (investigación)', r.perplexity],
]) {
  console.log(`  ${check.ok ? '✔' : '✘'} ${label}${check.status ? ` [${check.status}]` : ''}: ${check.message}`);
}
if (!r.openai.ok || !r.perplexity.ok) console.log(`\n  Cómo corregir: ${H.aiFixHint(r.mode)}`);
console.log('');
await server.close();
process.exit(r.openai.ok && r.perplexity.ok ? 0 : 1);
