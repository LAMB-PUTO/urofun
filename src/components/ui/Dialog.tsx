import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from './Button';
import { Input } from './Field';

interface DialogBaseProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  /** No cerrar con Esc ni con clic en el fondo. */
  persistent?: boolean;
}

const useDialog = (open: boolean, onClose: () => void, persistent?: boolean) => {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      if (!persistent) onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (persistent) return;
      if (e.target === el) onClose();
    };
    // El navegador puede cerrar el <dialog> por su cuenta (gesto "atrás" en Android, segundo Esc):
    // se sincroniza el estado de React, o se vuelve a abrir si es persistente.
    const onNativeClose = () => {
      if (persistent) {
        if (!el.open) el.showModal();
        return;
      }
      onClose();
    };
    el.addEventListener('cancel', onCancel);
    el.addEventListener('click', onClick);
    el.addEventListener('close', onNativeClose);
    return () => {
      el.removeEventListener('cancel', onCancel);
      el.removeEventListener('click', onClick);
      el.removeEventListener('close', onNativeClose);
    };
  }, [onClose, persistent]);
  return ref;
};

export const Drawer = ({ open, onClose, title, subtitle, footer, children, persistent, size }: DialogBaseProps & { size?: 'md' | 'lg' }) => {
  const ref = useDialog(open, onClose, persistent);
  const titleId = useId();
  return (
    <dialog ref={ref} className={['drawer', size === 'lg' ? 'drawer--lg' : ''].filter(Boolean).join(' ')} aria-labelledby={title ? titleId : undefined}>
      <div className="drawer__header">
        <div className="stack-2">
          {title && (
            <h2 id={titleId} className="h2">
              {title}
            </h2>
          )}
          {subtitle && <div className="small muted">{subtitle}</div>}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
          <X size={20} />
        </button>
      </div>
      <div className="drawer__body">{open ? children : null}</div>
      {footer && <div className="drawer__footer">{footer}</div>}
    </dialog>
  );
};

export const Modal = ({ open, onClose, title, subtitle, footer, children, persistent, size }: DialogBaseProps & { size?: 'md' | 'lg' }) => {
  const ref = useDialog(open, onClose, persistent);
  const titleId = useId();
  return (
    <dialog ref={ref} className={['modal', size === 'lg' ? 'modal--lg' : ''].filter(Boolean).join(' ')} aria-labelledby={title ? titleId : undefined}>
      {(title || subtitle) && (
        <div className="modal__header">
          <div className="stack-2">
            {title && (
              <h2 id={titleId} className="h2">
                {title}
              </h2>
            )}
            {subtitle && <div className="muted">{subtitle}</div>}
          </div>
        </div>
      )}
      <div className="modal__body">{open ? children : null}</div>
      {footer && <div className="modal__footer">{footer}</div>}
    </dialog>
  );
};

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Palabra que el usuario debe teclear para habilitar la acción destructiva. */
  typeToConfirm?: string;
}

export const ConfirmModal = ({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger, typeToConfirm }: ConfirmProps) => {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setTyped('');
      setError(null);
    }
  }, [open]);
  const ok = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm.toUpperCase();
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      // El diálogo se queda abierto y explica por qué no se pudo.
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={run} disabled={!ok} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack">
        {message && <p>{message}</p>}
        {error && (
          <div className="callout callout--warning" role="alert">
            <div>{error}</div>
          </div>
        )}
        {typeToConfirm && (
          <div className="field">
            <label className="field__label">
              Escriba <strong>{typeToConfirm}</strong> para continuar
            </label>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </div>
        )}
      </div>
    </Modal>
  );
};
