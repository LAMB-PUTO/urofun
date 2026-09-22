import { FolderOpen, Paperclip, Printer, Search, UploadCloud, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar, Button, ButtonLink, Drawer, EmptyState, Segmented, SkeletonRows, Tabs, Tag, VisitStatusChip, useToast } from '../../components/ui';
import { uploadPatientFile } from '../../data/files.repo';
import { TABLES } from '../../data/supabase';
import { addFile, groupPatients, listVisits, searchVisits } from '../../data/visits.repo';
import type { Patient, Visit } from '../../domain/types';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { useDebouncedValue, useDocumentTitle } from '../../hooks/useUtil';
import { formatDateShort, formatDateTime } from '../../lib/dates';
import { formatMx } from '../../lib/phone';
import { useSession } from '../../services/session';
import { ReasonTags, VisitContextPanel, hasIntake } from '../shared/VisitContext';

type Filter = 'all' | 'completed' | 'open';

const NoteReadOnly = ({ visit }: { visit: Visit }) => {
  const n = visit.notes;
  if (!n) return <p className="small muted">Sin nota de consulta.</p>;
  const rows: Array<[string, string | undefined]> = [
    ['Signos vitales', n.vitalSigns],
    ['Padecimiento actual', n.currentIllness],
    ['Interrogatorio', n.interrogation],
    ['Exploración física', n.physicalExam],
    ['Diagnóstico', n.diagnosis],
    ['Receta', n.prescription],
    ['Recomendaciones', n.recommendations],
    ['Próxima cita', n.nextAppointment ? formatDateTime(n.nextAppointment) : undefined],
  ];
  return (
    <div className="stack">
      <div className="micro muted">
        {n.doctorName ?? n.doctorUsername ?? ''}
        {n.savedAt ? ` · ${formatDateTime(n.savedAt)}` : ''}
      </div>
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k}>
            <div className="eyebrow">{k}</div>
            <p className="small" style={{ whiteSpace: 'pre-wrap' }}>
              {v}
            </p>
          </div>
        ))}
    </div>
  );
};

