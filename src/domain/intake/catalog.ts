import type { QuestionnaireId } from '../questionnaires/types';

/**
 * Catálogo del interrogatorio: motivos de consulta, síntomas por esfera y qué
 * instrumento dispara cada síntoma. Las etiquetas persistidas coinciden con las
 * que ya existen en la base de datos para no romper filas históricas.
 */

export type ReasonKey = 'prostate' | 'bladder' | 'sexual' | 'kidney' | 'checkup' | 'other';

export interface ReasonDef {
  key: ReasonKey;
  /** Etiqueta persistida (compatibilidad con filas existentes y con el prompt de IA). */
  label: string;
  /** Texto corto para chips en el panel. */
  short: string;
  description: string;
  /** Solo se ofrece a este sexo (undefined = ambos). */
  onlyFor?: 'Masculino' | 'Femenino';
}

export const REASONS: ReasonDef[] = [
  { key: 'prostate', label: 'Problemas de próstata', short: 'Próstata', description: 'Chorro débil, levantarse de noche, chequeo de antígeno prostático.', onlyFor: 'Masculino' },
  { key: 'bladder', label: 'Problemas de vejiga o al orinar', short: 'Vejiga', description: 'Escapes de orina, urgencia, ardor, infecciones repetidas.' },
  { key: 'sexual', label: 'Salud sexual', short: 'Salud sexual', description: 'Erección, eyaculación, deseo, dolor en las relaciones.' },
  { key: 'kidney', label: 'Riñón o cálculos (piedras)', short: 'Riñón', description: 'Dolor en el costado, piedras, alteraciones en estudios.' },
  { key: 'checkup', label: 'Chequeo o revisión general', short: 'Chequeo', description: 'Revisión preventiva o seguimiento sin molestias nuevas.' },
  { key: 'other', label: 'Otro', short: 'Otro', description: 'Cualquier otro motivo; podrá describirlo.' },
];

export const reasonByLabel = (label: string): ReasonDef | undefined => REASONS.find((r) => r.label === label);

export type SphereKey = 'prostate' | 'bladder' | 'sexualMale' | 'sexualFemale' | 'kidney';

export interface SymptomDef {
  key: string;
  /** Etiqueta en lenguaje del paciente (también se persiste tal cual). */
  label: string;
  /** Instrumentos que se aplican cuando el síntoma está marcado. */
  triggers?: QuestionnaireId[];
  /** Pasos de antecedentes específicos que se habilitan. */
  enables?: HistoryStepKey[];
  /** Síntoma de alarma según AUA/EAU. */
  redFlag?: string;
}

export type HistoryStepKey = 'prostate_history' | 'uti_history' | 'sexual_history' | 'kidney_history';

export interface SphereDef {
  key: SphereKey;
  reason: ReasonKey;
  title: string;
  prompt: string;
  onlyFor?: 'Masculino' | 'Femenino';
  symptoms: SymptomDef[];
  /** Paso de antecedentes que siempre acompaña a la esfera. */
  history?: HistoryStepKey;
}

