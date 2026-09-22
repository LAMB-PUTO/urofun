import { AlertCircle } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cloneElement, forwardRef, isValidElement, useId } from 'react';

interface FieldProps {
  label?: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  htmlFor?: string;
  corner?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const Field = ({ label, help, error, optional, htmlFor, corner, children, className }: FieldProps) => {
  const autoId = useId();
  const labelId = `${autoId}-label`;
  // Un solo hijo (Input, Textarea, Select u OptionGroup) recibe id y aria-labelledby: tocar la etiqueta enfoca el
  // campo y el lector de pantalla anuncia "Teléfono" en vez del placeholder.
  let content = children;
  let controlId = htmlFor;
  if (label && isValidElement(children)) {
    const props = children.props as { id?: string; 'aria-labelledby'?: string; 'aria-label'?: string };
    controlId = htmlFor ?? props.id ?? autoId;
    content = cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      id: props.id ?? controlId,
      'aria-labelledby': props['aria-labelledby'] ?? (props['aria-label'] ? undefined : labelId),
    });
  }
  return (
    <div className={['field', error ? 'has-error' : '', className ?? ''].filter(Boolean).join(' ')}>
      {label && (
        <label className="field__label" id={labelId} htmlFor={controlId}>
          {label}
          {optional && <span className="field__optional"> (opcional)</span>}
        </label>
      )}
      {content}
      {corner && <div className="field__corner">{corner}</div>}
      {help && !error && <div className="field__help">{help}</div>}
      {error && (
        <div className="field__error" role="alert">
          <AlertCircle size={16} /> {error}
        </div>
      )}
    </div>
  );
};

type InputProps = InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; center?: boolean; unit?: string };

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, mono, center, unit, ...rest }, ref) => {
  const cls = ['input', mono ? 'input--mono' : '', center ? 'input--center' : '', className ?? ''].filter(Boolean).join(' ');
  if (unit) {
    return (
      <div className="input-group">
        <input ref={ref} className={cls} {...rest} />
        <span className="input-group__unit">{unit}</span>
      </div>
    );
  }
  return <input ref={ref} className={cls} {...rest} />;
});
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...rest }, ref) => (
  <textarea ref={ref} className={['textarea', className ?? ''].filter(Boolean).join(' ')} {...rest} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...rest }, ref) => (
  <select ref={ref} className={['select', className ?? ''].filter(Boolean).join(' ')} {...rest}>
    {children}
  </select>
));
Select.displayName = 'Select';

/** Campo completo con id automático. */
export const TextField = ({ label, help, error, optional, corner, ...input }: Omit<FieldProps, 'children' | 'htmlFor'> & InputProps) => {
  const id = useId();
  return (
    <Field label={label} help={help} error={error} optional={optional} htmlFor={id} corner={corner}>
      <Input id={id} aria-invalid={error ? true : undefined} {...input} />
    </Field>
  );
};

export const TextareaField = ({ label, help, error, optional, corner, ...ta }: Omit<FieldProps, 'children' | 'htmlFor'> & TextareaHTMLAttributes<HTMLTextAreaElement>) => {
  const id = useId();
  return (
    <Field label={label} help={help} error={error} optional={optional} htmlFor={id} corner={corner}>
      <Textarea id={id} aria-invalid={error ? true : undefined} {...ta} />
    </Field>
  );
};

export const SelectField = ({ label, help, error, optional, children, ...sel }: Omit<FieldProps, 'htmlFor'> & SelectHTMLAttributes<HTMLSelectElement>) => {
  const id = useId();
  return (
    <Field label={label} help={help} error={error} optional={optional} htmlFor={id}>
      <Select id={id} {...sel}>
        {children}
      </Select>
    </Field>
  );
};
