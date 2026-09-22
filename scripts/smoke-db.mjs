// Prueba de humo de los flujos de ESCRITURA contra la base configurada en .env,
// usando los repos reales de la app cargados con Vite SSR.
//
//   npm run smoke:db          (sin llamar a OpenAI)
//   npm run smoke:db -- --ai  (además genera un resumen real con OpenAI)
//
// Crea visitas y citas con teléfono 5559XXXXnn y nombre "Prueba Auto …" y las
// BORRA al final (solo las que creó). No toca filas existentes.
import { createServer } from 'vite';

const RUN_AI = process.env.RUN_AI === '1' || process.argv.includes('--ai');
const server = await createServer({
  root: process.cwd(),
  configFile: 'vite.config.ts',
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'error',
});
const load = (p) => server.ssrLoadModule('/' + p);
const V = await load('src/data/visits.repo.ts');
const A = await load('src/data/appointments.repo.ts');
const S = await load('src/services/agenda.ts');
const J = await load('src/services/ai/summaryJob.ts');
const F = await load('src/domain/intake/formModel.ts');
const D = await load('src/lib/dates.ts');
const AG = await load('src/domain/agenda.ts');
const SB = await load('src/data/supabase.ts');
const DR = await load('src/data/doctors.repo.ts');
const ST = await load('src/domain/status.ts');
const SUM = await load('src/services/ai/summary.ts');

