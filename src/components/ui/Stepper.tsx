export interface StepperSection {
  key: string;
  label: string;
  /** 0..1 */
  progress: number;
}

interface Props {
  sections: StepperSection[];
  currentIndex: number;
  /** Texto de la caption (ej. "Sección 2 de 5 · Motivo"). */
  caption?: string;
}

export const Stepper = ({ sections, currentIndex, caption }: Props) => {
  const current = sections[currentIndex];
  const text = caption ?? (current ? `Sección ${currentIndex + 1} de ${sections.length} · ${current.label}` : '');
  return (
    <div className="wizard__stepper" role="progressbar" aria-valuemin={0} aria-valuemax={sections.length} aria-valuenow={currentIndex + 1} aria-valuetext={text}>
      <div className="stepper" aria-hidden="true">
        {sections.map((s, i) => (
          <div key={s.key} className={['stepper__segment', i < currentIndex ? 'is-done' : ''].filter(Boolean).join(' ')}>
            <i style={{ width: `${Math.round((i < currentIndex ? 1 : i === currentIndex ? s.progress : 0) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="eyebrow" aria-live="polite">
        {text}
      </div>
    </div>
  );
};
