import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui';
import { CLINIC } from '../../config/clinic';
import { useDocumentTitle } from '../../hooks/useUtil';
import { clearDraft } from './kioskDraft';

const R = 24;
const C = 2 * Math.PI * R;

export const IntakeDone = () => {
  useDocumentTitle('Listo');
  const navigate = useNavigate();
  const total = CLINIC.kioskDoneSeconds;
  const [left, setLeft] = useState<number>(total);

  useEffect(() => {
    clearDraft();
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (left <= 0) navigate('/', { replace: true });
  }, [left, navigate]);

  return (
    <div className="kiosk-done">
      <svg className="success-check" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="28" />
        <path d="M20 33 28 41 44 25" />
      </svg>
      <div className="kiosk-done__text">
        <h1 className="h1">Listo, gracias.</h1>
        <p className="lead muted">Entregue la tableta a la asistente y tome asiento. El doctor ya tiene su información.</p>
      </div>
      <div className="row">
        <div className="countdown" aria-hidden="true">
          <svg viewBox="0 0 56 56">
            <circle className="countdown__track" cx="28" cy="28" r={R} />
            <circle className="countdown__fill" cx="28" cy="28" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, left) / total)} />
          </svg>
          <span className="small num">{Math.max(0, left)}</span>
        </div>
        <span className="small muted">Esta pantalla se cerrará sola.</span>
      </div>
      <Button variant="ghost" onClick={() => navigate('/', { replace: true })}>
        Cerrar ahora
      </Button>
    </div>
  );
};
