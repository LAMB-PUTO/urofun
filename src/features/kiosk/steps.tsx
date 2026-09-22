import { Beaker, CircleDot, Droplets, Heart, Stethoscope } from 'lucide-react';
import type { ReactNode } from 'react';
import { Field, Input, OptionGroup, Textarea, Toggle, ToggleList } from '../../components/ui';
import { ALARM_NONE_LABEL, ALARM_SYMPTOMS, REASONS, SPHERES, sphereByKey } from '../../domain/intake/catalog';
import type { ReasonKey, SphereKey } from '../../domain/intake/catalog';
import { DEFAULT_HISTORIES, wizardAge } from '../../domain/intake/formModel';
import type { SectionKey, Step, WizardState } from '../../domain/intake/formModel';
import { QUESTIONNAIRES } from '../../domain/questionnaires';
import type { AnswerValue, QuestionnaireId, QuestionnaireItem } from '../../domain/questionnaires';
import type { PersonalData } from '../../domain/types';
import { formatMxPartial, maskName } from '../../lib/phone';

export interface StepProps {
  state: WizardState;
  update: (fn: (s: WizardState) => WizardState) => void;
  step: Step;
  /** Solo en modo precargado: datos de la visita/paciente base. */
  base?: PersonalData;
  onAutoAdvance?: () => void;
  goToSection?: (section: SectionKey) => void;
  lookup?: { name: string; onYes: () => void; onNo: () => void } | null;
}

const Question = ({ eyebrow, title, help, children }: { eyebrow?: string; title: ReactNode; help?: ReactNode; children: ReactNode }) => (
  <>
    <div className="wizard__question">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h2 className="h2" tabIndex={-1} data-step-title>
        {title}
      </h2>
      {help && <p className="muted">{help}</p>}
    </div>
    {children}
  </>
);

const NONE_PILL = 'Ninguna';

const TextWithNone = ({ value, onChange, placeholder, none = 'Ninguno' }: { value: string; onChange: (v: string) => void; placeholder: string; none?: string }) => (
  <div className="stack">
    <Textarea value={value === none ? '' : value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} />
    <Toggle checked={value === none} onChange={(c) => onChange(c ? none : '')} label={none} />
  </div>
);

// ---------------- Datos personales ----------------

