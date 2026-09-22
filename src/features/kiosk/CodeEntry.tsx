import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui';
import { findByKioskCode } from '../../data/visits.repo';
import { useDocumentTitle } from '../../hooks/useUtil';
import { maskName } from '../../lib/phone';
import { clearDraft } from './kioskDraft';
import type { Visit } from '../../domain/types';

export const CodeEntry = () => {
  useDocumentTitle('Tengo un código');
  const navigate = useNavigate();
  const [digits, setDigits] = useState(['', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Visit | null>(null);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const code = digits.join('');

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1);
    setDigits((arr) => arr.map((x, j) => (j === i ? d : x)));
    setError(null);
    if (d && i < 3) refs.current[i + 1]?.focus();
  };

  useEffect(() => {
    if (code.length !== 4) return;
    let alive = true;
    setBusy(true);
    findByKioskCode(code)
      .then((v) => {
        if (!alive) return;
        if (!v) {
          setError('Ese código no está activo. Revise los 4 dígitos o pida ayuda en recepción.');
          setFound(null);
        } else setFound(v);
      })
      .catch(() => alive && setError('No se pudo verificar el código. Revise la conexión.'))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [code]);

  const go = () => {
    if (!found) return;
    clearDraft();
    navigate(`/kiosk/continuar/${found.id}`, { replace: true });
  };

  return (
    <div className="wizard">
      <header className="wizard__header">
        <Button variant="ghost" icon={<ArrowLeft size={22} />} onClick={() => navigate('/')} className="btn--lg">
          Inicio
        </Button>
        <div className="wizard__stepper">
          <div className="eyebrow">Tengo un código</div>
        </div>
        <span />
      </header>
      <div className="wizard__scroll">
        <div className="wizard__body">
          <div className="wizard__question">
            <h2 className="h2" tabIndex={-1}>
              Escriba el código que le dio la recepción.
            </h2>
            <p className="muted">Son 4 números.</p>
          </div>
          <div className="code-input">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className="input"
                inputMode="numeric"
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus();
                }}
                autoFocus={i === 0}
                aria-label={`Dígito ${i + 1}`}
              />
            ))}
          </div>
          {error && (
            <div className="callout callout--warning">
              <div>{error}</div>
            </div>
          )}
          {found && (
            <div className="card card--rail-info stack">
              <div>
                <div className="h3">Hola, {maskName(found.personal.fullName)}.</div>
                <p className="muted">¿Es usted? Al continuar empezará su cuestionario.</p>
              </div>
              <div className="row-wrap">
                <Button size="lg" onClick={go}>
                  Sí, soy yo
                </Button>
                <Button variant="secondary" size="lg" onClick={() => setDigits(['', '', '', ''])}>
                  No, corregir código
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      <footer className="wizard__footer">
        <span className="wizard__hint">{busy ? 'Verificando…' : 'El código solo sirve el día de su visita.'}</span>
        <Button size="lg" onClick={go} disabled={!found}>
          Continuar
        </Button>
      </footer>
    </div>
  );
};
