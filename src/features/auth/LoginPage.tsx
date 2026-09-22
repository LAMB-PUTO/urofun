import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Surface } from '../../app/layouts/Surface';
import { Button, Callout, Field, Input, Segmented } from '../../components/ui';
import { authenticateDoctor } from '../../data/doctors.repo';
import { loginDoctorSession, loginReception, receptionLoginAvailable, useSession } from '../../services/session';
import { useDocumentTitle } from '../../hooks/useUtil';

export const LoginPage = () => {
  useDocumentTitle('Acceso del personal');
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState<'reception' | 'doctor'>('reception');
  const [pin, setPin] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from;
  if (session) return <Navigate to={from && from.startsWith('/panel') ? from : '/panel/espera'} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (tab === 'reception') {
        if (!receptionLoginAvailable()) return setError('El acceso de recepción no está configurado (RECEPTION_PIN en la Edge Function o VITE_RECEPTION_PIN en desarrollo).');
        if (!(await loginReception(pin))) return setError('PIN incorrecto.');
      } else {
        const doctor = await authenticateDoctor(username, password);
        if (!doctor) return setError('Usuario o contraseña incorrectos.');
        loginDoctorSession(doctor);
      }
      navigate(from && from.startsWith('/panel') ? from : '/panel/espera', { replace: true });
    } catch {
      setError('No se pudo verificar el acceso. Revise la conexión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Surface kind="staff" className="login">
      <form className="login__card card" onSubmit={submit}>
        <img className="login__logo" src="/logo-lockup.png" alt="Urología Funcional" />
        <Segmented
          block
          ariaLabel="Tipo de acceso"
          value={tab}
          onChange={(v) => {
            setTab(v);
            setError(null);
          }}
          options={[
            { value: 'reception', label: 'Recepción' },
            { value: 'doctor', label: 'Médico' },
          ]}
        />
        {tab === 'reception' ? (
          <Field label="PIN de recepción" error={error}>
            <Input type="password" inputMode="numeric" mono center maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus autoComplete="off" placeholder="········" style={{ letterSpacing: '0.4em', fontSize: '1.4rem' }} />
          </Field>
        ) : (
          <>
            <Field label="Usuario">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" autoCapitalize="none" />
            </Field>
            <Field label="Contraseña" error={error}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
          </>
        )}
        {!receptionLoginAvailable() && tab === 'reception' && <Callout tone="warning">El PIN de recepción no está configurado: `RECEPTION_PIN` en la Edge Function o, en desarrollo, `VITE_RECEPTION_PIN` en .env.</Callout>}
        <Button type="submit" block loading={busy}>
          Entrar
        </Button>
        <Link to="/" className="btn btn--ghost btn--sm">
          Volver a la tableta
        </Link>
      </form>
    </Surface>
  );
};