const PersonalStep = ({ state, update, step, base, lookup }: StepProps) => {
  if (step.step.kind !== 'personal') return null;
  const p = state.personal;
  const set = (patch: Partial<WizardState['personal']>) => update((s) => ({ ...s, personal: { ...s.personal, ...patch } }));
  const age = wizardAge(p);

  switch (step.step.field) {
    case 'name':
      return (
        <Question eyebrow="Sus datos" title="¿Cuál es su nombre completo?" help="Nombre y apellidos, como aparecen en su identificación.">
          <Field label="Nombre completo">
            <Input value={p.fullName} onChange={(e) => set({ fullName: e.target.value })} autoCapitalize="words" autoComplete="off" autoFocus placeholder="Ej. Juan Pérez López" enterKeyHint="next" />
          </Field>
        </Question>
      );
    case 'birth':
      return (
        <Question eyebrow="Sus datos" title="¿Cuál es su fecha de nacimiento?">
          <div>
            <div className="dob">
              <Field label="Día">
                <Input inputMode="numeric" maxLength={2} value={p.birth.d} onChange={(e) => set({ birth: { ...p.birth, d: e.target.value.replace(/\D/g, '') } })} placeholder="DD" autoFocus />
              </Field>
              <Field label="Mes">
                <Input inputMode="numeric" maxLength={2} value={p.birth.m} onChange={(e) => set({ birth: { ...p.birth, m: e.target.value.replace(/\D/g, '') } })} placeholder="MM" />
              </Field>
              <Field label="Año">
                <Input inputMode="numeric" maxLength={4} value={p.birth.y} onChange={(e) => set({ birth: { ...p.birth, y: e.target.value.replace(/\D/g, '') } })} placeholder="AAAA" />
              </Field>
            </div>
            <div className="dob__live" aria-live="polite">
              {age !== null ? `Tiene ${age} años.` : ' '}
            </div>
          </div>
        </Question>
      );
    case 'gender':
      return (
        <Question eyebrow="Sus datos" title="¿Cuál es su sexo?" help="Lo usamos para hacerle solo las preguntas que aplican.">
          <OptionGroup
            layout="inline"
            value={p.gender}
            onChange={(v) => update((s) => ({ ...s, personal: { ...s.personal, gender: v }, symptoms: {}, symptomsNone: [], answers: {} }))}
            options={[
              { value: 'Masculino' as const, label: 'Hombre' },
              { value: 'Femenino' as const, label: 'Mujer' },
            ]}
          />
        </Question>
      );
    case 'phone':
      return (
        <Question eyebrow="Sus datos" title="¿Cuál es su número de teléfono?" help="Con él encontraremos su expediente en su próxima visita.">
          <div className="stack">
            <Field label="Teléfono (10 dígitos)">
              <Input inputMode="tel" type="tel" mono value={formatMxPartial(p.phone)} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="Ej. 667 123 4567" autoFocus autoComplete="off" />
            </Field>
            {lookup && (
              <div className="card card--rail-info stack">
                <div>
                  <div className="h3">Parece que ya tiene expediente</div>
                  <p className="muted">¿Es usted {maskName(lookup.name)}?</p>
                </div>
                <div className="row-wrap">
                  <button type="button" className="btn btn--primary" onClick={lookup.onYes}>
                    Sí, soy yo
                  </button>
                  <button type="button" className="btn btn--secondary" onClick={lookup.onNo}>
                    No, es otra persona
                  </button>
                </div>
              </div>
            )}
          </div>
        </Question>
      );
    case 'email':
      return (
        <Question eyebrow="Sus datos" title="¿Cuál es su correo electrónico?" help="Opcional. Sirve para enviarle recordatorios.">
          <div className="stack">
            <Field label="Correo electrónico" optional>
              <Input type="email" inputMode="email" value={p.email} onChange={(e) => set({ email: e.target.value, noEmail: false })} placeholder="Ej. juan@correo.com" autoFocus autoComplete="off" disabled={p.noEmail} />
            </Field>
            <Toggle checked={p.noEmail} onChange={(c) => set({ noEmail: c, email: c ? '' : p.email })} label="No tengo correo" />
          </div>
        </Question>
      );
    case 'referral':
      return (
        <Question eyebrow="Sus datos" title="¿Cómo se enteró del consultorio?">
          <div className="stack">
            <OptionGroup
              value={p.referralSource || null}
              onChange={(v) => set({ referralSource: v })}
              options={[
                { value: 'Recomendación', label: 'Me lo recomendó un familiar o amigo' },
                { value: 'Internet', label: 'Internet o redes sociales' },
                { value: 'Otro médico', label: 'Me envió otro médico' },
                { value: 'Otro', label: 'Otro' },
              ]}
            />
            {p.referralSource === 'Otro médico' && (
              <Field label="¿Qué doctor lo envió?" optional>
                <Input value={p.referredByDoctor} onChange={(e) => set({ referredByDoctor: e.target.value })} placeholder="Nombre del doctor" />
              </Field>
            )}
          </div>
        </Question>
      );
    case 'confirm':
      return (
        <Question eyebrow="Sus datos" title={`Bienvenido de nuevo, ${maskName(base?.fullName ?? p.fullName)}.`} help="¿Sus datos siguen igual? Puede corregir su teléfono o correo.">
          <div className="stack">
            <div className="review">
              <div className="review__row">
                <div>
                  <div className="review__label">Nombre</div>
                  <div>{p.fullName}</div>
                </div>
              </div>
              <div className="review__row">
                <div>
                  <div className="review__label">Edad y sexo</div>
                  <div>
                    {age ?? base?.age ?? '—'} años · {p.gender === 'Femenino' ? 'Mujer' : 'Hombre'}
                  </div>
                </div>
              </div>
            </div>
            <Field label="Teléfono">
              <Input inputMode="tel" mono value={formatMxPartial(p.phone)} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
            </Field>
            <Field label="Correo electrónico" optional>
              <Input type="email" value={p.email} onChange={(e) => set({ email: e.target.value, noEmail: !e.target.value })} placeholder="Sin correo" />
            </Field>
          </div>
        </Question>
      );
  }
};

