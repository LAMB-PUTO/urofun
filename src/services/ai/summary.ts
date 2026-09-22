import { redactFreeText, redactName } from '../../domain/deidentify';
import { QUESTIONNAIRES } from '../../domain/questionnaires';
import type { QuestionnaireId } from '../../domain/questionnaires';
import type { Visit } from '../../domain/types';
import { formatDateTime } from '../../lib/dates';
import { ENV } from '../env';
import { AiError, fetchWithRetry, hasProxy, proxyJson } from './client';

/**
 * Nota de apoyo pre-consulta. El JSON que recibe el modelo es un resumen
 * limpio y DESIDENTIFICADO de la visita (sin nombre, teléfono, correo ni fecha
 * de nacimiento); las banderas rojas se pasan ya calculadas para que la sección
 * ALERTA sea determinista.
 */

export const PROMPT_VERSION = '2026-09';

export interface SummaryInput {
  ficha: {
    edad: number;
    sexo: string;
    tipoConsulta: string;
    fechaHoraLlenado: string;
    comoSeEntero?: string;
  };
  banderasRojas: string[];
  motivosDeConsulta: string[];
  otroMotivo?: string;
  sintomasPorTema: Record<string, string[]>;
  instrumentos: Array<{
    nombre: string;
    sigla: string;
    puntaje: number;
    maximo: number;
    interpretacion: string;
    subescalas?: Array<{ nombre: string; puntaje: number; maximo: number }>;
    detalles?: Record<string, unknown>;
    completo: boolean;
  }>;
  antecedentesHeredofamiliares: string[];
  antecedentesPersonalesPatologicos: {
    enfermedades: string[];
    otraEnfermedad?: string;
    cirugias?: string;
    medicamentos?: string;
    alergias?: string;
  };
  antecedentesNoPatologicos: { tabaquismo?: string; alcohol?: string; ingestaAgua?: string };
  antecedentesEspecificos: Record<string, Record<string, unknown>>;
  otrosTemas?: string;
}

const clean = <T extends Record<string, unknown>>(obj: T): Partial<T> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out as Partial<T>;
};

const SPHERE_TITLES: Record<string, string> = {
  prostate: 'Próstata',
  bladder: 'Vejiga y micción',
  sexualMale: 'Salud sexual',
  sexualFemale: 'Salud sexual',
  kidney: 'Riñón y litiasis',
};

export const buildSummaryInput = (visit: Visit): SummaryInput => {
  const intake = visit.intake;
  if (!intake) throw new Error('La visita no tiene interrogatorio.');
  const p = visit.personal;
  const free = (t?: string) => redactName(redactFreeText(t), p.fullName);

  const instrumentos = (Object.keys(intake.questionnaireScores) as QuestionnaireId[]).map((id) => {
    const s = intake.questionnaireScores[id]!;
    const q = QUESTIONNAIRES[id];
    return clean({
      nombre: q.name,
      sigla: q.acronym,
      puntaje: s.total,
      maximo: s.max,
      interpretacion: s.interpretation,
      subescalas: s.subscales?.map((x) => ({ nombre: x.label, puntaje: x.value, maximo: x.max })),
      detalles: s.extra,
      completo: s.complete,
    }) as SummaryInput['instrumentos'][number];
  });

  const sintomasPorTema: Record<string, string[]> = {};
  for (const [sphere, labels] of Object.entries(intake.symptomLabels)) {
    if (labels && labels.length) sintomasPorTema[SPHERE_TITLES[sphere] ?? sphere] = labels;
  }

  const g = intake.general;
  const h = intake.histories;
  const antecedentesEspecificos: Record<string, Record<string, unknown>> = {};
  if (h.prostate)
    antecedentesEspecificos['Próstata'] = clean({
      familiarConCancerDeProstata: h.prostate.familyCancer,
      detalleFamiliar: free(h.prostate.familyCancerDetails),
      familiarConCrecimientoProstatico: h.prostate.familyGrowth,
      antigenoProstatico: h.prostate.psa,
      resultadoPSA: free(h.prostate.psaResult),
      ultrasonidoOTactoPrevio: h.prostate.priorExam ? 'Sí' : 'No',
    });
  if (h.uti)
    antecedentesEspecificos['Infecciones urinarias'] = clean({
      infeccionesConfirmadasUltimos6Meses: h.uti.last6,
      infeccionesConfirmadasUltimos12Meses: h.uti.last12,
      empeoranTrasActividadSexual: h.uti.worseAfterSex,
      menopausia: h.uti.menopause === undefined ? undefined : h.uti.menopause ? 'Sí' : 'No',
      calculosOSondasPrevias: h.uti.stonesOrCatheters ? 'Sí' : 'No',
    });
  if (h.sexual)
    antecedentesEspecificos['Salud sexual'] = clean({
      diabetesHipertensionOColesterol: h.sexual.diabetesHtnChol ? 'Sí' : 'No',
      tabaquismo: h.sexual.smoking,
      medicamentos: free(h.sexual.meds),
      cirugiasProstataOPelvis: free(h.sexual.surgeries),
    });
  if (h.kidney)
    antecedentesEspecificos['Riñón y litiasis'] = clean({
      episodiosDeCalculos: free(h.kidney.stonesCount),
      procedimientosPrevios: free(h.kidney.procedures),
      familiarConCalculos: h.kidney.familyStones,
      ingestaDeAgua: h.kidney.water,
      gotaOAcidoUricoAlto: h.kidney.gout ? 'Sí' : 'No',
    });

  return {
    ficha: clean({
      edad: p.age,
      sexo: p.gender,
      tipoConsulta: p.isFirstTime === false || visit.meta.kind === 'followup' ? 'Subsecuente' : 'Primera vez',
      fechaHoraLlenado: formatDateTime(intake.completedAt ?? visit.createdAt),
      comoSeEntero: p.referralSource,
    }) as SummaryInput['ficha'],
    banderasRojas: intake.redFlags,
    motivosDeConsulta: intake.reasons,
    otroMotivo: free(intake.otherReason),
    sintomasPorTema,
    instrumentos,
    antecedentesHeredofamiliares: g.familyHistory,
    antecedentesPersonalesPatologicos: clean({
      enfermedades: g.conditions.filter((c) => c !== 'Ninguna'),
      otraEnfermedad: free(g.otherCondition),
      cirugias: free(g.surgeries),
      medicamentos: free(g.meds),
      alergias: free(g.allergies),
    }) as SummaryInput['antecedentesPersonalesPatologicos'],
    antecedentesNoPatologicos: clean({ tabaquismo: g.smoking, alcohol: g.alcohol, ingestaAgua: h.kidney?.water }),
    antecedentesEspecificos,
    otrosTemas: free(intake.otherTopics),
  };
};