export const SPHERES: SphereDef[] = [
  {
    key: 'prostate',
    reason: 'prostate',
    title: 'Próstata',
    prompt: '¿Qué molestias tiene? Puede marcar varias.',
    onlyFor: 'Masculino',
    history: 'prostate_history',
    symptoms: [
      { key: 'weak_stream', label: 'Me cuesta empezar a orinar o el chorro es débil', triggers: ['ipss'] },
      { key: 'nocturia', label: 'Me levanto varias veces en la noche a orinar', triggers: ['ipss'] },
      { key: 'incomplete', label: 'Siento que no vacío la vejiga por completo', triggers: ['ipss'] },
      { key: 'known_bph', label: 'Ya me habían dicho que tengo la próstata crecida', triggers: ['ipss'] },
      { key: 'psa_check', label: 'Quiero un chequeo de próstata (antígeno prostático)' },
      {
        key: 'pelvic_pain',
        label: 'Dolor o molestia en el periné (entre el recto y los testículos), en los testículos, en la punta del pene o al eyacular',
        triggers: ['nih_cpsi'],
      },
      { key: 'retention', label: 'No poder orinar (retención aguda)', redFlag: 'Retención aguda de orina' },
    ],
  },
  {
    key: 'bladder',
    reason: 'bladder',
    title: 'Vejiga o al orinar',
    prompt: '¿Qué molestias tiene? Puede marcar varias.',
    symptoms: [
      { key: 'leak', label: 'Se me sale la orina sin querer', triggers: ['iciq_ui_sf'] },
      { key: 'urgency', label: 'Me dan ganas repentinas y urgentes de orinar, o voy al baño muy seguido', triggers: ['iciq_oab'] },
      { key: 'bladder_pain', label: 'Dolor o presión en la vejiga que empeora cuando se llena o se alivia al orinar', triggers: ['oleary_sant'] },
      { key: 'dysuria', label: 'Ardor o dolor al orinar' },
      { key: 'recurrent_uti', label: 'Infecciones urinarias que se repiten', enables: ['uti_history'] },
      { key: 'hematuria', label: 'He visto sangre en la orina', redFlag: 'Hematuria macroscópica (sangre visible en la orina)' },
    ],
  },
  {
    key: 'sexualMale',
    reason: 'sexual',
    title: 'Salud sexual',
    prompt: '¿Con qué tema le gustaría apoyo? Puede marcar varios. Sus respuestas son confidenciales.',
    onlyFor: 'Masculino',
    history: 'sexual_history',
    symptoms: [
      { key: 'ed', label: 'Dificultad para lograr o mantener la erección', triggers: ['iief_5'] },
      { key: 'pe', label: 'Eyaculo antes de lo que quisiera', triggers: ['pedt'] },
      { key: 'low_t', label: 'Baja de deseo sexual, de energía o sospecha de testosterona baja', triggers: ['adam'] },
      { key: 'peyronie', label: 'Dolor o curvatura del pene' },
      { key: 'talk', label: 'Prefiero platicarlo directamente con el doctor' },
    ],
  },
  {
    key: 'sexualFemale',
    reason: 'sexual',
    title: 'Salud sexual',
    prompt: '¿Con qué tema le gustaría apoyo? Puede marcar varios. Sus respuestas son confidenciales.',
    onlyFor: 'Femenino',
    history: 'sexual_history',
    symptoms: [
      { key: 'fsd', label: 'Cambios o molestias en su vida sexual (deseo, excitación, lubricación, orgasmo)', triggers: ['fsfi_6'] },
      { key: 'dyspareunia', label: 'Dolor durante las relaciones', triggers: ['fsfi_6'] },
      { key: 'talk', label: 'Prefiero platicarlo directamente con el doctor' },
    ],
  },
  {
    key: 'kidney',
    reason: 'kidney',
    title: 'Riñón o cálculos',
    prompt: '¿Qué molestias tiene? Puede marcar varias.',
    history: 'kidney_history',
    symptoms: [
      { key: 'flank_pain', label: 'Dolor fuerte en la espalda baja o en el costado' },
      { key: 'known_stones', label: 'Me han dicho que tengo piedras en el riñón' },
      { key: 'passed_stones', label: 'Ya he expulsado piedras antes' },
      { key: 'hematuria', label: 'Sangre en la orina', redFlag: 'Hematuria macroscópica (sangre visible en la orina)' },
      { key: 'fever_flank', label: 'Infecciones con fiebre y dolor de espalda', redFlag: 'Fiebre con dolor lumbar o de costado' },
      { key: 'abnormal_labs', label: 'Alteraciones en estudios (creatinina, ultrasonido)' },
    ],
  },
];

export const sphereByKey = (key: SphereKey): SphereDef => SPHERES.find((s) => s.key === key)!;

/**
 * Pantalla de alarma que se aplica a TODOS los pacientes al inicio, para que
 * las banderas rojas no dependan de la rama que el paciente elija.
 */
export interface AlarmDef {
  key: string;
  label: string;
  flag: string;
}

export const ALARM_SYMPTOMS: AlarmDef[] = [
  { key: 'gross_hematuria', label: 'He visto sangre en la orina', flag: 'Hematuria macroscópica (sangre visible en la orina)' },
  { key: 'fever_flank_pain', label: 'Tengo fiebre junto con dolor en la espalda baja o el costado', flag: 'Fiebre con dolor lumbar o de costado' },
  { key: 'retention', label: 'No puedo orinar o casi no me sale orina', flag: 'Retención aguda de orina' },
  { key: 'acute_scrotal_pain', label: 'Dolor intenso y repentino en un testículo', flag: 'Dolor testicular intenso de inicio súbito' },
];

export const ALARM_NONE_LABEL = 'Ninguno de estos';

/** Selección de síntomas por esfera: clave de esfera -> claves de síntomas. */
export type SymptomSelection = Partial<Record<SphereKey, string[]>>;

export const symptomLabels = (sphere: SphereKey, keys: string[]): string[] => {
  const def = sphereByKey(sphere);
  return keys.map((k) => def.symptoms.find((s) => s.key === k)?.label).filter((l): l is string => Boolean(l));
};

/** Instrumentos disparados por la selección de síntomas, sin duplicados y en orden canónico. */
export const triggeredQuestionnaires = (selection: SymptomSelection): QuestionnaireId[] => {
  const set = new Set<QuestionnaireId>();
  for (const sphere of SPHERES) {
    const chosen = selection[sphere.key] ?? [];
    for (const s of sphere.symptoms) {
      if (chosen.includes(s.key)) s.triggers?.forEach((t) => set.add(t));
    }
  }
  return Array.from(set);
};

/** Pasos de antecedentes habilitados por la selección. */
export const enabledHistorySteps = (selection: SymptomSelection, activeSpheres: SphereKey[]): HistoryStepKey[] => {
  const set = new Set<HistoryStepKey>();
  for (const sphere of SPHERES) {
    if (!activeSpheres.includes(sphere.key)) continue;
    if (sphere.history) set.add(sphere.history);
    const chosen = selection[sphere.key] ?? [];
    for (const s of sphere.symptoms) {
      if (chosen.includes(s.key)) s.enables?.forEach((e) => set.add(e));
    }
  }
  return Array.from(set);
};