// ---------------- Alarma / motivos / síntomas ----------------

const AlarmStep = ({ state, update }: StepProps) => (
  <Question eyebrow="Antes de empezar" title="¿Tiene alguno de estos síntomas en este momento?" help="Si marca alguno, el doctor lo verá de inmediato.">
    <ToggleList
      items={[...ALARM_SYMPTOMS.map((a) => ({ key: a.key, label: a.label, danger: true })), { key: '__none', label: ALARM_NONE_LABEL }]}
      value={state.alarmsAnswered ? (state.alarms.length ? state.alarms : ['__none']) : []}
      exclusiveKey="__none"
      onChange={(v) => update((s) => ({ ...s, alarms: v.filter((k) => k !== '__none'), alarmsAnswered: v.length > 0 }))}
    />
  </Question>
);

const REASON_ICONS: Record<ReasonKey, ReactNode> = {
  prostate: <CircleDot size={28} />,
  bladder: <Droplets size={28} />,
  sexual: <Heart size={28} />,
  kidney: <Beaker size={28} />,
  checkup: <Stethoscope size={28} />,
  other: <CircleDot size={28} />,
};

const ReasonsStep = ({ state, update }: StepProps) => {
  const gender = state.personal.gender;
  const items = REASONS.filter((r) => !r.onlyFor || r.onlyFor === gender).map((r) => ({ key: r.key, label: r.label, gloss: r.description, icon: REASON_ICONS[r.key] }));
  return (
    <Question eyebrow="Motivo de la visita" title="¿Qué lo trae hoy a consulta?" help="Puede elegir varias opciones.">
      <div className="stack">
        <ToggleList items={items} value={state.reasons} onChange={(v) => update((s) => ({ ...s, reasons: v }))} />
        {state.reasons.includes('other') && (
          <Field label="Cuéntenos brevemente el motivo">
            <Textarea value={state.otherReason} onChange={(e) => update((s) => ({ ...s, otherReason: e.target.value }))} rows={3} />
          </Field>
        )}
      </div>
    </Question>
  );
};

const SymptomsStep = ({ state, update, step }: StepProps) => {
  if (step.step.kind !== 'symptoms') return null;
  const sphere = sphereByKey(step.step.sphere);
  const key: SphereKey = sphere.key;
  const chosen = state.symptoms[key] ?? [];
  const none = state.symptomsNone.includes(key);
  const value = none ? ['__none'] : chosen;
  return (
    <Question eyebrow={sphere.title} title={sphere.prompt}>
      <ToggleList
        items={[
          ...sphere.symptoms.map((s) => ({ key: s.key, label: s.label, gloss: s.triggers?.length ? 'Le preguntaremos más sobre esto' : undefined, danger: Boolean(s.redFlag) })),
          { key: '__none', label: 'Ninguna de estas' },
        ]}
        value={value}
        exclusiveKey="__none"
        onChange={(v) =>
          update((s) => {
            const isNone = v.includes('__none');
            const keys = v.filter((k) => k !== '__none');
            return { ...s, symptoms: { ...s.symptoms, [key]: keys }, symptomsNone: isNone ? Array.from(new Set([...s.symptomsNone, key])) : s.symptomsNone.filter((k) => k !== key) };
          })
        }
      />
    </Question>
  );
};

// ---------------- Cuestionarios ----------------

