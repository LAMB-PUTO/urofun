import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type Tone = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  tone: Tone;
  title: ReactNode;
  message?: ReactNode;
  action?: { label: string; onClick: () => void };
  leaving?: boolean;
}

interface ToastApi {
  info: (title: ReactNode, opts?: Partial<Omit<ToastItem, 'id' | 'tone' | 'title'>>) => void;
  success: (title: ReactNode, opts?: Partial<Omit<ToastItem, 'id' | 'tone' | 'title'>>) => void;
  error: (title: ReactNode, opts?: Partial<Omit<ToastItem, 'id' | 'tone' | 'title'>>) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let seq = 1;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 180);
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (tone: Tone, title: ReactNode, opts?: Partial<Omit<ToastItem, 'id' | 'tone' | 'title'>>) => {
      const id = seq++;
      setItems((list) => [...list.slice(-2), { id, tone, title, ...opts }]);
      if (tone !== 'error') timers.current.set(id, setTimeout(() => remove(id), 5000));
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      info: (t, o) => push('info', t, o),
      success: (t, o) => push('success', t, o),
      error: (t, o) => push('error', t, o),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toaster">
        {items.map((t) => (
          <div key={t.id} className={['toast', `toast--${t.tone}`, t.leaving ? 'is-leaving' : ''].filter(Boolean).join(' ')} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span className="toast__icon">{t.tone === 'success' ? <CheckCircle2 size={20} /> : t.tone === 'error' ? <AlertCircle size={20} /> : <Info size={20} />}</span>
            <div className="toast__body">
              <div className="toast__title">{t.title}</div>
              {t.message && <div className="small muted">{t.message}</div>}
              {t.action && (
                <div className="toast__actions">
                  <button
                    type="button"
                    className="btn btn--link"
                    onClick={() => {
                      t.action?.onClick();
                      remove(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                </div>
              )}
            </div>
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => remove(t.id)} aria-label="Cerrar aviso">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
};
