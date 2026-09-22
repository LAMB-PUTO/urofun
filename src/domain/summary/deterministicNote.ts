import { QUESTIONNAIRES } from '../questionnaires';
import type { QuestionnaireId } from '../questionnaires';
import type { Visit } from '../types';
import { formatDateTime } from '../../lib/dates';

const SPHERE_TITLES: Record<string, string> = {
  prostate: 'Próstata',
  bladder: 'Vejiga y micción',
  sexualMale: 'Salud sexual',
  sexualFemale: 'Salud sexual',
  kidney: 'Riñón y litiasis',
};

const line = (label: string, value?: string | null) => (value && value.trim() ? `- **${label}:** ${value.trim()}` : null);

/**
 * Nota de resumen generada SIN IA a partir de los datos estructurados.
 * Se usa cuando el resumen de OpenAI no existe, falló o está pendiente.
 */
export const deterministicNote = (visit: Visit): string => {
  const intake = visit.intake;
  const legacy = visit.legacyIntake;
  const p = visit.personal;
  const out: string[] = [];

  const redFlags = intake?.redFlags ?? legacy?.redFlags ?? [];
  if (redFlags.length) out.push(`**ALERTA:** ${redFlags.join('; ')}.`, '');

  out.push('### 1. Ficha de identificación');
  out.push(`Paciente de ${p.age} años, ${p.gender.toLowerCase()}, ${p.isFirstTime === false || visit.meta.kind === 'followup' ? 'subsecuente' : 'primera vez'}. Interrogatorio llenado el ${formatDateTime(intake?.completedAt ?? visit.createdAt)}.`);
  if (p.referralSource) out.push(`Cómo se enteró: ${p.referralSource}${p.referredByDoctor ? ` (${p.referredByDoctor})` : ''}.`);
  out.push('');

  const reasons = intake?.reasons ?? legacy?.reasons ?? [];
  out.push('### 2. Motivo de consulta');
  out.push(reasons.length ? reasons.join(', ') + (intake?.otherReason ? `. Otro: ${intake.otherReason}` : '') + '.' : 'Sin dato.');
  out.push('');

  const scores = intake?.questionnaireScores ?? legacy?.questionnaireScores ?? {};
  out.push('### 3. Instrumentos clinimétricos');
  const ids = Object.keys(scores) as QuestionnaireId[];
  if (!ids.length) out.push('Sin instrumentos aplicados en esta ocasión.');
  for (const id of ids) {
    const s = scores[id]!;
    const q = QUESTIONNAIRES[id];
    const sub = s.subscales?.length ? ` · ${s.subscales.map((x) => `${x.label} ${x.value}/${x.max}`).join(', ')}` : '';
    const incomplete = s.complete === false ? ' (instrumento incompleto)' : '';
    out.push(`- ${q.name} (${q.acronym}): ${s.total}/${s.max} (${s.interpretation})${sub}${incomplete}`);
  }
  out.push('');

  const labels = intake?.symptomLabels ?? legacy?.symptomLabels ?? {};
  out.push('### 4. Interrogatorio dirigido');
  const entries = Object.entries(labels).filter(([, v]) => v && v.length);
  if (!entries.length) out.push('Sin síntomas específicos marcados.');
  for (const [sphere, v] of entries) out.push(`- **${SPHERE_TITLES[sphere] ?? sphere}:** ${v!.join('; ')}.`);
  out.push('');

  if (intake) {
    const g = intake.general;
    out.push('### 5. Antecedentes heredofamiliares');
    out.push(g.familyHistory.length && !g.familyHistory.every((f) => f.startsWith('Ninguna')) ? g.familyHistory.join(', ') + '.' : 'Niega antecedentes heredofamiliares relevantes.');
    out.push('');

    out.push('### 6. Antecedentes personales patológicos');
    const conds = g.conditions.filter((c) => c !== 'Ninguna');
    const items = [
      line('Enfermedades', conds.length ? conds.join(', ') : 'Niega'),
      line('Otra', g.otherCondition),
      line('Cirugías', g.surgeries || 'Niega'),
      line('Medicamentos actuales', g.meds || 'Niega'),
      line('Alergias', g.allergies || 'Niega alergias a medicamentos'),
    ].filter(Boolean) as string[];
    out.push(...items, '');

    out.push('### 7. Antecedentes personales no patológicos');
    out.push(...([line('Tabaquismo', g.smoking), line('Alcohol', g.alcohol), line('Ingesta de agua', intake.histories.kidney?.water)].filter(Boolean) as string[]), '');

    const h = intake.histories;
    const specific: string[] = [];
    if (h.prostate)
      specific.push(
        `- **Próstata:** familiar con cáncer de próstata: ${h.prostate.familyCancer}${h.prostate.familyCancerDetails ? ` (${h.prostate.familyCancerDetails})` : ''}; crecimiento prostático familiar: ${h.prostate.familyGrowth}; PSA: ${h.prostate.psa}${h.prostate.psaResult ? ` (${h.prostate.psaResult})` : ''}; ultrasonido o tacto previo: ${h.prostate.priorExam ? 'sí' : 'no'}.`,
      );
    if (h.uti)
      specific.push(
        `- **Infecciones urinarias:** ${h.uti.last6} en 6 meses, ${h.uti.last12} en 12 meses; relación con actividad sexual: ${h.uti.worseAfterSex}${h.uti.menopause !== undefined ? `; menopausia: ${h.uti.menopause ? 'sí' : 'no'}` : ''}; cálculos o sondas previas: ${h.uti.stonesOrCatheters ? 'sí' : 'no'}.`,
      );
    if (h.sexual)
      specific.push(
        `- **Salud sexual:** diabetes/hipertensión/colesterol: ${h.sexual.diabetesHtnChol ? 'sí' : 'no'}; tabaquismo: ${h.sexual.smoking}; medicamentos: ${h.sexual.meds || 'niega'}; cirugías de próstata o pelvis: ${h.sexual.surgeries || 'niega'}.`,
      );
    if (h.kidney)
      specific.push(
        `- **Riñón y litiasis:** episodios de cálculos: ${h.kidney.stonesCount || 'sin dato'}; procedimientos: ${h.kidney.procedures || 'ninguno'}; familiar con cálculos: ${h.kidney.familyStones}; gota o ácido úrico alto: ${h.kidney.gout ? 'sí' : 'no'}.`,
      );
    if (specific.length) out.push('### 8. Antecedentes específicos', ...specific, '');

    if (intake.otherTopics?.trim()) out.push('### 9. Otros temas referidos por el paciente', `_${intake.otherTopics.trim()}_`, '');
  } else if (legacy?.otherTopics) {
    out.push('### Otros temas referidos por el paciente', `_${legacy.otherTopics}_`, '');
  }

  out.push('_Resumen estructurado generado a partir del interrogatorio digital, sin inteligencia artificial. Sujeto a verificación del médico tratante._');
  return out.join('\n');
};