const shortLabels = (item: QuestionnaireItem) => item.kind === 'scale' && item.options.length >= 5 && item.options.every((o) => o.label.length <= 14);

const ItemControl = ({ item, value, onChange, autoAdvance }: { item: QuestionnaireItem; value: AnswerValue | null | undefined; onChange: (v: AnswerValue) => void; autoAdvance?: () => void }) => {
  switch (item.kind) {
    case 'scale': {
      const grid = shortLabels(item);
      return (
        <OptionGroup
          layout={grid ? 'grid' : 'list'}
          showValues={!grid && item.scored !== false}
          value={typeof value === 'number' ? value : null}
          onChange={(v) => {
            onChange(v);
            autoAdvance?.();
          }}
          options={item.options.map((o) => ({
            value: o.value,
            label: grid ? (
              <>
                <span className="option__num">{o.value}</span>
                <span className="option__cap">{o.label}</span>
              </>
            ) : (
              o.label
            ),
          }))}
        />
      );
    }
    case 'range': {
      const opts = Array.from({ length: item.max - item.min + 1 }, (_, i) => ({ value: item.min + i, label: <span className="option__num">{item.min + i}</span> }));
      return (
        <OptionGroup
          layout="grid"
          value={typeof value === 'number' ? value : null}
          onChange={(v) => {
            onChange(v);
            autoAdvance?.();
          }}
          options={opts}
          legend={{ min: item.minLabel, max: item.maxLabel }}
        />
      );
    }
    case 'multi': {
      const arr = Array.isArray(value) ? value : null;
      const none = arr !== null && arr.length === 0;
      return (
        <ToggleList
          items={[...item.options.map((o) => ({ key: o.value, label: o.label })), { key: '__none', label: item.noneLabel ?? 'Ninguna' }]}
          value={none ? ['__none'] : (arr ?? [])}
          exclusiveKey="__none"
          onChange={(v) => onChange(v.filter((k) => k !== '__none'))}
        />
      );
    }
    case 'yesno':
      return (
        <OptionGroup
          layout="inline"
          value={typeof value === 'boolean' ? (value ? 'si' : 'no') : null}
          onChange={(v) => onChange(v === 'si')}
          options={[
            { value: 'si', label: 'Sí' },
            { value: 'no', label: 'No' },
          ]}
        />
      );
  }
};

const QuestionStep = ({ state, update, step, onAutoAdvance }: StepProps) => {
  if (step.step.kind !== 'question') return null;
  const { questionnaire, item, index, count } = step.step;
  const q = QUESTIONNAIRES[questionnaire];
  const value = state.answers[questionnaire]?.[item.id];
  const setAnswer = (v: AnswerValue) => update((s) => ({ ...s, answers: { ...s.answers, [questionnaire]: { ...(s.answers[questionnaire] ?? {}), [item.id]: v } } }));
  return (
    <Question eyebrow={`${q.acronym} · Pregunta ${index + 1} de ${count}`} title={item.text} help={item.help ?? (index === 0 ? `${q.intro} ${q.recall}.` : q.recall)}>
      <ItemControl item={item} value={value} onChange={setAnswer} autoAdvance={item.kind === 'scale' || item.kind === 'range' ? onAutoAdvance : undefined} />
    </Question>
  );
};

const QuestionGroupStep = ({ state, update, step }: StepProps) => {
  if (step.step.kind !== 'question-group') return null;
  const { questionnaire, items, index, count } = step.step;
  const q = QUESTIONNAIRES[questionnaire];
  const setAnswer = (id: string, v: AnswerValue) => update((s) => ({ ...s, answers: { ...s.answers, [questionnaire]: { ...(s.answers[questionnaire] ?? {}), [id]: v } } }));
  return (
    <Question eyebrow={`${q.acronym} · Parte ${index + 1} de ${count}`} title={q.name} help={index === 0 ? `${q.intro} ${q.recall}.` : q.recall}>
      <div className="stack-6">
        {items.map((item) => (
          <div key={item.id} className="stack-2">
            <div className={item.scored === false ? 'muted' : 'lead strong'}>{item.text}</div>
            <ItemControl item={item} value={state.answers[questionnaire]?.[item.id]} onChange={(v) => setAnswer(item.id, v)} />
          </div>
        ))}
      </div>
    </Question>
  );
};

