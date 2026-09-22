import { redactFreeText, redactName } from '../../domain/deidentify';
import type { Visit } from '../../domain/types';
import { ENV } from '../env';
import { AiError, fetchWithRetry, hasProxy, proxyJson } from './client';

/**
 * Investigación clínica con Perplexity (sonar). Devuelve el texto en Markdown y
 * las fuentes citadas, que la UI muestra como lista numerada.
 */

export interface ResearchSource {
  index: number;
  url: string;
  title?: string;
  date?: string;
}

export interface ResearchResult {
  content: string;
  sources: ResearchSource[];
  model: string;
}

export interface ResearchMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const RESEARCH_SYSTEM_PROMPT = `Eres un asistente de investigación para un urólogo. Respondes en español con precisión clínica y citas verificables.
Prioriza guías vigentes de la American Urological Association (AUA), la European Association of Urology (EAU) y la International Continence Society (ICS), y después revisiones sistemáticas y ensayos recientes.
Estructura: respuesta directa en 2-4 líneas; después secciones breves con encabezados (###) según aplique: Recomendación de guías (con año y grado/nivel de evidencia cuando exista), Evidencia clave, Dosis o consideraciones prácticas, Puntos de controversia. Termina con "Fuentes" solo si el sistema no las adjunta automáticamente.
Nunca inventes citas. Si la evidencia es insuficiente, dilo. No des recomendaciones para un paciente individual: la decisión clínica es del médico tratante.`;

/** Contexto de caso des-identificado para sembrar una consulta. */
export const caseContext = (visit: Visit): string => {
  const p = visit.personal;
  const intake = visit.intake;
  const legacy = visit.legacyIntake;
  const lines: string[] = [`Caso: ${p.gender === 'Femenino' ? 'mujer' : 'hombre'} de ${p.age} años.`];
  const reasons = intake?.reasons ?? legacy?.reasons ?? [];
  if (reasons.length) lines.push(`Motivo: ${reasons.join(', ')}.`);
  const scores = intake?.questionnaireScores ?? legacy?.questionnaireScores ?? {};
  const scoreLines = Object.values(scores)
    .filter(Boolean)
    .map((s) => `${s!.acronym} ${s!.total}/${s!.max} (${s!.interpretation})`);
  if (scoreLines.length) lines.push(`Instrumentos: ${scoreLines.join('; ')}.`);
  const flags = intake?.redFlags ?? legacy?.redFlags ?? [];
  if (flags.length) lines.push(`Banderas rojas: ${flags.join('; ')}.`);
  const dx = redactName(redactFreeText(visit.notes?.diagnosis), p.fullName);
  if (dx) lines.push(`Diagnóstico de trabajo: ${dx}.`);
  return lines.join(' ');
};

interface PerplexityResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  citations?: string[];
  search_results?: Array<{ title?: string; url?: string; date?: string }>;
  error?: { message?: string };
}

const parse = (data: PerplexityResponse): ResearchResult => {
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new AiError(data.error?.message ?? 'Respuesta vacía de Perplexity.');
  const urls = data.citations ?? data.search_results?.map((r) => r.url ?? '').filter(Boolean) ?? [];
  const meta = new Map((data.search_results ?? []).map((r) => [r.url, r]));
  const sources: ResearchSource[] = urls.map((url, i) => ({ index: i + 1, url, title: meta.get(url)?.title, date: meta.get(url)?.date }));
  return { content, sources, model: data.model ?? ENV.perplexityModel };
};

export const research = async (messages: ResearchMessage[], opts?: { signal?: AbortSignal }): Promise<ResearchResult> => {
  const body = {
    model: ENV.perplexityModel,
    messages: [{ role: 'system', content: RESEARCH_SYSTEM_PROMPT }, ...messages],
    temperature: 0.1,
  };

  if (hasProxy()) {
    const data = await proxyJson<PerplexityResponse>('research', body, { timeoutMs: 90_000 });
    return parse(data);
  }

  if (!ENV.perplexityKey) throw new AiError('No hay proveedor configurado para investigación (VITE_AI_PROXY_URL o VITE_PERPLEXITY_API_KEY).');

  const res = await fetchWithRetry(
    'https://api.perplexity.ai/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ENV.perplexityKey}` },
      body: JSON.stringify(body),
      signal: opts?.signal,
    },
    { timeoutMs: 90_000 },
  );
  return parse((await res.json()) as PerplexityResponse);
};

export const RESEARCH_PRESETS: Array<{ label: string; query: string }> = [
  { label: 'HPB: primera línea (AUA 2024)', query: '¿Cuál es el tratamiento médico de primera línea para la hiperplasia prostática benigna con IPSS moderado según la guía AUA más reciente? Incluye alfa-bloqueadores, 5-ARI y combinaciones, con grado de recomendación.' },
  { label: 'Vejiga hiperactiva: escalonamiento', query: 'Resume el manejo escalonado de la vejiga hiperactiva según AUA/SUFU: terapia conductual, antimuscarínicos vs beta-3 agonistas, y terapias de tercera línea (onabotulinumtoxinA, neuromodulación).' },
  { label: 'Litiasis: expulsión médica', query: '¿Cuándo está indicada la terapia médica expulsiva para litiasis ureteral y con qué fármaco, según las guías AUA/EAU vigentes? Tamaño y localización del cálculo.' },
  { label: 'ITU recurrente en mujeres', query: '¿Qué estrategias de profilaxis recomienda la guía AUA/CUA/SUFU para infección urinaria recurrente no complicada en mujeres, incluyendo estrógeno vaginal y profilaxis antibiótica?' },
  { label: 'Disfunción eréctil: PDE5 y evaluación', query: 'Según la guía AUA de disfunción eréctil, ¿qué evaluación inicial se recomienda y cuál es el papel de los inhibidores de PDE5 como primera línea? Menciona contraindicaciones.' },
  { label: 'Hematuria: estratificación de riesgo', query: '¿Cómo estratifica el riesgo la guía AUA/SUFU de microhematuria y qué estudios se recomiendan en cada categoría?' },
];
