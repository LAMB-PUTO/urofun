import { useState } from 'react';
import { Button, Callout, Chip, Field, Input, useToast } from '../../components/ui';
import { registerDoctor } from '../../data/doctors.repo';
import { useDoctors, useDocumentTitle } from '../../hooks/useUtil';
import { useOpenVisits } from '../../hooks/useVisits';
import { formatTime } from '../../lib/dates';
import { aiFixHint, checkAiProviders } from '../../services/ai/health';
import type { AiHealth, ProviderCheck } from '../../services/ai/health';
import { aiAvailable, ENV } from '../../services/env';
import { summaryProviderLabel } from '../../services/ai/summaryJob';

const ProviderRow = ({ label, check }: { label: string; check: ProviderCheck }) => (
  <div className="file-row small">
    <Chip tone={check.ok ? 'success' : 'danger'}>{check.ok ? 'OK' : check.status ? `Error ${check.status}` : 'Falla'}</Chip>
    <span className="strong nowrap">{label}</span>
    <span className="grow muted">{check.message}</span>
  </div>
);

const AiHealthCard = ({ counts, open }: { counts: Record<string, number>; open: number }) => {
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      setHealth(await checkAiProviders());
    } finally {
      setBusy(false);
    }
  };
  const failing = health && (!health.openai.ok || !health.perplexity.ok);
  return (
    <div className="card stack">
      <div className="between">
        <div className="h3">Salud de la IA</div>
        <Button size="sm" variant="secondary" onClick={() => void run()} loading={busy}>
          Probar conexiones
        </Button>
      </div>
      <div className="small">
        Resúmenes: <strong>{summaryProviderLabel()}</strong> · Dictado: {aiAvailable.transcribe ? 'disponible' : 'no configurado'} · Investigación: {aiAvailable.research ? 'disponible' : 'no configurada'}
      </div>
      <div className="small muted num">
        Visitas abiertas: {open} · listos {counts.ready ?? 0} · pendientes {counts.pending ?? 0} · generando {counts.generating ?? 0} · fallidos {counts.failed ?? 0} · sin cuestionario {counts.skipped ?? 0}
      </div>
      {health && (
        <div className="stack-2">
          <ProviderRow label="OpenAI · resumen y dictado" check={health.openai} />
          <ProviderRow label="Perplexity · investigación" check={health.perplexity} />
          <div className="small muted num">
            Probado a las {formatTime(health.checkedAt)} · modo {health.mode === 'proxy' ? 'Edge Function' : health.mode === 'local' ? 'llaves locales' : 'sin proveedor'}
          </div>
        </div>
      )}
      {failing && (
        <Callout tone="warning" title="Cómo corregir">
          {aiFixHint(health!.mode)}
        </Callout>
      )}
      {!ENV.aiProxyUrl && <Callout tone="warning">Sin `VITE_AI_PROXY_URL`: las llamadas a IA salen del navegador con llaves locales (solo desarrollo).</Callout>}
    </div>
  );
};

export const AdminPage = () => {
  useDocumentTitle('Administración');
  const toast = useToast();
  const { doctors } = useDoctors();
  const { data } = useOpenVisits();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await registerDoctor(fullName, username, password);
    setBusy(false);
    if (error) return toast.error(error);
    toast.success('Doctor registrado. Recargue para verlo en la lista.');
    setFullName('');
    setUsername('');
    setPassword('');
  };

  const counts = (data ?? []).reduce<Record<string, number>>((acc, v) => {
    acc[v.ai.status] = (acc[v.ai.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="page">
      <header className="page__header">
        <div className="page__title">
          <h1 className="h1">Administración</h1>
        </div>
      </header>
      <div className="two-col" style={{ alignItems: 'start' }}>
        <form className="card stack" onSubmit={submit}>
          <div className="h3">Registrar doctor</div>
          <Field label="Nombre completo">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Dr. Nombre Apellido" />
          </Field>
          <Field label="Usuario" help="Se guarda en minúsculas.">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required autoCapitalize="none" />
          </Field>
          <Field label="Contraseña">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
          </Field>
          <Button type="submit" loading={busy}>
            Registrar
          </Button>
          <Callout tone="warning" title="Pendiente de migración">
            Las contraseñas de doctores se guardan en texto plano en la tabla actual. Ver docs/PLAN-LOGICA.md §9 para migrar a Supabase Auth.
          </Callout>
        </form>
        <div className="stack">
          <div className="card stack">
            <div className="h3">Doctores</div>
            {doctors.map((d) => (
              <div key={d.id} className="file-row small">
                <span className="strong grow">{d.fullName}</span>
                <span className="muted num">{d.username}</span>
                {ENV.adminUsernames.includes(d.username) && <span className="chip chip--neutral">Admin</span>}
              </div>
            ))}
          </div>
          <AiHealthCard counts={counts} open={(data ?? []).length} />
        </div>
      </div>
    </div>
  );
};