// ---------------- Antecedentes específicos ----------------

const YesNo = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
  <OptionGroup
    layout="inline"
    value={value ? 'si' : 'no'}
    onChange={(v) => onChange(v === 'si')}
    options={[
      { value: 'no', label: 'No' },
      { value: 'si', label: 'Sí' },
    ]}
  />
);

const Choice = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) => (
  <OptionGroup layout="inline" value={value} onChange={onChange} options={options.map((o) => ({ value: o, label: o }))} />
);

const HistoryStep = ({ state, update, step }: StepProps) => {
  if (step.step.kind !== 'history') return null;
  const h = step.step.history;
  const set = <K extends keyof WizardState['histories']>(key: K, patch: Partial<NonNullable<WizardState['histories'][K]>>) =>
    update((s) => ({ ...s, histories: { ...s.histories, [key]: { ...(s.histories[key] ?? DEFAULT_HISTORIES[key]()), ...patch } } }));

  if (h === 'prostate_history') {
    const v = state.histories.prostate ?? DEFAULT_HISTORIES.prostate();
    return (
      <Question eyebrow="Antecedentes · Próstata" title="Cuéntenos sobre su próstata y su familia.">
        <div className="stack-6">
          <Field label="¿Algún familiar directo (papá, hermanos, abuelos) ha tenido cáncer de próstata?">
            <Choice value={v.familyCancer} onChange={(x) => set('prostate', { familyCancer: x })} options={['No', 'Sí', 'No sé']} />
          </Field>
          {v.familyCancer === 'Sí' && (
            <Field label="¿Quién y a qué edad aproximada?" optional>
              <Input value={v.familyCancerDetails ?? ''} onChange={(e) => set('prostate', { familyCancerDetails: e.target.value })} placeholder="Ej. Mi papá, a los 68" />
            </Field>
          )}
          <Field label="¿Algún familiar con crecimiento de próstata?">
            <Choice value={v.familyGrowth} onChange={(x) => set('prostate', { familyGrowth: x })} options={['No', 'Sí', 'No sé']} />
          </Field>
          <Field label="¿Se ha hecho el antígeno prostático (PSA)?">
            <Choice value={v.psa} onChange={(x) => set('prostate', { psa: x })} options={['Nunca', 'Hace menos de 1 año', 'Hace más de 1 año']} />
          </Field>
          {v.psa !== 'Nunca' && (
            <Field label="Si recuerda el resultado, anótelo" optional>
              <Input value={v.psaResult ?? ''} onChange={(e) => set('prostate', { psaResult: e.target.value })} placeholder="Ej. 2.4" />
            </Field>
          )}
          <Field label="¿Le han hecho antes ultrasonido de próstata o tacto rectal?">
            <YesNo value={v.priorExam} onChange={(x) => set('prostate', { priorExam: x })} />
          </Field>
        </div>
      </Question>
    );
  }
  if (h === 'uti_history') {
    const v = state.histories.uti ?? DEFAULT_HISTORIES.uti();
    return (
      <Question eyebrow="Antecedentes · Infecciones" title="Sobre sus infecciones urinarias.">
        <div className="stack-6">
          <Field label="¿Cuántas infecciones urinarias confirmadas por un médico ha tenido en los últimos 6 meses?">
            <Choice value={v.last6} onChange={(x) => set('uti', { last6: x })} options={['0', '1', '2 o más']} />
          </Field>
          <Field label="¿Y en los últimos 12 meses?">
            <Choice value={v.last12} onChange={(x) => set('uti', { last12: x })} options={['0', '1', '2', '3 o más']} />
          </Field>
          <Field label="¿Sus molestias aparecen o empeoran después de la actividad sexual?">
            <Choice value={v.worseAfterSex} onChange={(x) => set('uti', { worseAfterSex: x })} options={['No aplica', 'No', 'Sí']} />
          </Field>
          {state.personal.gender === 'Femenino' && (
            <Field label="¿Ya pasó por la menopausia?">
              <YesNo value={Boolean(v.menopause)} onChange={(x) => set('uti', { menopause: x })} />
            </Field>
          )}
          <Field label="¿Le han encontrado cálculos (piedras) o le han puesto sondas urinarias?">
            <YesNo value={v.stonesOrCatheters} onChange={(x) => set('uti', { stonesOrCatheters: x })} />
          </Field>
        </div>
      </Question>
    );
  }
  if (h === 'sexual_history') {
    const v = state.histories.sexual ?? DEFAULT_HISTORIES.sexual();
    return (
      <Question eyebrow="Antecedentes · Salud sexual" title="Algunos datos que influyen en la función sexual.">
        <div className="stack-6">
          <Field label="¿Tiene diabetes, presión alta o colesterol alto?">
            <YesNo value={v.diabetesHtnChol} onChange={(x) => set('sexual', { diabetesHtnChol: x })} />
          </Field>
          <Field label="¿Fuma?">
            <Choice value={v.smoking} onChange={(x) => set('sexual', { smoking: x })} options={['No', 'Sí, ocasionalmente', 'Sí, frecuentemente']} />
          </Field>
          <Field label="¿Qué medicamentos toma actualmente?" optional help="Varios medicamentos afectan la función sexual.">
            <Input value={v.meds ?? ''} onChange={(e) => set('sexual', { meds: e.target.value })} placeholder="Ej. Losartán, metformina" />
          </Field>
          <Field label="¿Cirugías previas de próstata o pelvis?" optional>
            <Input value={v.surgeries ?? ''} onChange={(e) => set('sexual', { surgeries: e.target.value })} placeholder="Ej. Vasectomía" />
          </Field>
        </div>
      </Question>
    );
  }
  const v = state.histories.kidney ?? DEFAULT_HISTORIES.kidney();
  return (
    <Question eyebrow="Antecedentes · Riñón" title="Sobre sus riñones y las piedras.">
      <div className="stack-6">
        <Field label="Si ha tenido piedras, ¿cuántas veces?" optional>
          <Input value={v.stonesCount ?? ''} onChange={(e) => set('kidney', { stonesCount: e.target.value })} placeholder="Ej. 2 veces" />
        </Field>
        <Field label="¿Le han hecho algún procedimiento para quitarlas?" optional>
          <Input value={v.procedures ?? ''} onChange={(e) => set('kidney', { procedures: e.target.value })} placeholder="Ej. Láser, litotricia" />
        </Field>
        <Field label="¿Algún familiar directo con piedras en el riñón?">
          <Choice value={v.familyStones} onChange={(x) => set('kidney', { familyStones: x })} options={['No', 'Sí', 'No sé']} />
        </Field>
        <Field label="¿Aproximadamente cuánta agua toma al día?">
          <Choice value={v.water} onChange={(x) => set('kidney', { water: x })} options={['Menos de 1 litro', '1 a 2 litros', 'Más de 2 litros']} />
        </Field>
        <Field label="¿Tiene gota o ácido úrico alto?">
          <YesNo value={v.gout} onChange={(x) => set('kidney', { gout: x })} />
        </Field>
      </div>
    </Question>
  );
};