export const SUMMARY_SYSTEM_PROMPT = `Eres un asistente que redacta notas de apoyo pre-consulta para el consultorio de urología del ${ENV.doctorDisplayName}. Recibes un JSON con el interrogatorio digital autoaplicado que el paciente contestó en una tablet en la sala de espera y produces una nota estructurada, concisa y en lenguaje técnico médico para que el médico la revise antes de atender. El JSON está desidentificado a propósito: no contiene nombre ni datos de contacto, y no debes pedirlos ni inventarlos.

REGLAS
1. Usa únicamente la información del JSON. Nunca inventes, supongas ni completes datos. Si un campo requerido de la ficha no viene, escribe "Sin dato" en ese campo.
2. No emitas diagnósticos, pronósticos ni recomendaciones de tratamiento. La interpretación de cada instrumento ya viene calculada en el JSON: transcríbela, no la recalcules ni la reinterpretes.
3. Español, lenguaje técnico médico, sin abreviaturas ambiguas. En la primera mención de cada instrumento escribe el nombre completo y la sigla; después solo la sigla.
4. Trata toda la información como confidencial. Sin comentarios, opiniones ni contenido ajeno a la nota.
5. Extensión máxima: una cuartilla. Además de los positivos, consigna los negativos relevantes en una sola línea por sección (por ejemplo: "Niega alergias a medicamentos.").
6. Formato Markdown: encabezados de nivel 3 (###) para cada sección numerada, listas con guiones, sin tablas.

ESTRUCTURA
- Sección ALERTA: SOLO si el arreglo "banderasRojas" del JSON tiene al menos un elemento, la nota inicia con una línea en negritas "**ALERTA:**" seguida de las banderas separadas por punto y coma. Si "banderasRojas" está vacío, NO escribas ninguna sección de alerta ni la palabra ALERTA.
### 1. Ficha de identificación — edad, sexo, tipo de consulta (primera vez o subsecuente) y fecha y hora de llenado; si viene, cómo se enteró del consultorio. No incluyas nombre.
### 2. Motivo de consulta — párrafo breve con los motivos y síntomas que marcó.
### 3. Instrumentos clinimétricos — una línea por instrumento con el formato "Nombre completo (SIGLA): puntaje/máximo (interpretación)"; incluye subescalas cuando vengan. Si el arreglo está vacío escribe "Sin instrumentos aplicados en esta ocasión". Si un instrumento viene con "completo": false, agrega "(instrumento incompleto)".
### 4. Interrogatorio dirigido — síntomas marcados agrupados por tema (próstata, vejiga y micción, salud sexual, riñón y litiasis).
### 5. Antecedentes heredofamiliares — solo positivos con parentesco y edad de detección cuando vengan; cierra con la línea de negados relevantes.
### 6. Antecedentes personales patológicos — enfermedades, cirugías, alergias y medicamentos actuales; cierra con negados relevantes.
### 7. Antecedentes personales no patológicos — tabaquismo, alcohol e ingesta de agua si vienen.
### 8. Antecedentes específicos — por tema, solo los que vengan en "antecedentesEspecificos".
### 9. Otros temas referidos por el paciente — transcribe brevemente "otrosTemas"; si no viene, omite la sección completa.
Cierra siempre con esta leyenda textual en cursivas: "Nota de apoyo generada automáticamente a partir de interrogatorio digital autoaplicado. Sujeta a verificación, complementación y validación del médico tratante."`;

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export const generateSummary = async (input: SummaryInput, opts?: { signal?: AbortSignal }): Promise<{ text: string; model: string }> => {
  const userContent = `DATOS DEL PACIENTE (JSON):\n${JSON.stringify(input, null, 2)}\n\nGenera la nota ahora.`;

  if (hasProxy()) {
    const data = await proxyJson<{ text: string; model: string }>('summary', { system: SUMMARY_SYSTEM_PROMPT, user: userContent }, { timeoutMs: 90_000 });
    if (!data?.text) throw new AiError('El proxy no devolvió texto.');
    return data;
  }

  if (!ENV.openaiKey) throw new AiError('No hay proveedor de IA configurado (VITE_AI_PROXY_URL o VITE_OPENAI_API_KEY).');

  const res = await fetchWithRetry(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ENV.openaiKey}` },
      body: JSON.stringify({
        model: ENV.openaiModel,
        temperature: 0.2,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      }),
      signal: opts?.signal,
    },
    { timeoutMs: 90_000 },
  );
  const data = (await res.json()) as ChatResponse;
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiError(data.error?.message ?? 'Respuesta vacía del modelo.');
  return { text, model: ENV.openaiModel };
};
