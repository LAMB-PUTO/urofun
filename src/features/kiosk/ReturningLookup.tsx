import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Field, Input } from '../../components/ui';
import { listVisitsByPhone } from '../../data/visits.repo';
import { OPEN_VISIT_STATUSES } from '../../domain/types';
import type { Visit } from '../../domain/types';
import { useDocumentTitle } from '../../hooks/useUtil';
import { formatDateShort } from '../../lib/dates';
import { formatMxPartial, maskName, normalizeMx } from '../../lib/phone';
import { fold } from '../../lib/text';
import { clearDraft, setPrefillPhone } from './kioskDraft';

export const ReturningLookup = () => {
  useDocumentTitle('Ya he venido antes');
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [matches, setMatches] = useState<Visit[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const open = (v: Visit) => {
    clearDraft();
    if (OPEN_VISIT_STATUSES.includes(v.status)) {
      if (v.status === 'arrived') navigate(`/kiosk/continuar/${v.id}`);
      else setMessage('Usted ya está registrado en la sala de espera. Tome asiento; en un momento lo llamarán.');
      return;
    }
    navigate(`/kiosk/recurrente/${v.id}`);
  };

  const search = async () => {
    setBusy(true);
    setNotFound(false);
    setMessage(null);
    setMatches(null);
    try {
      const list = await listVisitsByPhone(normalizeMx(phone));
      const first = fold(name).split(/\s+/)[0];
      const byName = list.filter((v) => fold(v.personal.fullName).split(/\s+/)[0] === first);
      if (!byName.length) {
        setNotFound(true);
        return;
      }
      // Agrupa por nombre completo: si hay varias personas con el mismo teléfono, deja elegir.
      const people = new Map<string, Visit>();
      for (const v of byName) {
        const k = fold(v.personal.fullName);
        const existing = people.get(k);
        if (!existing || OPEN_VISIT_STATUSES.includes(v.status)) people.set(k, existing && OPEN_VISIT_STATUSES.includes(existing.status) ? existing : v);
      }
      const arr = Array.from(people.values());
      if (arr.length === 1) open(arr[0]);
      else setMatches(arr);
    } catch {
      setMessage('No se pudo buscar. Revise la conexión o pida ayuda a la asistente.');
    } finally {
      setBusy(false);
    }
  };

  const registerNew = () => {
    setPrefillPhone(normalizeMx(phone));
    navigate('/kiosk/nuevo');
  };

  const ready = normalizeMx(phone).length === 10 && name.trim().length >= 2;

  return (
    <div className="wizard">
      <header className="wizard__header">
        <Button variant="ghost" icon={<ArrowLeft size={22} />} onClick={() => navigate('/')} className="btn--lg">
          Inicio
        </Button>
        <div className="wizard__stepper">
          <div className="eyebrow">Ya he venido antes</div>
        </div>
        <span />
      </header>
      <div className="wizard__scroll">
        <form
          className="wizard__body"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) void search();
          }}
        >
          <div className="wizard__question">
            <h2 className="h2" tabIndex={-1}>
              Busquemos su expediente.
            </h2>
            <p className="muted">Escriba el teléfono con el que se registró y su primer nombre.</p>
          </div>
          <Field label="Teléfono (10 dígitos)">
            <Input inputMode="tel" type="tel" mono value={formatMxPartial(phone)} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Ej. 667 123 4567" autoFocus autoComplete="off" />
          </Field>
          <Field label="Su primer nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Juan" autoCapitalize="words" autoComplete="off" />
          </Field>

          {matches && (
            <div className="stack">
              <p className="lead">Encontramos más de un expediente con este teléfono. Toque el suyo:</p>
              {matches.map((v) => (
                <button key={v.id} type="button" className="lookup-result" onClick={() => open(v)}>
                  <Avatar name={v.personal.fullName} size="lg" />
                  <span className="grow">
                    <span className="h3">{maskName(v.personal.fullName)}</span>
                    <span className="muted small" style={{ display: 'block' }}>
                      Última visita {formatDateShort(v.createdAt)}
                    </span>
                  </span>
                  <ArrowRight className="ledger__arrow" size={24} />
                </button>
              ))}
            </div>
          )}

          {notFound && (
            <div className="card stack">
              <div>
                <div className="h3">No encontramos su expediente</div>
                <p className="muted">Revise el teléfono y el nombre, o regístrese como paciente nuevo. La asistente también puede ayudarle.</p>
              </div>
              <Button variant="secondary" size="lg" onClick={registerNew}>
                Registrarme como paciente nuevo
              </Button>
            </div>
          )}

          {message && (
            <div className="card card--rail-info">
              <p className="lead">{message}</p>
            </div>
          )}
        </form>
      </div>
      <footer className="wizard__footer">
        <span className="wizard__hint">Solo mostramos su nombre abreviado por privacidad.</span>
        <Button size="lg" onClick={() => void search()} disabled={!ready} loading={busy}>
          Buscar mi expediente
        </Button>
      </footer>
    </div>
  );
};