// ---------------- Antecedentes generales ----------------

const GeneralStep = ({ state, update, step }: StepProps) => {
  if (step.step.kind !== 'general') return null;
  const g = state.general;
  const set = (patch: Partial<WizardState['general']>) => update((s) => ({ ...s, general: { ...s.general, ...patch } }));
  switch (step.step.field) {
    case 'conditions':
      return (
        <Question eyebrow="Antecedentes" title="¿Padece alguna de estas enfermedades?" help="Puede marcar varias.">
          <div className="stack">
            <ToggleList
              items={['Diabetes', 'Presión alta', 'Colesterol alto', 'Problemas del corazón', NONE_PILL].map((c) => ({ key: c, label: c }))}
              value={g.conditions}
              exclusiveKey={NONE_PILL}
              onChange={(v) => set({ conditions: v })}
            />
            <Field label="Otra enfermedad" optional>
              <Input value={g.otherCondition ?? ''} onChange={(e) => set({ otherCondition: e.target.value })} placeholder="Ej. Hipotiroidismo" />
            </Field>
          </div>
        </Question>
      );
    case 'surgeries':
      return (
        <Question eyebrow="Antecedentes" title="¿Le han operado de algo?" help="Anote cuáles, aunque no sean del riñón o la próstata.">
          <TextWithNone value={g.surgeries ?? ''} onChange={(v) => set({ surgeries: v })} placeholder="Ej. Apéndice en 2010, hernia" none="Ninguna" />
        </Question>
      );
    case 'meds':
      return (
        <Question eyebrow="Antecedentes" title="¿Qué medicamentos toma actualmente?" help="Incluya vitaminas y suplementos si los toma todos los días.">
          <TextWithNone value={g.meds ?? ''} onChange={(v) => set({ meds: v })} placeholder="Ej. Losartán 50 mg en la mañana" none="Ninguno" />
        </Question>
      );
    case 'allergies':
      return (
        <Question eyebrow="Antecedentes" title="¿Es alérgico a algún medicamento?">
          <TextWithNone value={g.allergies ?? ''} onChange={(v) => set({ allergies: v })} placeholder="Ej. Penicilina" none="Ninguna" />
        </Question>
      );
    case 'habits':
      return (
        <Question eyebrow="Antecedentes" title="Sobre sus hábitos.">
          <div className="stack-6">
            <Field label="¿Fuma?">
              <Choice value={g.smoking} onChange={(x) => set({ smoking: x })} options={['Nunca', 'Ocasional', 'Frecuente']} />
            </Field>
            <Field label="¿Toma alcohol?">
              <Choice value={g.alcohol} onChange={(x) => set({ alcohol: x })} options={['Nunca', 'Ocasional', 'Frecuente']} />
            </Field>
          </div>
        </Question>
      );
    case 'family':
      return (
        <Question eyebrow="Antecedentes" title="¿Algún familiar directo ha tenido...?" help="Papás, hermanos o abuelos. Puede marcar varias.">
          <ToggleList
            items={['Cáncer de próstata', 'Cáncer de riñón o vejiga', 'Piedras en el riñón', 'Diabetes', 'Presión alta', 'Ninguna / No sé'].map((c) => ({ key: c, label: c }))}
            value={g.familyHistory}
            exclusiveKey="Ninguna / No sé"
            onChange={(v) => set({ familyHistory: v })}
          />
        </Question>
      );
  }
};