const seed = String(Math.floor(Math.random() * 9000) + 1000);
const PH = (n) => `5559${seed}${String(n).padStart(2, '0')}`;
const NAME = (n) => `Prueba Auto ${seed}-${n} Apellido`;
const visits = new Set();
const appts = new Set();
const results = [];
const test = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('  ✔', name);
  } catch (e) {
    results.push({ name, ok: false, err: e });
    console.log('  ✘', name, '→', e && e.message ? e.message : e, e && e.detail ? JSON.stringify(e.detail).slice(0, 300) : '');
  }
};
const eq = (a, b, msg) => {
  if (a !== b) throw new Error(`${msg ?? 'assert'}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
};
const ok = (c, msg) => {
  if (!c) throw new Error(msg ?? 'assert');
};
const rejects = async (p, re, msg) => {
  try {
    await p;
  } catch (e) {
    if (re && !re.test(String(e && (e.name + ' ' + e.message)))) throw new Error(`${msg ?? 'rejects'}: error inesperado ${e && e.name}: ${e && e.message}`);
    return e;
  }
  throw new Error(`${msg ?? 'rejects'}: no lanzó`);
};
const track = (v) => (visits.add(v.id), v);
const trackA = (a) => (appts.add(a.id), a);

const PATIENT = { role: 'patient' };
const RECEP = { role: 'reception' };
const DOC_A = { role: 'doctor', username: 'zz-prueba-a', fullName: 'Dr. Prueba A' };
const DOC_B = { role: 'doctor', username: 'zz-prueba-b', fullName: 'Dr. Prueba B' };
const ADMIN = { role: 'admin', username: 'zz-admin' };

const legacyOpenBefore = async () => {
  const { data, error } = await SB.supabase.from('patient_forms').select('id,status').is('symptoms->>version', null);
  if (error) throw error;
  return data.map((r) => `${r.id}:${r.status}`).sort().join('|');
};

// ---------- estado del wizard completo ----------
const fullWizardState = (phone, name) => {
  const s = F.initialWizardState();
  s.personal = { fullName: name, birth: { d: '12', m: '03', y: '1961' }, gender: 'Masculino', phone, email: '', noEmail: true, referralSource: 'Recomendación', referredByDoctor: '' };
  s.alarms = ['gross_hematuria'];
  s.alarmsAnswered = true;
  s.reasons = ['prostate'];
  s.symptoms = { prostate: ['weak_stream', 'nocturia', 'pelvic_pain'] };
  s.histories = { prostate: F.DEFAULT_HISTORIES.prostate() };
  s.general = { conditions: ['Ninguna'], otherCondition: '', surgeries: '', meds: '', allergies: '', smoking: 'No', alcohol: 'No', familyHistory: ['Ninguna / No sé'] };
  s.otherTopics = 'Prueba automática: fila temporal, borrar.';
  s.consent = true;
  const steps = F.computeSteps(s, 'new');
  for (const st of steps) {
    const k = st.step;
    const items = k.kind === 'question' ? [k.item] : k.kind === 'question-group' ? k.items : [];
    for (const it of items) {
      s.answers[k.questionnaire] ??= {};
      if (it.kind === 'scale') s.answers[k.questionnaire][it.id] = it.options[Math.min(2, it.options.length - 1)].value;
      else if (it.kind === 'yesno') s.answers[k.questionnaire][it.id] = false;
      else if (it.kind === 'range') s.answers[k.questionnaire][it.id] = it.min;
      else if (it.kind === 'multi') s.answers[k.questionnaire][it.id] = [];
    }
  }
  return { state: s, steps };
};

console.log(`\nSemilla ${seed} · teléfonos 5559${seed}xx · IA real: ${RUN_AI ? 'sí' : 'no'}\n`);
const legacySnapshot = await legacyOpenBefore();
const doctors = await DR.listDoctors();
console.log('Doctores en base:', doctors.map((d) => d.username).join(', ') || '(ninguno)');

try {
  // ================= zona horaria y agenda pura =================
  console.log('\n[Fechas y agenda]');
  await test('12:00 Culiacán = 19:00Z y regresa como 12:00', async () => {
    const iso = D.toClinicISO('2026-09-21', '12:00');
    eq(iso, '2026-09-21T19:00:00.000Z');
    eq(D.clinicTimeOf(iso), '12:00');
    eq(D.clinicDayOf(iso), '2026-09-21');
  });
  await test('slots del día: 12 de 30 min, 12:00 a 17:30', async () => {
    const slots = AG.getSlots('2026-09-21', []);
    eq(slots.length, 12);
    eq(slots[0].time, '12:00');
    eq(slots[11].time, '17:30');
    eq(AG.getSlots('2026-09-20', [])[0].state, 'closed', 'domingo cerrado');
  });

  // ================= permisos de la llave anon =================
  console.log('\n[Permisos de la llave anon]');
  await test('INSERT, UPDATE (no-op) y DELETE permitidos en patient_forms', async () => {
    const v = track(await V.createVisit({ personal: { fullName: NAME(0), age: 40, gender: 'Masculino', phone: PH(0) }, status: 'arrived', kind: 'first', source: 'reception', by: RECEP }));
    const { data, error } = await SB.supabase.from('patient_forms').update({ status: 'arrived' }).eq('id', v.id).select('id');
    if (error) throw error;
    ok(data && data.length === 1, 'UPDATE devolvió 0 filas: RLS sin política de UPDATE para anon. Ejecute supabase/sql/permisos-anon-temporal.sql en el SQL Editor.');
    const del = await SB.supabase.from('patient_forms').delete().eq('id', v.id).select('id');
    if (del.error) throw del.error;
    ok(del.data && del.data.length === 1, 'DELETE devolvió 0 filas: falta política de DELETE para filas de prueba (5559…).');
    visits.delete(v.id);
  });

  // ================= kiosko: paciente nuevo =================
  console.log('\n[Kiosko · paciente nuevo]');
  const p1 = PH(1);
  const { state: w1, steps: steps1 } = fullWizardState(p1, NAME(1));
  let v1;
  await test('estado completo pasa todos los bloqueadores', async () => {
    const blocked = steps1.map((s) => [s.key, F.stepBlocker(w1, s)]).filter(([, b]) => b);
    eq(blocked.length, 0, `pasos bloqueados: ${JSON.stringify(blocked)}`);
    ok(steps1.some((s) => s.key === 'q:ipss:q1'), 'IPSS disparado');
    ok(steps1.some((s) => s.key.startsWith('q:nih_cpsi')), 'NIH-CPSI disparado');
  });
  await test('createVisit (kiosk, arrived) inserta y se lee igual', async () => {
    v1 = track(await V.createVisit({ personal: F.buildPersonal(w1), status: 'arrived', kind: 'first', source: 'kiosk', by: PATIENT }));
    const r = await V.getVisit(v1.id);
    eq(r.status, 'arrived');
    eq(r.meta.source, 'kiosk');
    eq(r.ai.status, 'skipped');
    eq(r.personal.birthDate, '1961-03-12');
    eq(r.personal.age, F.buildPersonal(w1).age);
    eq(r.personal.email, undefined);
  });
  await test('saveWizardDraft persiste el borrador en la fila', async () => {
    await V.saveWizardDraft(v1.id, { stepKey: 'alarm', stepIndex: 6, stepCount: steps1.length, state: w1 });
    const r = await V.getVisit(v1.id);
    eq(r.meta.wizard.stepIndex, 6);
    eq(r.meta.wizard.state.personal.phone, p1);
    ok(r.meta.wizard.lastSavedAt, 'lastSavedAt');
  });
  await test('segundo registro con el mismo teléfono → DuplicateOpenVisit', async () => {
    const e = await rejects(V.createVisit({ personal: F.buildPersonal(w1), status: 'arrived', kind: 'first', source: 'kiosk', by: PATIENT }), /DuplicateOpenVisit/);
    eq(e.existing.id, v1.id);
  });
  await test('teléfono con formato "(555) 9…" encuentra la misma visita', async () => {
    const pretty = `(${p1.slice(0, 3)}) ${p1.slice(3, 6)}-${p1.slice(6)}`;
    const list = await V.listVisitsByPhone(pretty);
    ok(list.some((v) => v.id === v1.id), 'no encontrada');
  });
  let intake1;
  await test('buildIntake: IPSS 14/35 moderado, NIH-CPSI, bandera roja de hematuria', async () => {
    intake1 = F.buildIntake(w1, 'kiosk');
    eq(intake1.questionnaireScores.ipss.total, 14);
    eq(intake1.questionnaireScores.ipss.severity, 'moderate');
    eq(intake1.questionnaireScores.ipss.complete, true);
    ok(intake1.questionnaireScores.nih_cpsi, 'nih');
    ok(intake1.redFlags.some((f) => /Hematuria/.test(f)), `redFlags: ${intake1.redFlags}`);
    ok(intake1.consentAcceptedAt, 'consent');
    ok(intake1.histories.prostate, 'historia prostática');
  });
  await test('completeIntake → waiting, ai.pending, borrador limpio, columnas planas', async () => {
    await V.completeIntake(v1.id, intake1, PATIENT, F.buildPersonal(w1));
    const r = await V.getVisit(v1.id);
    eq(r.status, 'waiting');
    eq(r.ai.status, 'pending');
    eq(r.meta.wizard, undefined);
    eq(r.intake.questionnaireScores.ipss.total, 14);
    const { data } = await SB.supabase.from('patient_forms').select('classification, medical_history, symptoms').eq('id', v1.id).single();
    eq(JSON.stringify(data.classification), JSON.stringify(['Problemas de próstata']));
    eq(data.medical_history.v2.general.smoking, 'No');
    eq(data.symptoms.questionnaireScores.ipss.score, 14, 'espejo v1');
    eq(data.symptoms.version, 2);
  });
  await test('doble tap de "Enviar" no rompe (idempotente desde waiting)', async () => {
    await V.completeIntake(v1.id, intake1, PATIENT);
    eq((await V.getVisit(v1.id)).status, 'waiting');
  });
  await test('claimAi: primera reclama, segunda regresa null (CAS)', async () => {
    const a = await V.claimAi(v1.id);
    ok(a && a.ai.status === 'generating', 'primera');
    eq(a.ai.attempts, 1);
    const b = await V.claimAi(v1.id);
    eq(b, null, 'segunda');
  });
  await test('finishAi ready; claim normal no; claim forzado sí', async () => {
    await V.finishAi(v1.id, { status: 'ready', summary: '### prueba', generatedAt: new Date().toISOString() });
    eq((await V.getVisit(v1.id)).ai.status, 'ready');
    eq(await V.claimAi(v1.id), null);
    const f = await V.claimAi(v1.id, true);
    ok(f && f.ai.status === 'generating', 'force');
    await V.finishAi(v1.id, { status: 'failed', error: 'simulado' });
    const g = await V.claimAi(v1.id);
    ok(g && g.ai.attempts === 3, `reintento tras fallo, attempts=${g && g.ai.attempts}`);
    await V.finishAi(v1.id, { status: 'failed', error: 'simulado' });
    eq(await V.claimAi(v1.id), null, 'tope de 3 intentos');
  });
  if (RUN_AI) {
    await test('ensureSummary real (OpenAI): nota con ALERTA y sin nombre del paciente', async () => {
      await V.finishAi(v1.id, { status: 'pending', attempts: 0, error: undefined });
      const input = SUM.buildSummaryInput(await V.getVisit(v1.id));
      const json = JSON.stringify(input);
      ok(!json.includes(p1) && !json.toLowerCase().includes('apellido'), 'entrada con PII');
      const r = await J.ensureSummary(v1.id);
      ok(r && r.ai.status === 'ready', `status=${r && r.ai.status} err=${r && r.ai.error}`);
      ok(/\*\*ALERTA:\*\*/.test(r.ai.summary), 'sin ALERTA');
      ok(/### 1\./.test(r.ai.summary), 'sin secciones');
      ok(!r.ai.summary.includes(NAME(1)), 'nombre en resumen');
      console.log('    modelo:', r.ai.model, '· longitud:', r.ai.summary.length);
    });
  }

  // ================= consulta =================
  console.log('\n[Consulta]');
  await test('dos doctores "Atender" al mismo tiempo: exactamente uno gana', async () => {
    const [a, b] = await Promise.allSettled([V.startConsultation(v1.id, DOC_A), V.startConsultation(v1.id, DOC_B)]);
    const won = [a, b].filter((x) => x.status === 'fulfilled');
    const lost = [a, b].filter((x) => x.status === 'rejected');
    eq(won.length, 1, `ganadores=${won.length}`);
    ok(lost[0].reason.name === 'TransitionRejected', `perdedor: ${lost[0].reason.name}`);
    const r = await V.getVisit(v1.id);
    eq(r.status, 'in_consultation');
    eq(r.meta.doctorUsername, won[0].value.meta.doctorUsername);
    ok(r.notes && r.notes.startedAt, 'startedAt');
  });
  await test('recepción no puede mover in_consultation', async () => {
    await rejects(V.transitionVisit(v1.id, 'waiting', RECEP), /TransitionRejected/);
    await rejects(V.cancelVisit(v1.id, RECEP, 'se_retiro'), /TransitionRejected/);
  });
  await test('devolver a sala y volver a atender', async () => {
    await V.returnToWaiting(v1.id, DOC_A);
    eq((await V.getVisit(v1.id)).status, 'waiting');
    await V.startConsultation(v1.id, DOC_A);
    eq((await V.getVisit(v1.id)).status, 'in_consultation');
  });
  await test('borrador de nota se guarda y F5 lo recupera', async () => {
    await V.saveNoteDraft(v1.id, { diagnosis: 'HPB en estudio', vitals: { ta: '120/80' } });
    const r = await V.getVisit(v1.id);
    eq(r.notes.draft.diagnosis, 'HPB en estudio');
    eq(r.notes.draft.vitals.ta, '120/80');
    eq(r.status, 'in_consultation');
  });
  await test('saveConsultation → completed, sin borrador, con firma', async () => {
    const notes = { ...V.emptyNotes(), vitalSigns: 'TA: 120/80 mmHg', currentIllness: 'x', physicalExam: 'y', diagnosis: 'HPB', prescription: 'Tamsulosina' };
    await V.saveConsultation(v1.id, notes, DOC_A);
    const r = await V.getVisit(v1.id);
    eq(r.status, 'completed');
    eq(r.notes.draft, undefined);
    eq(r.notes.doctorUsername, DOC_A.username);
    eq(r.notes.doctorName, DOC_A.fullName);
    ok(r.notes.savedAt && r.meta.completedAt, 'fechas');
    ok(r.intake && r.intake.questionnaireScores.ipss.total === 14, 'intake sobrevive a la firma');
  });
  await test('completed no se puede cancelar ni reabrir por doctor', async () => {
    await rejects(V.transitionVisit(v1.id, 'cancelled', DOC_A), /TransitionRejected/);
    await rejects(V.transitionVisit(v1.id, 'arrived', DOC_A), /TransitionRejected/);
  });
  await test('archivo adjunto se agrega sin perder la nota', async () => {
    const files = await V.addFile(v1.id, { name: 'lab.pdf', url: 'https://example.invalid/lab.pdf', type: 'application/pdf', uploadedAt: new Date().toISOString() });
    eq(files.length, 1);
    const r = await V.getVisit(v1.id);
    eq(r.notes.diagnosis, 'HPB');
    eq(r.files[0].name, 'lab.pdf');
  });

  // ================= recepción: "Está aquí" + código =================
  console.log('\n[Recepción · código de tablet]');
  const p2 = PH(2);
  let v2;
  await test('createVisit recepción con código de 4 dígitos', async () => {
    v2 = track(await V.createVisit({ personal: { fullName: NAME(2), age: 60, gender: 'Femenino', phone: p2 }, status: 'arrived', kind: 'first', source: 'reception', by: RECEP, withKioskCode: true, preferredDoctor: DOC_A.username }));
    ok(/^\d{4}$/.test(v2.meta.kioskCode), 'código');
  });
  await test('findByKioskCode encuentra la visita; código ajeno no', async () => {
    const f = await V.findByKioskCode(v2.meta.kioskCode);
    ok(f && f.id === v2.id, 'no encontrada');
    const other = String(1000 + ((Number(v2.meta.kioskCode) + 1) % 9000));
    const g = await V.findByKioskCode(other);
    ok(!g || g.id !== v2.id, 'otro código no debe dar esta visita');
  });
  await test('continuar por código: wizardStateFromVisit precarga datos', async () => {
    const s = F.wizardStateFromVisit(v2);
    eq(s.personal.fullName, NAME(2));
    eq(s.personal.gender, 'Femenino');
    const steps = F.computeSteps(s, 'returning');
    eq(steps[0].key, 'p:confirm');
  });
  await test('skipIntake → waiting, ai.skipped; el código deja de servir', async () => {
    await V.skipIntake(v2.id, RECEP);
    const r = await V.getVisit(v2.id);
    eq(r.status, 'waiting');
    eq(r.ai.status, 'skipped');
    eq(r.meta.intakeMode, 'skipped');
    eq(await V.findByKioskCode(v2.meta.kioskCode), null);
  });
  await test('"Se retiró" (recepción) y reactivar solo admin', async () => {
    await V.cancelVisit(v2.id, RECEP, 'se_retiro', 'tenía prisa');
    const r = await V.getVisit(v2.id);
    eq(r.status, 'cancelled');
    eq(r.meta.cancelReason, 'se_retiro');
    await rejects(V.reactivateVisit(v2.id, DOC_A), /TransitionRejected/);
    await V.reactivateVisit(v2.id, ADMIN);
    const r2 = await V.getVisit(v2.id);
    eq(r2.status, 'arrived');
    eq(r2.meta.cancelReason, undefined);
    ok(r2.meta.events.length >= 4, 'bitácora');
  });
  await test('"Registrar y atender" nace in_consultation con nota iniciada', async () => {
    const v = track(await V.createVisit({ personal: { fullName: NAME(9), age: 45, gender: 'Masculino', phone: PH(9) }, status: 'in_consultation', kind: 'first', source: 'doctor', by: DOC_A, intakeMode: 'staff', doctorUsername: DOC_A.username }));
    const r = await V.getVisit(v.id);
    eq(r.status, 'in_consultation');
    ok(r.notes && r.notes.startedAt, 'startedAt');
    eq(r.meta.calledAt !== undefined, true);
  });

  // ================= barrido de abandonadas =================
  console.log('\n[Barrido]');
  await test('sweepAbandoned cancela la de ayer y no toca filas legacy', async () => {
    const v = track(await V.createVisit({ personal: { fullName: NAME(5), age: 50, gender: 'Masculino', phone: PH(5) }, status: 'arrived', kind: 'first', source: 'reception', by: RECEP }));
    const yesterday = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
    const { error } = await SB.supabase.from('patient_forms').update({ created_at: yesterday }).eq('id', v.id);
    if (error) throw error;
    const n = await V.sweepAbandoned({ role: 'system' });
    ok(n >= 1, `n=${n}`);
    const r = await V.getVisit(v.id);
    eq(r.status, 'cancelled');
    eq(r.meta.cancelReason, 'abandonado');
    eq(await legacyOpenBefore(), legacySnapshot, 'filas legacy cambiaron');
  });

  // ================= citas =================
  console.log('\n[Agenda]');
  const docA = doctors[0] ? doctors[0].username : DOC_A.username;
  const docAName = doctors[0] ? doctors[0].fullName : DOC_A.fullName;
  const day = AG.upcomingWorkdays(3).at(-1);
  const at = (t) => D.toClinicISO(day, t);
  const p3 = PH(3);
  let a1;
  await test('createAppointment (recepción) queda scheduled', async () => {
    a1 = trackA(await A.createAppointment({ patientName: NAME(3), patientPhone: p3, patient: { age: 55, gender: 'Masculino' }, doctorUsername: docA, doctorName: docAName, startsAt: at('12:00'), reasons: ['Problemas de próstata'], source: 'phone', createdBy: 'recepcion' }));
    const r = await A.getAppointment(a1.id);
    eq(r.status, 'scheduled');
    eq(r.startsAt, at('12:00'));
    eq(r.kind, 'first');
    eq(r.patient.age, 55);
    eq(r.durationMinutes, 30);
  });
  await test('mismo doctor 12:00 y 12:15 chocan; 12:30 libre; otro doctor 12:00 libre', async () => {
    await rejects(A.createAppointment({ patientName: NAME(31), patientPhone: PH(31), doctorUsername: docA, doctorName: docAName, startsAt: at('12:00'), source: 'web' }), /SlotTakenError/);
    await rejects(A.createAppointment({ patientName: NAME(32), patientPhone: PH(32), doctorUsername: docA, doctorName: docAName, startsAt: at('12:15'), source: 'web' }), /SlotTakenError/);
    trackA(await A.createAppointment({ patientName: NAME(33), patientPhone: PH(33), doctorUsername: docA, doctorName: docAName, startsAt: at('12:30'), source: 'web' }));
    trackA(await A.createAppointment({ patientName: NAME(34), patientPhone: PH(34), doctorUsername: DOC_B.username, doctorName: DOC_B.fullName, startsAt: at('12:00'), source: 'reception' }));
  });
  await test('getSlots marca 12:00 y 12:30 ocupados para el doctor A', async () => {
    const list = await A.listAppointments({ from: D.startOfDayClinicISO(day), to: D.startOfDayClinicISO(D.addDays(day, 1)), doctorUsername: docA });
    const slots = AG.getSlots(day, list, { doctorUsername: docA });
    eq(slots.find((s) => s.time === '12:00').state, 'booked');
    eq(slots.find((s) => s.time === '12:30').state, 'booked');
    ok(slots.find((s) => s.time === '13:00').state !== 'booked', '13:00 libre');
  });
  await test('listOccupiedSlots (público) no trae nombres', async () => {
    const occ = await A.listOccupiedSlots(docA, D.startOfDayClinicISO(day), D.startOfDayClinicISO(D.addDays(day, 1)));
    ok(occ.length >= 2, 'ocupados');
    ok(occ.every((o) => o.patientName === '' && o.patientPhone === ''), 'nombres filtrados');
  });
  await test('confirmar; confirmar dos veces se rechaza', async () => {
    await A.transitionAppointment(a1.id, 'confirmed', 'reception');
    const r = await A.getAppointment(a1.id);
    eq(r.status, 'confirmed');
    ok(r.confirmedAt, 'confirmedAt');
    await rejects(A.transitionAppointment(a1.id, 'confirmed', 'reception'), /TransitionRejected/);
  });
  await test('reagendar a 13:00 guarda historial; a 12:30 (ocupado) se rechaza', async () => {
    await rejects(A.rescheduleAppointment(a1.id, at('12:30'), 'recepcion', 'reception'), /SlotTakenError/);
    const r = await A.rescheduleAppointment(a1.id, at('13:00'), 'recepcion', 'reception');
    eq(r.startsAt, at('13:00'));
    eq(r.history.length, 1);
    eq(r.history[0].from, at('12:00'));
    eq(r.status, 'confirmed');
  });
  let checkin1;
  await test('check-in "Llegó": crea visita arrived con código y liga la cita', async () => {
    checkin1 = await S.checkInAppointment(a1.id, RECEP);
    track(checkin1.visit);
    eq(checkin1.reused, false);
    eq(checkin1.visit.status, 'arrived');
    eq(checkin1.visit.meta.source, 'checkin');
    eq(checkin1.visit.meta.kind, 'first');
    eq(checkin1.visit.meta.appointmentId, a1.id);
    ok(/^\d{4}$/.test(checkin1.visit.meta.kioskCode), 'código');
    eq(checkin1.visit.personal.age, 55);
    eq(checkin1.visit.preferredDoctor, docA);
    const r = await A.getAppointment(a1.id);
    eq(r.status, 'checked_in');
    eq(r.visitId, checkin1.visit.id);
  });
  await test('segundo "Llegó" reutiliza la misma visita', async () => {
    const again = await S.checkInAppointment(a1.id, RECEP);
    eq(again.reused, true);
    eq(again.visit.id, checkin1.visit.id);
  });
  await test('cerrar consulta completa la cita origen (system)', async () => {
    await V.startConsultation(checkin1.visit.id, DOC_A);
    await V.saveConsultation(checkin1.visit.id, { ...V.emptyNotes(), vitalSigns: 'x', currentIllness: 'x', physicalExam: 'x', diagnosis: 'x', prescription: 'x' }, DOC_A);
    await A.transitionAppointment(a1.id, 'completed', 'system');
    eq((await A.getAppointment(a1.id)).status, 'completed');
  });
  await test('check-in de paciente con visita previa → subsecuente con prevVisitId y datos previos', async () => {
    const a = trackA(await A.createAppointment({ patientName: NAME(3), patientPhone: p3, doctorUsername: docA, doctorName: docAName, startsAt: at('14:00'), source: 'followup', kind: 'followup', prevVisitId: checkin1.visit.id }));
    const r = await S.checkInAppointment(a.id, RECEP);
    track(r.visit);
    eq(r.visit.meta.kind, 'followup');
    eq(r.visit.meta.prevVisitId, checkin1.visit.id);
    eq(r.visit.personal.isFirstTime, false);
    eq(r.visit.personal.gender, 'Masculino');
  });
  await test('cancelar cita y check-in sobre cancelada NO crea visita huérfana', async () => {
    const a = trackA(await A.createAppointment({ patientName: NAME(6), patientPhone: PH(6), doctorUsername: docA, doctorName: docAName, startsAt: at('15:00'), source: 'reception' }));
    await A.transitionAppointment(a.id, 'cancelled', 'reception', { cancelReason: 'paciente avisó' });
    const r = await A.getAppointment(a.id);
    eq(r.status, 'cancelled');
    eq(r.cancelReason, 'paciente avisó');
    await rejects(S.checkInAppointment(a.id, RECEP), /TransitionRejected/);
    eq(await V.findOpenVisitByPhone(PH(6)), null, 'visita huérfana');
  });
  await test('no_show y reagendar la reabre como scheduled', async () => {
    const a = trackA(await A.createAppointment({ patientName: NAME(7), patientPhone: PH(7), doctorUsername: docA, doctorName: docAName, startsAt: at('16:00'), source: 'reception' }));
    await A.transitionAppointment(a.id, 'no_show', 'reception');
    eq((await A.getAppointment(a.id)).status, 'no_show');
    const r = await A.rescheduleAppointment(a.id, at('16:30'), 'recepcion', 'reception');
    eq(r.status, 'scheduled');
    eq(r.noShowAt, undefined);
    eq(r.history.length, 1);
  });
  await test('acciones de agenda: "Llegó" solo hoy (zona de la clínica)', async () => {
    const todayAppt = { ...a1, status: 'scheduled', startsAt: D.toClinicISO(D.todayClinic(), '23:30') };
    ok(ST.appointmentActions(todayAppt, 'reception').some((x) => x.key === 'checkin'), 'hoy');
    const futureAppt = { ...a1, status: 'scheduled', startsAt: at('12:00') };
    ok(!ST.appointmentActions(futureAppt, 'reception').some((x) => x.key === 'checkin'), 'futuro');
  });
} finally {
  console.log('\n[Limpieza]');
  const vids = Array.from(visits);
  const aids = Array.from(appts);
  // Primero citas (pueden tener FK a patient_forms), luego visitas.
  if (aids.length) {
    const { data, error } = await SB.supabase.from('appointments').delete().in('id', aids).select('id');
    console.log(`  citas borradas: ${data ? data.length : 0}/${aids.length}`, error ? error.message : '');
  }
  if (vids.length) {
    const { data, error } = await SB.supabase.from('patient_forms').delete().in('id', vids).select('id');
    console.log(`  visitas borradas: ${data ? data.length : 0}/${vids.length}`, error ? error.message : '');
  }
  const { data: leftover } = await SB.supabase.from('patient_forms').select('id').like('phone', `5559${seed}%`);
  const { data: leftoverA } = await SB.supabase.from('appointments').select('id').like('patient_phone', `5559${seed}%`);
  console.log(`  residuos: visitas=${leftover ? leftover.length : '?'} citas=${leftoverA ? leftoverA.length : '?'}`);
  await server.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} pruebas OK`);
  if (failed.length) {
    console.log('FALLAS:');
    for (const f of failed) console.log(' -', f.name, '→', f.err && f.err.message);
  }
  process.exit(failed.length ? 1 : 0);
}