export const PatientsPage = () => {
  useDocumentTitle('Pacientes');
  const session = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const { patientKey: routeKey } = useParams();
  const [term, setTerm] = useState('');
  const q = useDebouncedValue(term, 300);
  const [filter, setFilter] = useState<Filter>('all');
  const fetcher = useCallback(() => (q.trim() ? searchVisits(q, 200) : listVisits({ limit: 300 })), [q]);
  const { data, loading } = useLiveQuery(fetcher, [TABLES.visits], 60_000);
  const patients = useMemo(() => groupPatients(data ?? []), [data]);
  const filtered = useMemo(() => patients.filter((p) => (filter === 'all' ? true : filter === 'completed' ? p.latestVisit.status === 'completed' : p.latestVisit.status !== 'completed' && p.latestVisit.status !== 'cancelled')), [patients, filter]);
  const selected = routeKey ? (patients.find((p) => p.key === routeKey) ?? null) : null;
  const [tab, setTab] = useState<'visits' | 'scores' | 'files'>('visits');
  const [visitOpen, setVisitOpen] = useState<Visit | null>(null);
  const [uploading, setUploading] = useState(false);

  // Al cambiar de expediente se abre la última visita; al refrescar la lista se conserva la visita elegida (por id).
  useEffect(() => {
    setVisitOpen(null);
  }, [routeKey]);
  useEffect(() => {
    if (!selected) return;
    setVisitOpen((v) => (v && selected.visits.find((x) => x.id === v.id)) ?? selected.latestVisit);
  }, [selected]);

  const open = (p: Patient | null) => navigate(p ? `/panel/pacientes/${p.key}` : '/panel/pacientes');

  const onFiles = async (files: FileList | null) => {
    if (!selected || !files?.length) return;
    setUploading(true);
    try {
      const target = selected.latestVisit;
      for (const f of Array.from(files)) {
        const meta = await uploadPatientFile(f, target.id);
        await addFile(target.id, { ...meta, uploadedBy: session?.username });
      }
      toast.success('Archivos agregados al expediente.');
    } catch (err) {
      toast.error('No se pudo subir.', { message: err instanceof Error ? err.message : undefined });
    } finally {
      setUploading(false);
    }
  };

  const allFiles = selected ? selected.visits.flatMap((v) => v.files.map((f) => ({ ...f, visit: v }))) : [];

  return (
    <div className="page">
      <header className="page__header">
        <div className="page__title">
          <h1 className="h1">Pacientes</h1>
          <span className="small muted">{patients.length} expediente{patients.length === 1 ? '' : 's'}</span>
        </div>
        <div className="page__actions">
          <ButtonLink to="/panel/registrar" variant="secondary" icon={<UserPlus size={16} />}>
            Registrar paciente
          </ButtonLink>
        </div>
      </header>

      <div className="filters">
        <div className="search-wrap" style={{ width: 320 }}>
          <Search size={20} />
          <input className="input input--search" placeholder="Nombre o teléfono" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Buscar paciente" />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'open', label: 'En espera' },
            { value: 'completed', label: 'Atendidos' },
          ]}
        />
      </div>

      {loading && !data ? (
        <SkeletonRows rows={6} />
      ) : !filtered.length ? (
        <EmptyState icon={<FolderOpen />} title="Sin resultados" text={q ? 'Pruebe con otro nombre o los últimos dígitos del teléfono.' : 'Los expedientes aparecen aquí después de la primera visita.'} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Edad / sexo</th>
                <th>Teléfono</th>
                <th className="th--num">Visitas</th>
                <th>Última visita</th>
                <th>Motivos</th>
                <th className="th--num">
                  <Paperclip size={14} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.key} className="is-clickable" tabIndex={0} onClick={() => open(p)} onKeyDown={(e) => e.key === 'Enter' && open(p)}>
                  <td>
                    <span className="row-2">
                      <Avatar name={p.personal.fullName} size="sm" />
                      <span className="strong">{p.personal.fullName}</span>
                    </span>
                  </td>
                  <td className="num">
                    {p.personal.age} · {p.personal.gender === 'Femenino' ? 'M' : 'H'}
                  </td>
                  <td className="num nowrap">{formatMx(p.personal.phone)}</td>
                  <td className="td--num">{p.visits.length}</td>
                  <td className="num nowrap">
                    <span className="row-2">
                      {formatDateShort(p.lastVisitAt)} <VisitStatusChip status={p.latestVisit.status} />
                    </span>
                  </td>
                  <td>
                    <span className="row-wrap">
                      <ReasonTags visit={p.latestVisit} max={2} />
                    </span>
                  </td>
                  <td className="td--num">{p.visits.reduce((n, v) => n + v.files.length, 0) || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={() => open(null)}
        size="lg"
        title={selected?.personal.fullName}
        subtitle={selected ? `${selected.personal.age} años · ${selected.personal.gender} · ${formatMx(selected.personal.phone)} · ${selected.visits.length} visita${selected.visits.length > 1 ? 's' : ''}` : undefined}
        footer={
          selected && (
            <>
              <a className="btn btn--ghost" href={`/expediente/${(visitOpen ?? selected.latestVisit).id}/print`} target="_blank" rel="noreferrer">
                <Printer size={16} /> Exportar PDF
              </a>
              <label className="btn btn--secondary">
                <UploadCloud size={16} /> {uploading ? 'Subiendo…' : 'Subir estudios'}
                <input type="file" multiple className="visually-hidden" onChange={(e) => void onFiles(e.target.files)} disabled={uploading} />
              </label>
              <Button onClick={() => navigate(`/panel/registrar?phone=${selected.personal.phone}`)}>Nueva visita</Button>
            </>
          )
        }
      >
        {selected && (
          <div className="stack-6">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'visits', label: 'Visitas' },
                { value: 'scores', label: 'Cuestionarios' },
                { value: 'files', label: 'Archivos', badge: allFiles.length ? <span className="badge-count">{allFiles.length}</span> : undefined },
              ]}
            />
            {tab === 'visits' && (
              <div className="stack-6">
                <div className="timeline">
                  {selected.visits.map((v) => (
                    <button key={v.id} type="button" className={['timeline__item', visitOpen?.id === v.id ? 'is-current' : ''].join(' ')} onClick={() => setVisitOpen(v)} style={{ textAlign: 'left', width: '100%' }}>
                      <span />
                      <span className="stack-2" style={{ gap: 2 }}>
                        <span className="row-2">
                          <span className="strong num">{formatDateTime(v.createdAt)}</span>
                          <VisitStatusChip status={v.status} />
                          {v.meta.kind === 'followup' && <Tag>Subsecuente</Tag>}
                        </span>
                        <span className="row-wrap">
                          <ReasonTags visit={v} />
                        </span>
                        {v.notes?.diagnosis && <span className="small muted truncate">Dx: {v.notes.diagnosis}</span>}
                      </span>
                    </button>
                  ))}
                </div>
                {visitOpen && (
                  <>
                    <div className="section">
                      <div className="section__head">
                        <div className="h4">Nota de consulta · {formatDateShort(visitOpen.createdAt)}</div>
                        {visitOpen.status !== 'completed' && (
                          <ButtonLink to={visitOpen.status === 'in_consultation' ? `/panel/consulta/${visitOpen.id}` : `/panel/espera/${visitOpen.id}`} size="sm" variant="secondary">
                            {visitOpen.status === 'in_consultation' ? 'Abrir consulta' : 'Ver en sala'}
                          </ButtonLink>
                        )}
                      </div>
                      <NoteReadOnly visit={visitOpen} />
                    </div>
                    {hasIntake(visitOpen) && <VisitContextPanel visit={visitOpen} clinical />}
                  </>
                )}
              </div>
            )}
            {tab === 'scores' && (visitOpen ? <VisitContextPanel visit={visitOpen} previous={selected.visits.find((v) => v.id !== visitOpen.id && v.createdAt < visitOpen.createdAt && hasIntake(v)) ?? null} clinical /> : null)}
            {tab === 'files' && (
              <div className="section">
                {allFiles.length ? (
                  allFiles.map((f, i) => (
                    <div key={i} className="file-row small">
                      <Paperclip size={16} />
                      <a href={f.url} target="_blank" rel="noreferrer" className="grow truncate">
                        {f.name}
                      </a>
                      <span className="micro muted num">{formatDateShort(f.uploadedAt ?? f.visit.createdAt)}</span>
                    </div>
                  ))
                ) : (
                  <p className="small muted">Sin archivos. Use "Subir estudios" para agregar laboratorios o imágenes.</p>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};