// ---------------- Cierre ----------------

const OtherStep = ({ state, update }: StepProps) => (
  <Question eyebrow="Para terminar" title="¿Hay algún otro tema que le gustaría tratar con el doctor?" help="Opcional. Escriba lo que quiera que el doctor sepa antes de pasar.">
    <Textarea value={state.otherTopics} onChange={(e) => update((s) => ({ ...s, otherTopics: e.target.value }))} rows={4} placeholder="Escriba aquí..." />
  </Question>
);

const ConsentStep = ({ state, update }: StepProps) => (
  <Question eyebrow="Para terminar" title="Aviso de privacidad">
    <label className="consent">
      <input type="checkbox" className="visually-hidden" checked={state.consent} onChange={(e) => update((s) => ({ ...s, consent: e.target.checked }))} />
      <span className="toggle__box" aria-hidden="true" style={{ marginTop: 4 }}>
        <svg className="toggle__check" viewBox="0 0 24 24" style={{ opacity: state.consent ? 1 : 0, strokeDashoffset: 0 }}>
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      </span>
      <span className="consent__text">
        Autorizo el tratamiento de mis datos personales y de salud, considerados sensibles, exclusivamente para la integración de mi expediente clínico, diagnóstico y tratamiento en este consultorio, bajo la
        confidencialidad médica que marca la Ley Federal de Protección de Datos Personales en Posesión de los Particulares. Puedo solicitar acceso, rectificación o cancelación en recepción.
      </span>
    </label>
  </Question>
);

