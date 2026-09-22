import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useParams } from 'react-router-dom';
import { Surface } from '../../app/layouts/Surface';
import { Button } from '../../components/ui';
import { CLINIC } from '../../config/clinic';
import { getVisit, listVisitsByPhone } from '../../data/visits.repo';
import { QUESTIONNAIRES, QUESTIONNAIRE_ORDER } from '../../domain/questionnaires';
import { deterministicNote } from '../../domain/summary/deterministicNote';
import type { Visit } from '../../domain/types';
import { useDocumentTitle } from '../../hooks/useUtil';
import { formatDateFull, formatDateShort, formatDateTime } from '../../lib/dates';
import { formatMx } from '../../lib/phone';
import { useSession } from '../../services/session';
import { hasIntake, visitReasons, visitRedFlags, visitScores } from '../shared/VisitContext';

export const PrintPage = () => {
  const { visitId } = useParams();
  const session = useSession();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [previous, setPrevious] = useState<Visit[]>([]);
  useDocumentTitle(visit ? `Expediente ${visit.personal.fullName}` : 'Expediente');

  useEffect(() => {
    if (!visitId) return;
    getVisit(visitId).then(async (v) => {
      setVisit(v);
      if (v) {
        const list = await listVisitsByPhone(v.personal.phone);
        setPrevious(list.filter((x) => x.id !== v.id && x.status === 'completed'));
      }
    });
  }, [visitId]);

  if (!visit) return <Surface kind="staff"><div className="page">Cargando…</div></Surface>;

  const p = visit.personal;
  const n = visit.notes;
  const scores = visitScores(visit);
  const flags = visitRedFlags(visit);
  const summary = visit.ai.status === 'ready' && visit.ai.summary ? visit.ai.summary : hasIntake(visit) ? deterministicNote(visit) : null;
  const doctorName = n?.doctorName ?? session?.fullName ?? CLINIC.doctorDisplayName;

  return (
    <Surface kind="staff">
      <div className="print__toolbar">
        <Button variant="ghost" size="sm" onClick={() => window.close()}>
          Cerrar
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          Imprimir / guardar PDF
        </Button>
      </div>
      <article className="print-page">
        <header className="print__head">
          <div className="row">
            <img src="/logo-mark.png" alt="" />
            <div>
              <h1>Expediente clínico urológico</h1>
              <div className="small">
                {CLINIC.doctorDisplayName} · Urología · {CLINIC.city}
              </div>
            </div>
          </div>
          <div className="print__meta num">
            Visita {formatDateFull(visit.createdAt)}
            <br />
            Folio {visit.id.slice(0, 8).toUpperCase()}
          </div>
        </header>

        <h2>1. Ficha de identificación</h2>
        <dl className="print__grid">
          <div>
            <dt>Paciente</dt>
            <dd>{p.fullName}</dd>
          </div>
          <div>
            <dt>Edad / sexo</dt>
            <dd>
              {p.age} años · {p.gender}
            </dd>
          </div>
          <div>
            <dt>Fecha de nacimiento</dt>
            <dd>{p.birthDate ? formatDateFull(p.birthDate + 'T12:00:00') : '—'}</dd>
          </div>
          <div>
            <dt>Teléfono</dt>
            <dd className="num">{formatMx(p.phone)}</dd>
          </div>
          <div>
            <dt>Correo</dt>
            <dd>{p.email ?? '—'}</dd>
          </div>
          <div>
            <dt>Tipo de consulta</dt>
            <dd>{visit.meta.kind === 'followup' || p.isFirstTime === false ? 'Subsecuente' : 'Primera vez'}</dd>
          </div>
          <div>
            <dt>Referido por</dt>
            <dd>{p.referredByDoctor ?? p.referralSource ?? '—'}</dd>
          </div>
          <div>
            <dt>Motivo</dt>
            <dd>{visitReasons(visit).join(', ') || '—'}</dd>
          </div>
        </dl>

        {n && (
          <>
            <h2>2. Nota de consulta (NOM-004-SSA3-2012)</h2>
            {[
              ['Signos vitales', n.vitalSigns],
              ['Padecimiento actual', n.currentIllness],
              ['Interrogatorio por aparatos y sistemas', n.interrogation],
              ['Exploración física', n.physicalExam],
              ['Diagnóstico', n.diagnosis],
              ['Receta', n.prescription],
              ['Recomendaciones', n.recommendations],
              ['Próxima cita', n.nextAppointment ? formatDateTime(n.nextAppointment) : ''],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="print__block">
                  <h3>{k}</h3>
                  <p>{v}</p>
                </div>
              ))}
          </>
        )}

        {flags.length > 0 && (
          <div className="print__block">
            <h3>Síntomas de alarma referidos</h3>
            <p>{flags.join('; ')}</p>
          </div>
        )}

        {Object.keys(scores).length > 0 && (
          <>
            <h2>3. Instrumentos clinimétricos</h2>
            <table>
              <thead>
                <tr>
                  <th>Instrumento</th>
                  <th>Puntaje</th>
                  <th>Interpretación</th>
                </tr>
              </thead>
              <tbody>
                {QUESTIONNAIRE_ORDER.filter((id) => scores[id]).map((id) => {
                  const s = scores[id]!;
                  return (
                    <tr key={id}>
                      <td>
                        {QUESTIONNAIRES[id].name} ({QUESTIONNAIRES[id].acronym})
                      </td>
                      <td className="num">
                        {s.total} / {s.max}
                        {s.subscales ? ` (${s.subscales.map((x) => `${x.label} ${x.value}/${x.max}`).join(', ')})` : ''}
                      </td>
                      <td>{s.interpretation}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {summary && (
          <>
            <h2>4. Anexo: resumen del interrogatorio digital</h2>
            <div className="md small">
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
          </>
        )}

        {n?.research && n.research.length > 0 && (
          <>
            <h2>5. Referencias consultadas</h2>
            <ul className="small">
              {n.research.flatMap((r) => r.sources).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </>
        )}

        {visit.files.length > 0 && (
          <>
            <h2>6. Estudios y archivos adjuntos</h2>
            <ul className="small">
              {visit.files.map((f, i) => (
                <li key={i}>
                  {f.name}
                  {f.uploadedAt ? ` · ${formatDateShort(f.uploadedAt)}` : ''}
                </li>
              ))}
            </ul>
          </>
        )}

        {previous.length > 0 && (
          <>
            <h2>7. Visitas anteriores</h2>
            <ul className="small">
              {previous.map((v) => (
                <li key={v.id}>
                  {formatDateShort(v.createdAt)} · {visitReasons(v).join(', ') || 'Sin motivo registrado'}
                  {v.notes?.diagnosis ? ` · Dx: ${v.notes.diagnosis}` : ''}
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="print__sign">
          <div>
            {doctorName}
            <br />
            Urología · Cédula profesional ________
          </div>
        </div>
        <div className="print__foot">
          Documento generado por el sistema del consultorio el {formatDateTime(new Date())}. Información confidencial protegida por la LFPDPPP y la NOM-004-SSA3-2012.
        </div>
      </article>
    </Surface>
  );
};
