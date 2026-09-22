import { ArrowRight, KeyRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CLINIC } from '../../config/clinic';
import { formatDateLong, formatTime, greetingForNow } from '../../lib/dates';
import { useDocumentTitle, useNow } from '../../hooks/useUtil';
import { isReducedMotion, toggleReducedMotion } from '../../app/layouts/KioskLayout';
import { clearDraft, readDraft } from './kioskDraft';
import type { KioskDraft } from './kioskDraft';

export const KioskHome = () => {
  useDocumentTitle('Bienvenido');
  const now = useNow(15_000);
  const navigate = useNavigate();
  const [draft, setDraft] = useState<KioskDraft | null>(null);
  const [reduced, setReduced] = useState(isReducedMotion());

  useEffect(() => {
    setDraft(readDraft());
  }, []);

  const resumeDraft = () => {
    if (!draft) return;
    if (draft.visitId) navigate(`/kiosk/continuar/${draft.visitId}`);
    else navigate('/kiosk/nuevo');
  };

  const firstName = draft?.state.personal.fullName.trim().split(/\s+/)[0];

  return (
    <div className="kiosk-landing">
      <header className="kiosk-landing__top">
        <img className="kiosk-landing__logo" src="/logo-lockup.png" alt="Urología Funcional" />
        <div className="small muted num">
          {formatDateLong(now)} · {formatTime(now)}
        </div>
      </header>

      <main className="kiosk-landing__main">
        <div className="kiosk-landing__intro">
          <h1 className="display">{greetingForNow(now)}</h1>
          <p className="lead muted">
            Bienvenido al consultorio del {CLINIC.doctorDisplayName}. Esta tableta le hará algunas preguntas antes de pasar con el doctor. Tarda entre 5 y 10 minutos.
          </p>
        </div>

        <div className="ledger">
          {draft && firstName && (
            <button type="button" className="ledger__row ledger__row--compact" onClick={resumeDraft}>
              <span className="ledger__num" aria-hidden="true">
                ↺
              </span>
              <span>
                <span className="ledger__title">Continuar registro de {firstName}</span>
                <span className="ledger__sub">Guardamos lo que llevaba contestado.</span>
              </span>
              <ArrowRight className="ledger__arrow" size={28} />
            </button>
          )}
          <Link to="/kiosk/nuevo" className="ledger__row" onClick={() => draft && clearDraft()}>
            <span className="ledger__num num" aria-hidden="true">
              01
            </span>
            <span>
              <span className="ledger__title">Es mi primera visita</span>
              <span className="ledger__sub">Llenaremos su historial completo.</span>
            </span>
            <ArrowRight className="ledger__arrow" size={28} />
          </Link>
          <Link to="/kiosk/recurrente" className="ledger__row" onClick={() => draft && clearDraft()}>
            <span className="ledger__num num" aria-hidden="true">
              02
            </span>
            <span>
              <span className="ledger__title">Ya he venido antes</span>
              <span className="ledger__sub">Solo actualizaremos sus síntomas de hoy.</span>
            </span>
            <ArrowRight className="ledger__arrow" size={28} />
          </Link>
          <Link to="/kiosk/codigo" className="ledger__row ledger__row--compact">
            <span className="ledger__num" aria-hidden="true">
              <KeyRound size={28} />
            </span>
            <span>
              <span className="ledger__title">Tengo un código</span>
              <span className="ledger__sub">La recepción le dio un número de 4 dígitos.</span>
            </span>
            <ArrowRight className="ledger__arrow" size={28} />
          </Link>
        </div>
      </main>

      <footer className="kiosk-landing__foot">
        <span>Si tiene dudas, la asistente le puede ayudar.</span>
        <span className="row">
          <button
            type="button"
            className="btn btn--link small"
            onClick={() => setReduced(toggleReducedMotion())}
            aria-pressed={reduced}
          >
            {reduced ? 'Activar animaciones' : 'Reducir animaciones'}
          </button>
          <Link to="/login" className="btn btn--ghost btn--sm">
            Personal de la clínica
          </Link>
        </span>
      </footer>
    </div>
  );
};