const ReviewStep = ({ state, goToSection, base }: StepProps) => {
  const reasons = state.reasons.map((k) => REASONS.find((r) => r.key === k)?.label).filter(Boolean);
  const spheres = SPHERES.filter((s) => (state.symptoms[s.key] ?? []).length);
  const age = wizardAge(state.personal) ?? base?.age;
  const Row = ({ label, section, children }: { label: string; section: SectionKey; children: ReactNode }) => (
    <div className="review__row">
      <div>
        <div className="review__label">{label}</div>
        <div>{children}</div>
      </div>
      {goToSection && (
        <button type="button" className="btn btn--link" onClick={() => goToSection(section)}>
          Cambiar
        </button>
      )}
    </div>
  );
  return (
    <Question eyebrow="Revisión" title="Revise sus respuestas antes de enviar." help="El doctor recibirá esta información de forma confidencial.">
      <div className="review">
        <Row label="Sus datos" section="datos">
          {state.personal.fullName} · {age ?? '—'} años · {formatMxPartial(state.personal.phone)}
        </Row>
        <Row label="Síntomas de alarma" section="alarma">
          {state.alarms.length ? ALARM_SYMPTOMS.filter((a) => state.alarms.includes(a.key)).map((a) => a.label).join('; ') : 'Ninguno'}
        </Row>
        <Row label="Motivo de la visita" section="motivo">
          {reasons.join(', ') || '—'}
        </Row>
        {spheres.length > 0 && (
          <Row label="Síntomas" section="sintomas">
            {spheres.map((s) => `${s.title}: ${(state.symptoms[s.key] ?? []).length}`).join(' · ')}
          </Row>
        )}
        <Row label="Antecedentes" section="antecedentes">
          {state.general.conditions.join(', ') || '—'}
          {state.general.allergies ? ` · Alergias: ${state.general.allergies}` : ''}
        </Row>
        <Row label="Otros temas" section="cierre">
          {state.otherTopics.trim() || 'Ninguno'}
        </Row>
      </div>
    </Question>
  );
};

export const StepRenderer = (props: StepProps) => {
  switch (props.step.step.kind) {
    case 'personal':
      return <PersonalStep {...props} />;
    case 'alarm':
      return <AlarmStep {...props} />;
    case 'reasons':
      return <ReasonsStep {...props} />;
    case 'symptoms':
      return <SymptomsStep {...props} />;
    case 'question':
      return <QuestionStep {...props} />;
    case 'question-group':
      return <QuestionGroupStep {...props} />;
    case 'history':
      return <HistoryStep {...props} />;
    case 'general':
      return <GeneralStep {...props} />;
    case 'other':
      return <OtherStep {...props} />;
    case 'consent':
      return <ConsentStep {...props} />;
    case 'review':
      return <ReviewStep {...props} />;
  }
};

export const stepCaption = (step: Step, sectionIndex: number, sectionCount: number): string => {
  const s = step.step;
  if (s.kind === 'question' || s.kind === 'question-group') {
    const q = QUESTIONNAIRES[s.questionnaire as QuestionnaireId];
    return `${q.acronym} · ${s.index + 1} de ${s.count}`;
  }
  return `Sección ${sectionIndex + 1} de ${sectionCount}`;
};
