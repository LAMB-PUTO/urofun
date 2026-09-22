# Arquitectura de flujos — Urología Funcional

**Versión:** 1.0 · 2026-09-19 · Documento final del arquitecto (fusión de las 3 propuestas; base = "Cockpit de Consulta (Doctor-First)", con injertos de "Front-Desk-First" y "Visit-first").
**Alcance:** lógica y datos. El plan visual/animaciones es un documento aparte y se construye sobre `components/ui` + `styles/tokens.css` definidos aquí.
**Restricción de hoy:** trabajo en localhost, sin push, sin escrituras a la base. Todo lo marcado **HOY** se puede enviar sin SQL; lo marcado **MIGRACIÓN** vive en `supabase/migrations/` y se aplica después.

---

## 0. Decisiones de arquitectura (resumen ejecutivo)

| # | Decisión | De dónde viene | Por qué |
|---|---|---|---|
| D1 | **1 fila de `patient_forms` = 1 ENCUENTRO (visita)**, no una persona. El recurrente crea fila nueva enlazada por `phone` + `symptoms.encounter.prevEncounterId`. `created_at` nunca se reescribe. | Cockpit (ganadora) | Las 10 filas legacy siguen funcionando con un mapper tolerante; los deltas de scores (IPSS 24→15) salen gratis; `updateForm` (que pisa `created_at` y `symptoms`) se elimina. |
| D2 | **El encuentro nace cuando el paciente está físicamente en el consultorio** (check-in "Llegó" o kiosko). La cita online/telefónica crea SOLO una fila en `appointments`. | Front-Desk-First | Mata las filas fantasma `waiting` que hoy crea `SchedulePage.handleSubmit` y evita filas `intake_pending` que nunca llegan. |
| D3 | **Guardar primero, enriquecer después.** `submitIntake` persiste en <1 s con `symptoms.ai.status='pending'`; la IA corre asíncrona con claim compare-and-set y watchdog en escritorio. Nunca se guarda un texto de error como `aiSummary`. | Cockpit + Visit-first (CAS) | Hoy `FormPage.handleSubmit` espera a OpenAI antes de `saveForm`; con red lenta el paciente cierra la tablet y se pierde todo. |
| D4 | **Nota determinista de respaldo** (scores + interpretación + banderas + antecedentes) renderizada desde datos cuando no hay `ai.summary`. | Front-Desk-First | La consulta nunca depende de OpenAI. |
| D5 | **Una sola tabla de transiciones** `TRANSITIONS[status][role]` en `domain/status.ts`; ningún componente decide por su cuenta quién está "en sala". Cada update de estado usa filtro `.eq('status', from)` (CAS). | Visit-first | `getForms` hoy usa `neq('completed')`: cualquier estado nuevo se colaría a la sala. |
| D6 | **Cockpit de consulta a pantalla completa** `/consulta/:encounterId` (izquierda: intake; derecha: nota NOM-004) en vez del modal de 600 px. | Cockpit | Es lo que el doctor usa 40 minutos por paciente. |
| D7 | **Registro rápido (<30 s), teléfono primero**, duplicado = advertencia, nunca bloqueo. Mismo diálogo en recepción y doctor. | Front-Desk-First | `checkPhoneExists/checkEmailExists` hoy bloquean a familiares que comparten número/correo. |
| D8 | **Invariante: un paciente (phone) tiene a lo más UN encuentro abierto** (`arrived/waiting/in_consultation`). El repo lo aplica de forma idempotente. | Visit-first | Evita dos tarjetas en sala por doble tap. |
| D9 | **Desidentificación única** (`domain/deidentify.ts`) para OpenAI y Perplexity. Nunca nombre/teléfono/email/fecha de nacimiento. | Cockpit | Hoy `FormPage` manda `formData` completo con PII a OpenAI. |
| D10 | **Llaves detrás de Edge Functions**, fallback cliente solo con `VITE_AI_PROXY_URL` vacío en `DEV`. Lo que ya existe en `src/services/env.ts` (`aiProxyUrl`) es el punto de enganche. | Las tres | `.env` y `test*.js` con llaves están en el historial de git. |
| D11 | **"Limpiar registros" desaparece.** Se reemplaza por `cancelled` con motivo + barrido automático de encuentros abandonados al cierre del día. | Front-Desk-First | `clearForms` borra TODA la tabla con un clic de recepción. |
| D12 | **"Hoy" y todas las fechas en `America/Mazatlan`** (UTC-7 fijo, sin horario de verano). | Front-Desk-First / Cockpit | Después de las 17:00 el tablero mostraría el día equivocado. |

Lo que ya existe en el working tree y se conserva tal cual: `src/domain/questionnaires/*` (definiciones + `scoreAll`), `src/domain/intake/{catalog,redFlags}.ts`, `src/services/env.ts` (`ENV`, `aiAvailable`), `src/services/session.ts` (`uf.session.v1`, `useSession`, `loginReception`, `loginDoctorSession`), `.env.example`. `.env` y `test*.js` ya están marcados `D` en el índice; falta rotar llaves.

---

## 1. Máquina de estados

### 1.1 Encuentro (`patient_forms.status`, texto libre hoy)

Valores que se escriben **HOY** en `patient_forms.status`: `arrived` · `waiting` · `in_consultation` · `completed` · `cancelled`. Legacy aceptado en lectura: `waiting`, `completed` (las 10 filas actuales).

| Estado | Significado | Entra por (trigger) | Quién | Sale hacia | Valor guardado + campos que se escriben |
|---|---|---|---|---|---|
| `arrived` | Paciente en el consultorio; tablet en curso o por entregar. | (a) Check-in "Llegó" sobre una cita de hoy; (b) `RegisterPatientDialog` modo walk-in; (c) kiosko "Soy nuevo"/"Ya he venido" al salir del paso `basic`. | recepción / doctor / paciente (kiosko) | `waiting`, `cancelled`, `in_consultation` (solo doctor "Atender ahora") | `status='arrived'`; `symptoms.encounter={kind,source,prevEncounterId?,appointmentId?,kioskCode,checkedInAt}`; `symptoms.wizard={stepIdx:0,total}`; `symptoms.ai={status:'none'}`; `symptoms.events[]+={type:'arrived',by,at}` |
| `arrived` (sub-estado **draft**) | El wizard va a la mitad. No es un status distinto: se lee `symptoms.wizard.stepIdx > 0 && !wizard.completedAt`. | Cada "Siguiente" del kiosko (`saveDraft`, debounce 1.5 s). | paciente | — | `symptoms.rawSymptoms` (parcial), `symptoms.wizard.stepIdx`, `wizard.lastSavedAt` |
| `waiting` | Cuestionario terminado (o saltado). Listo para pasar. **Único estado que la columna "Listos para pasar" muestra.** | (a) Kiosko "Finalizar" (`submitIntake`); (b) recepción "Sin tablet" (`skipIntake`). | paciente / recepción | `in_consultation`, `cancelled`, `arrived` (recepción "Reaplicar cuestionario") | `status='waiting'`; `symptoms.{rawSymptoms,consultationReasons,questionnaireScores,redFlags,otherTopicsToDiscuss,wizard.completedAt,privacyAcceptedAt}`; `symptoms.ai={status:'pending',attempts:0,requestedAt,inputHash}` (o `'skipped'`); `classification=consultationReasons`; `medical_history`; `symptoms.intakeMode='tablet'|'skipped'`; evento `intake_done` |
| `in_consultation` | Un doctor lo está atendiendo. Otro doctor ve la tarjeta gris "En consulta con Dr. X". | Doctor "Atender" (`startConsultation`) con CAS `.in('status',['waiting','arrived'])`. | doctor | `completed`, `waiting` ("Devolver a sala") | `status='in_consultation'`; `medical_notes.{doctorUsername,doctorName,startedAt}`; evento `consult_start` |
| `completed` | Nota firmada. Vive en Historial. Editable por el mismo doctor 24 h (`version++`), después solo adenda. | Doctor "Guardar y cerrar" (`signNote`) con obligatorios NOM-004 válidos. | doctor | `completed` (edición 24 h / adenda) | `status='completed'`; `medical_notes.{…campos, signedAt, version:1, draft:null, nextAppointment{appointmentId,date}}`; evento `consult_end`; cita ligada → `appointments.status='completed'`; cita de seguimiento insertada si se eligió slot |
| `cancelled` | Paciente se retiró / error de captura / abandonado al cierre. Nunca se borra. | (a) Recepción "Se retiró" con motivo; (b) barrido automático `sweepAbandoned()` al abrir el panel: encuentros `arrived/waiting` con `created_at` anterior al inicio del día de hoy (Mazatlán). | recepción / doctor / admin / sistema | — (admin puede "Reactivar" → `arrived`) | `status='cancelled'`; `symptoms.cancelReason` (`'se_retiro'|'error_captura'|'abandonado'|'otro'`), `symptoms.cancelledAt`; evento `cancelled` |

Etiqueta derivada (no se guarda): `seguimiento_agendado` = encuentro `completed` cuyo `id` aparece como `appointments.symptoms.meta.prevEncounterId` en una cita `scheduled/confirmed`. Se calcula en `selectEncounterLabel(encounter, appointmentsOfPatient)`.

Invariante (repo, `encounters.repo.assertNoOpenEncounter(phone)`): antes de crear un encuentro se busca `phone=X and status in ('arrived','waiting','in_consultation') and created_at >= startOfTodayMazatlan()`; si existe, se devuelve ese `id` y la UI ofrece "Ir al registro actual".

### 1.2 Cita (`appointments.status`, texto libre hoy; la tabla tiene 0 filas)

| Estado | Entra por | Quién | Sale hacia | Valor guardado |
|---|---|---|---|---|
| `scheduled` | /schedule público, `RegisterPatientDialog` "Agendar", "Próxima cita" al firmar nota. | paciente / recepción / doctor | `confirmed`, `arrived`, `cancelled`, `no_show`, `scheduled` (reagendar in-place) | `status='scheduled'`; `appointment_date` (ISO UTC del slot Mazatlán); `symptoms.meta={source,kind,durationMin:30,reasons,notes,patient{fullName,age,gender,email}?,prevEncounterId?,createdBy,history:[]}`; `classification=reasons` |
| `confirmed` | Recepción "Confirmar" tras WhatsApp/llamada (opcional). | recepción | igual que `scheduled` | `status='confirmed'`; `symptoms.meta.confirmedAt` |
| `arrived` | Check-in "Llegó" (`appointments.repo.checkIn`) → crea/reusa el encuentro. | recepción / doctor | `completed`, `cancelled` | `status='arrived'`; `symptoms.meta.{checkedInAt, encounterId}` |
| `completed` | `signNote` del encuentro ligado. | sistema (doctor) | — | `status='completed'` |
| `cancelled` | "Cancelar" con motivo. | recepción / doctor / admin | `scheduled` ("Reactivar" con nuevo slot) | `status='cancelled'`; `symptoms.meta.{cancelReason, cancelledAt, by}` |
| `no_show` | Sugerido en ámbar a `appointment_date + 30 min` sin check-in; recepción confirma. | recepción / doctor | `scheduled` (reagendar) | `status='no_show'`; `symptoms.meta.noShowAt` |

Reagendar = misma fila, nuevo `appointment_date`, `symptoms.meta.history[] += {from,to,by,at}`. No se duplican filas.

### 1.3 Resumen IA (`patient_forms.symptoms.ai.status`, ortogonal al encuentro)

`none` → `pending` → `generating` → `done` | `error` (→ reintento) | `skipped`. `generating` con `startedAt` > 90 s se trata como `error` (cliente murió). Detalle en §5.6.

### 1.4 Tabla de transiciones por rol (`domain/status.ts`)

```ts
export const ENCOUNTER_TRANSITIONS: Record<EncounterStatus, Partial<Record<Role, EncounterStatus[]>>> = {
  arrived:         { patient: ['waiting'], reception: ['waiting','cancelled'], doctor: ['waiting','in_consultation','cancelled'], admin: ['waiting','in_consultation','cancelled'] },
  waiting:         { reception: ['arrived','cancelled'], doctor: ['in_consultation','arrived','cancelled'], admin: ['in_consultation','arrived','cancelled'] },
  in_consultation: { doctor: ['completed','waiting'], admin: ['completed','waiting'] },      // solo el doctor asignado o admin (ctx check)
  completed:       { doctor: ['completed'], admin: ['completed'] },                          // edición 24 h / adenda
  cancelled:       { admin: ['arrived'] },
};
export const canTransition = (from, to, role, ctx?: { attendingDoctor?: string; me?: string }) => …;
export const actionsFor = (encounter, session) => Array<{ label: string; to: EncounterStatus; variant: 'primary'|'ghost'|'danger' }>;
```

`canTransition` se valida en `encounters.repo.transition()` ANTES del update y se refuerza con el filtro CAS. Un `TransitionRejected` en la UI hace revert optimista + toast "Este paciente ya cambió de estado" + refetch.

---

## 2. Entidades y mapeo al esquema actual

### 2.1 Patient (persona) — derivada, sin tabla HOY

| Campo | HOY | MIGRACIÓN |
|---|---|---|
| identidad | `phone` normalizado a 10 dígitos (`lib/phone.ts#normalizeMx`); `patients.repo.findByPhone(phone)` = `select … where phone=X order by created_at asc`; fila[0] = persona, todas = encuentros | tabla `patients` |
| fullName, age, gender, phone, email, preferredDoctor | columnas de `patient_forms` (duplicadas en cada encuentro) | columnas de `patients` |
| birthDate, referralSource, referredByDoctor, isFirstTime | `medical_history.person{birthDate, referralSource, referredByDoctor, isFirstTimeAtRegistration}` (**clave nueva**; mapper también lee `symptoms.rawSymptoms.birthDate` legacy). Corrige `PatientHistoryCard` que lee `row.birthDate` (inexistente). | columnas |

### 2.2 Encounter (visita) = `patient_forms`

| Campo dominio | Columna / clave jsonb HOY |
|---|---|
| id, createdAt, status | `id`, `created_at` (nunca reescrito), `status` |
| fullName, age, gender, phone, email, preferredDoctor | columnas |
| kind, source, prevEncounterId, appointmentId, kioskCode, checkedInAt | `symptoms.encounter{kind:'first'|'followup', source:'kiosk'|'checkin'|'reception'|'doctor', prevEncounterId?, appointmentId?, kioskCode?, checkedInAt}` |
| intakeMode | `symptoms.intakeMode: 'tablet'|'skipped'|'staff_entered'` |
| wizard (draft) | `symptoms.wizard{stepIdx, total, activeSteps[], lastSavedAt, completedAt}` |
| intake | `symptoms.rawSymptoms` (formData completo), `symptoms.consultationReasons[]`, `symptoms.otherReason`, `symptoms.questionnaireScores` (ahora con `max`, `severity`, `interpretation`, `subscales` desde `domain/questionnaires#scoreAll`), `symptoms.redFlags[]`, `symptoms.otherTopicsToDiscuss`, `symptoms.privacyAcceptedAt`; `classification` = `consultationReasons` (chips del tablero) |
| ai | `symptoms.ai{status, summary, error, model, promptVersion, attempts, requestedAt, startedAt, generatedAt, generatedBy:'edge'|'client', inputHash}` + espejo `symptoms.aiSummary = ai.summary` (compat Historial/PDF/legacy) |
| history | `medical_history` (mismo shape + `person{}`) |
| events | `symptoms.events[] {type, by:{role, username}, at, meta?}` (append en cliente con read-merge-write) |
| cancelReason, cancelledAt | `symptoms.cancelReason`, `symptoms.cancelledAt` |
| research | `medical_notes.research[]` (ver 2.4) |

Mapper legacy (`data/mappers/encounterMapper.ts#fromRow`): si falta `symptoms.encounter` → `{kind:'first', source:'kiosk'}`; si falta `symptoms.ai` → `aiSummary` con texto útil ⇒ `{status:'done', generatedBy:'client', promptVersion:'legacy'}`; si empieza con "No se pudo generar"/"No se configuró" ⇒ `{status:'error'}`; sin `aiSummary` ⇒ `{status:'none'}`. `medical_notes.nextAppointment` string ⇒ `{date}`.

### 2.3 Appointment (cita) = `appointments`

| Campo | Columna / clave |
|---|---|
| id, patientName, patientPhone, doctorUsername, doctorName, startsAt, status, createdAt | `id`, `patient_name`, `patient_phone`, `doctor_username`, `doctor_name`, `appointment_date`, `status`, `created_at` |
| patientId | `patient_id` = id del primer encuentro de esa persona si existe; `null` si es paciente nuevo online (se llena en check-in) |
| meta | `symptoms` **repropósito** como `meta{source:'online'|'phone'|'reception'|'doctor'|'followup', kind:'first'|'followup', durationMin, reasons[], notes, patient{fullName,age,gender,email}?, prevEncounterId?, encounterId?, createdBy, checkedInAt?, confirmedAt?, cancelReason?, history[]}`. Se deja de escribir el formulario de síntomas y el `aiSummary` paralelo. |
| reasons | `classification` (array de `ConsultationReason`) |

### 2.4 ConsultationNote (NOM-004) = `patient_forms.medical_notes`

```
medical_notes = {
  vitalSigns, currentIllness, interrogation, physicalExam, diagnosis, prescription, recommendations,   // existentes (strings)
  vitals: { ta, fc, fr, temp, peso, talla },        // nuevo, se serializa también a vitalSigns
  nextAppointment: { appointmentId, date, doctorUsername } | string(legacy),
  doctorUsername, doctorName, startedAt, signedAt, updatedAt, version, draft: {…campos, savedAt} | null,
  dictationLog: [{ field, seconds, at }],
  addenda: [{ text, by, at }],
  research: [{ query, answer, citations[], template, at, by }],
  attachedFiles: [{ name, url, path, type, size, uploadedAt, uploadedBy, category:'lab'|'imagen'|'receta'|'otro' }]
}
```
Regla: `notes.repo.*` SIEMPRE hace `select medical_notes` fresco → merge → `update`. Hoy `saveConsultation` sobrescribe el objeto completo y borra `attachedFiles`.

### 2.5 Attachment
Bucket `patient_files` (existe, público). Path `{phone}/{encounterId}/{ts}-{rand}.{ext}`. Metadatos en `medical_notes.attachedFiles[]`. Historial agrupa por `phone`. MIGRACIÓN: tabla `attachments` + bucket privado + `createSignedUrl(path, 3600)`.

### 2.6 StaffUser / Session
`doctors(id, full_name, username, password PLAINTEXT)`. Rol: `reception` (PIN `ENV.receptionPin`), `doctor`, `admin` (`ENV.adminUsernames`). Sesión ya implementada en `src/services/session.ts` (`uf.session.v1`, 12 h). Se agrega `Role = 'reception'|'doctor'|'admin'` derivado (`isAdmin ? 'admin' : role`) y el tipo `'patient'` solo para `by` en eventos.

### 2.7 AvailabilityRule
`src/config/clinic.ts`: `{ timezone:'America/Mazatlan', workdays:[1,2,3,4,5,6], hours:{start:'12:00', end:'18:00'}, slotMinutes:30, noShowAfterMin:30, perDoctor:{}, blockedDates:[] }` (hoy `ENV.agendaStartHour=9/19` en env.ts y `availableHours` fijo en SchedulePage: se unifican en `clinic.ts`, con override por env). MIGRACIÓN: `availability_rules`, `availability_blocks`.

### 2.8 ResearchSession
Estado de componente (hilo multi-turno) + persistencia opcional en `medical_notes.research[]`. Sesiones libres en `localStorage['uf.research.recent']` (10). MIGRACIÓN: `research_sessions`.

### 2.9 SQL de migración (fase posterior, `supabase/migrations/0001_target_schema.sql`)

```sql
-- 1. Personas
create table patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null, birth_date date, gender text check (gender in ('Masculino','Femenino','Otro')),
  phone text not null, email text, referral_source text, referred_by text, preferred_doctor text,
  history jsonb not null default '{}', created_at timestamptz default now(), updated_at timestamptz default now()
);
create index on patients (phone);
create extension if not exists pg_trgm; create index on patients using gin (full_name gin_trgm_ops);

-- 2. Encuentros (patient_forms se renombra; backfill agrupa por phone)
alter table patient_forms rename to encounters;
alter table encounters
  add column patient_id uuid references patients(id),
  add column appointment_id uuid,
  add column kind text check (kind in ('first','followup')) default 'first',
  add column source text check (source in ('kiosk','checkin','reception','doctor','legacy')) default 'legacy',
  add column intake_mode text default 'tablet',
  add column kiosk_code text, add column checked_in_at timestamptz, add column started_at timestamptz,
  add column completed_at timestamptz, add column cancelled_at timestamptz, add column cancel_reason text,
  add column doctor_username text, add column prev_encounter_id uuid references encounters(id),
  add column ai_status text default 'none', add column ai_summary text, add column ai_error text, add column ai_generated_at timestamptz,
  add constraint encounters_status_chk check (status in ('arrived','waiting','in_consultation','completed','cancelled'));
create index on encounters (status, created_at);
create index on encounters (patient_id);
create unique index encounters_one_open_per_patient on encounters (patient_id)
  where status in ('arrived','waiting','in_consultation');

-- 3. Notas firmadas inmutables
create table consultation_notes (
  id uuid primary key default gen_random_uuid(), encounter_id uuid unique references encounters(id),
  doctor_id uuid references doctors(id), note jsonb not null, signed_at timestamptz, version int default 1,
  locked boolean default false, amends uuid references consultation_notes(id), created_at timestamptz default now()
);
create table note_addenda (id uuid primary key default gen_random_uuid(), note_id uuid references consultation_notes(id), text text, by_doctor uuid, created_at timestamptz default now());

-- 4. Citas
alter table appointments
  add column encounter_id uuid references encounters(id), add column duration_min int default 30,
  add column source text, add column kind text, add column notes text, add column checked_in_at timestamptz,
  add column cancel_reason text, add column prev_encounter_id uuid,
  add constraint appointments_status_chk check (status in ('scheduled','confirmed','arrived','completed','cancelled','no_show'));
create unique index appointments_no_double_booking on appointments (doctor_username, appointment_date)
  where status in ('scheduled','confirmed','arrived');
create index on appointments (doctor_username, appointment_date);
create or replace function check_in(p_appointment_id uuid) returns uuid language plpgsql security definer as $$ /* crea encuentro + marca cita en una transacción */ $$;

-- 5. Archivos e investigación
create table attachments (id uuid primary key default gen_random_uuid(), encounter_id uuid references encounters(id), patient_id uuid references patients(id), storage_path text not null, name text, mime text, size int, category text, uploaded_by text, created_at timestamptz default now());
update storage.buckets set public = false where id = 'patient_files';
create table research_sessions (id uuid primary key default gen_random_uuid(), encounter_id uuid, doctor_id uuid, question text, answer text, citations jsonb, created_at timestamptz default now());

-- 6. Personal y auth
alter table doctors add column role text check (role in ('doctor','admin','reception')) default 'doctor', add column active boolean default true, add column password_hash text, add column cedula text;
-- después de migrar a Supabase Auth: alter table doctors drop column password;
create table availability_rules (id uuid primary key default gen_random_uuid(), doctor_username text, weekdays int[], start_time time, end_time time, slot_minutes int default 30);
create table availability_blocks (id uuid primary key default gen_random_uuid(), doctor_username text, starts_at timestamptz, ends_at timestamptz, reason text);

-- 7. Auditoría + realtime
create table audit_log (id bigserial primary key, table_name text, row_id uuid, event text, by_role text, by_user text, at timestamptz default now(), meta jsonb);
alter publication supabase_realtime add table encounters, appointments;

-- 8. RLS (ver §7)
alter table patients enable row level security; alter table encounters enable row level security;
alter table appointments enable row level security; alter table consultation_notes enable row level security;
alter table doctors enable row level security; alter table attachments enable row level security;
```

---

## 3. Roles y permisos

| Acción | paciente / kiosko | recepción | doctor | admin |
|---|:-:|:-:|:-:|:-:|
| Crear encuentro propio (kiosko), completar wizard, `arrived→waiting` | ✔ | — | — | — |
| Buscar expediente recurrente (respuesta enmascarada `Juan P.`, `***4498`) | ✔ | ✔ | ✔ | ✔ |
| Agendar cita online (solo slots libres, sin nombres) | ✔ | ✔ | ✔ | ✔ |
| Ver Sala de Espera (nombre, edad, motivos, estado, **solo conteo** de banderas rojas, chip IA) | — | ✔ | ✔ | ✔ |
| Ver texto del resumen IA, scores, respuestas, antecedentes | — | — | ✔ | ✔ |
| Registro rápido (walk-in / teléfono), editar contacto | — | ✔ | ✔ | ✔ |
| Check-in "Llegó", "Sin tablet", "Reaplicar cuestionario", "Se retiró", no-show | — | ✔ | ✔ | ✔ |
| Agenda: crear / reagendar / cancelar / confirmar, todos los doctores | — | ✔ | ✔ (propia; otras solo lectura) | ✔ |
| Reintentar IA | — | ✔ | ✔ | ✔ |
| "Atender" (`→in_consultation`), "Devolver a sala" | — | — | ✔ | ✔ |
| Escribir/firmar nota NOM-004, dictado, próxima cita | — | — | ✔ (propias) | ✔ |
| Editar nota 24 h / adenda | — | — | ✔ (propia) | ✔ |
| Subir/ver archivos clínicos | — | ✔ subir no clínicos (INE, seguro) | ✔ | ✔ |
| Exportar PDF | — | — | ✔ | ✔ |
| Perplexity (libre y por caso), guardar en expediente | — | — | ✔ | ✔ |
| Historial completo (Pacientes) | — | — | ✔ | ✔ |
| Registrar/desactivar doctores, reset contraseña | — | — | — | ✔ |
| Reactivar `cancelled`, ver `events[]`, panel Salud IA, editar disponibilidad | — | — | — | ✔ |
| Borrar filas / "Limpiar registros" | ✗ | ✗ | ✗ | ✗ (no existe en UI) |

`config/roles.ts`: `PERMISSIONS: Record<Role, Action[]>` + `can(session, action)`. `RequireRole` en rutas y `can()` en botones. **Honestidad:** con anon key y sin RLS todo esto es de cliente (ver §7).

---

## 4. Flujos paso a paso

### 4.1 Kiosko — paciente NUEVO

1. Tablet en `/kiosk` (`KioskLayout`: pantalla completa, sin nav; "Salir" pide PIN de recepción; idle 90 s en cualquier paso → "¿Continuar?" → vuelve al inicio dejando el draft). Botones: **Soy paciente nuevo** · **Ya he venido antes** · **Tengo un código**.
2. Paso `basic`: nombre, fecha de nacimiento (edad auto), sexo (incl. Otro), teléfono (normalizado 10 dígitos), email **opcional**, ¿cómo se enteró?, doctor de preferencia (`staff.repo.listDoctors`). Al salir: `patients.repo.findByPhone(phone)` → si hay match: banner "Parece que ya tiene expediente, ¿es usted Juan P.?" → Sí = flujo 4.2 paso 3; No = continúa (marca `symptoms.encounter.phoneCollision=true` para recepción).
3. Primer "Siguiente" desde `basic`: `encounters.repo.create({status:'arrived', encounter:{kind:'first', source:'kiosk'}, personalData, wizard:{stepIdx:1}})` (invariante D8 aplicado). `sessionStorage['uf.kiosk.draft']={encounterId, formData}`. Cada paso siguiente: `encounters.repo.saveDraft(id, {rawSymptoms, wizard.stepIdx})` debounce 1.5 s. Si la tablet se cierra, al reabrir `/kiosk` aparece "Continuar registro de Juan P.".
4. Wizard ramificado: `domain/intakeBranching.ts#computeActiveSteps(formData)` (extraído del `useMemo` de FormPage) → `reason` → ramas próstata/vejiga/sexual/riñón con `QuestionnaireStep` genérico alimentado por `domain/questionnaires/QUESTIONNAIRES[id]` → `general_history` → `closing`. Progreso real (paso/total + nombre de sección).
5. `closing`: otros temas + checkbox aviso de privacidad (`privacyAcceptedAt` obligatorio). "Finalizar" (botón se deshabilita al primer tap).
6. `encounters.repo.submitIntake(id, payload)`: `scoreAll(activeQuestionnaires, answers)` + `extractRedFlags` en cliente; UN update con filtro `.eq('status','arrived')` → `status='waiting'`, `symptoms{…}`, `classification`, `medical_history`, `ai={status:'pending',attempts:0,requestedAt,inputHash}`. Persistido en <1 s.
7. Pantalla "¡Listo, tome asiento!" 5 s → borra `sessionStorage` → inicio del kiosko. En paralelo `summary.service.ensure(id)` fire-and-forget (§5.6). Si la tablet vuelve al inicio antes de terminar, el watchdog del escritorio completa el trabajo.
8. Sala de Espera del panel recibe el cambio por realtime/polling; chip "IA generando…" → "Resumen listo" sin refrescar.

### 4.2 Kiosko — paciente RECURRENTE

1. "Ya he venido antes": teléfono (teclado numérico) + primer nombre (+ año de nacimiento si existe en `medical_history.person.birthDate`; para las filas legacy sin él, nombre+teléfono como hoy). `patients.repo.findReturning({phone, firstName, birthYear?})` devuelve **máximo** `{personId, maskedName, lastVisit, medical_history, preferredDoctor}` (MIGRACIÓN: RPC `find_returning_patient`).
2. 0 → "No encontramos su expediente; regístrese como nuevo" (nunca revela si el teléfono existe con otro nombre). N>1 → lista enmascarada, el paciente toca la suya.
3. Confirmación "Bienvenido de nuevo, Juan P. Última visita 12 mar 2026. ¿Sus datos siguen igual?" (teléfono/email editables). `encounters.repo.findOpenForPhone(phone)`: si hay `arrived` de hoy (recepción ya hizo check-in) → lo reclama; si `waiting/in_consultation` → "Ya está registrado en sala, tome asiento"; si no → `encounters.repo.createFollowup(prevId)` inserta fila NUEVA con `personalData` y `medical_history` copiados, `encounter={kind:'followup', source:'kiosk', prevEncounterId}`, `status='arrived'`.
4. Wizard corto: `reason` (pre-marca motivos de la última visita) → ramas → `history_confirm` ("¿Sigue igual? Sí / Actualizar" con chips editables de medicamentos, alergias, cirugías, condiciones) → `closing`. Datos básicos omitidos salvo "Corregir mis datos".
5. `submitIntake` igual que 4.1. En el cockpit, pestaña "Visitas previas" muestra evolución de scores (`encounters.repo.listByPhone`) y la última nota en solo lectura.

### 4.3 Kiosko — "Tengo un código"

`encounters.repo.findByKioskCode(code)` = `symptoms->encounter->>kioskCode = code and status='arrived' and created_at >= startOfTodayMazatlan()` → "Hola, Juan P. ¿Es usted?" → abre el wizard en ese encuentro (modo nuevo o recurrente según `encounter.kind`). El código deja de ser válido al salir de `arrived`.

### 4.4 Recepción / Doctor — "Registrar nuevo paciente" (`features/registration/RegisterPatientDialog.tsx`, prop `mode`)

1. Atajo `N` + botón primario en ambos paneles. Objetivo <30 s, una pantalla.
2. Campo 1 = **teléfono** (autofocus, numérico). A los 10 dígitos `usePatientLookup` → "Ya existe: Juan Pérez, 3 visitas, última 12 mar" → "Usar expediente" (prellena todo) o "Es otra persona" (mismo teléfono permitido, advertencia). Nuevo: nombre (≥2 palabras), sexo (2 toggles grandes + Otro), fecha de nacimiento **o** edad, email opcional, referencia (colapsado).
3. Motivo: chips `ConsultationReason` (opcional; el kiosko los pre-marca). Doctor asignado (recepción elige; doctor se auto-asigna).
4. Segmented control **¿Cómo llega?**
   - **Está aquí (walk-in)** → `encounters.repo.create({status:'arrived', encounter:{kind (según lookup), source:'reception'|'doctor', kioskCode}})` → tarjeta `KioskCodeCard` con el código de 4 dígitos en grande + "Abrir en esta tablet" (`/kiosk?encounter=id`) + "Sin tablet" (`skipIntake` → `waiting`, `intakeMode='skipped'`, `ai.status='skipped'`).
   - **Agendar cita (teléfono/mostrador)** → `SlotPicker` inline (`useAvailability(doctor, day)`) → `appointments.repo.create({status:'scheduled', meta:{source:'phone'|'reception', kind, reasons, patient{…} si es nuevo}})`. **No se crea encuentro.** Toast con "Copiar mensaje de confirmación" (`wa.me/52<phone>?text=…`: fecha, dirección, "llegue 10 min antes para el cuestionario en tablet").
   - **Solo registrar** → nada más (no hay fila; el teléfono queda en el portapapeles de la recepcionista para agendar después). Si se necesita expediente sin visita, usar "Agendar".
5. Modo doctor añade **"Registrar y atender ahora"**: crea `arrived` → `in_consultation` en un paso (`intakeMode='staff_entered'`) y abre `/consulta/:id`. Desde el cockpit "Mandar a tablet" regresa a `arrived` conservando `doctorUsername`.
6. Toda creación escribe `events[] += {type:'registered', by, meta:{mode}}`.

### 4.5 Agenda

1. **Disponibilidad**: `domain/agenda.ts#getSlots(doctor, dayISO, appointments, CLINIC)` → `AgendaSlot[] {start, end, state:'free'|'booked'|'blocked'|'past', appointmentId?}`. Ocupado = cita con status in `('scheduled','confirmed','arrived')`. Pasado = `< now + 15 min`. Fechas con `lib/dates.ts#toClinicISO(day,'HH:mm')` (offset fijo -07:00) y `formatClinic(iso)` con `Intl.DateTimeFormat('es-MX',{timeZone:'America/Mazatlan'})`. Un solo `SlotPicker` para /schedule, recepción y "Próxima cita".
2. **Crear** (`appointments.repo.create`): re-lee el slot justo antes del insert; si está tomado → `SlotTakenError` y la UI refresca slots. El público solo consulta `.select('appointment_date,status')` del doctor/día (sin nombres).
3. **/schedule público** (`features/booking`): Tipo (nuevo/recurrente) → Datos o búsqueda enmascarada → Doctor + slot → Motivo (chips; **se elimina** el cuestionario de 11 checkboxes y la llamada a OpenAI) → Confirmar. Crea SOLO `appointments` (`source:'online'`, `meta.patient{}` si es nuevo, `patient_id` si recurrente). Confirmación con `.ics` (`services/ics/buildIcs.ts`) y botón WhatsApp del consultorio.
4. **Reagendar**: `appointments.repo.reschedule(id, newStart, by)` in-place + `meta.history[]`. **Cancelar**: `cancel(id, reason, by)`. **Confirmar**: `confirm(id)`. **No-show**: `useAgenda` marca ámbar `scheduled` con `appointment_date + 30 min < now`; "No llegó" → `markNoShow`.
5. **Check-in "Llegó"** (`services/agenda/agendaService.checkIn(appointmentId)`): (1) `appointments.repo.get` → (2) idempotencia: si `meta.encounterId` existe y ese encuentro sigue abierto, reusar; si no, `encounters.repo.create({status:'arrived', encounter:{kind: patient_id ? 'followup':'first', source:'checkin', appointmentId, prevEncounterId: último completed por phone, kioskCode}, personalData: del último encuentro o de `meta.patient`, medical_history copiada})` → (3) `appointments.repo.update(id, {status:'arrived', meta.checkedInAt, meta.encounterId})`. Dos escrituras sin transacción: si (3) falla se reintenta una vez y se avisa (MIGRACIÓN: RPC `check_in`). Muestra `KioskCodeCard` con "Abrir en tablet" / "Sin tablet".
6. **Vistas** (`features/agenda/AgendaPage.tsx`): Día (columnas por doctor: admin/recepción todas, doctor la suya con toggle) y Semana (lista). `AppointmentCard` con color por estado, origen (online/teléfono/seguimiento), y `actionsFor` por rol. `AppointmentDrawer` con acciones. Lista "Próximos 7 días sin confirmar" con deep links de WhatsApp.
7. **Seguimiento**: creado por `signNote` con `meta:{source:'followup', kind:'followup', prevEncounterId}`; el encuentro `completed` muestra la etiqueta derivada "Seguimiento el 19 oct 12:30".

### 4.6 Doctor atiende — cockpit `/consulta/:encounterId`

1. "Atender" (Sala de Espera o Agenda) → `encounters.repo.startConsultation(id, session)`: `canTransition` + update con `.in('status',['waiting','arrived'])`; escribe `medical_notes.{doctorUsername, doctorName, startedAt}` y evento. Navega a `/consulta/:id` (ruta, no modal).
2. `ConsultationPage`: cabecera fija (nombre, edad/sexo, teléfono, doctor preferido, cronómetro, `AiStatusChip`, botones "Investigar caso" · "PDF" · "Devolver a sala" · "Guardar y cerrar"). Grid 5/7 en ≥1280 px; pestañas apiladas en tablet.
3. **IZQUIERDA `IntakePane`** pestañas: *Resumen* (`ai.summary` markdown; si `ai.status≠done` → `DeterministicNote` de `domain/summary/deterministicNote.ts` + chip/reintento) · *Alertas* (banderas rojas, siempre visibles arriba) · *Scores* (`ScoreBadge` 24/35 · Severo, barra, subscales, delta vs visita previa, "Ver respuestas" despliega `rawSymptoms`) · *Antecedentes* (`medical_history`, alergias y medicamentos destacados) · *Visitas previas* (timeline por `phone`, última nota solo lectura) · *Archivos* (`FilesPanel`, drag&drop, miniaturas).
4. **DERECHA `NotePane`** orden clínico: Signos vitales (`VitalsFields` TA/FC/FR/Temp/Peso/Talla → `vitals{}` + string), Padecimiento actual ("Traer del resumen IA" pega motivo+síntomas; el doctor edita), Interrogatorio, Exploración física, Diagnóstico, Receta (`PrescriptionTemplates` del doctor en localStorage), Recomendaciones, Próxima cita (`NextAppointmentPicker` = `SlotPicker` +30 días mismo doctor).
5. **Dictado**: `DictationButton` en **cada** textarea (hoy solo Receta). `useDictation` = MediaRecorder con `mimeType` detectado (`audio/webm;codecs=opus` → `audio/mp4` para iPad/Safari), un solo campo graba a la vez, contador de segundos, inserta en el cursor del campo activo, `dictationLog[] += {field, seconds, at}`. Atajo `Ctrl+Shift+M`. Transporte `transcribe.service` (Edge Function `transcribe` → Whisper `language:'es'`, prompt de vocabulario "urología, receta, mg, cada 12 horas"; fallback cliente en DEV).
6. **Autosave**: `useConsultationDraft(id)` → `localStorage['uf.note.<id>']` en cada cambio + `notes.repo.saveDraft` (`medical_notes.draft`) cada 10 s / al blur. Indicador "Guardado 12:41". Al reabrir se restaura.
7. **Archivos**: `files.repo.upload(phone, encounterId, file)` → `notes.repo.appendFile(id, meta)` (read-merge-write). Permitido en cualquier estado (los resultados llegan días después).
8. **"Guardar y cerrar"** → `validateNote(NOM004_REQUIRED)` (vitales, padecimiento, exploración, diagnóstico, receta) → `encounters.repo.signNote(id, note, followUpSlot?)`: `status='completed'` (CAS `.eq('status','in_consultation')`), `medical_notes.{…, signedAt, version:1, draft:null, nextAppointment}`, evento `consult_end`; `appointments.repo.complete(encounter.appointmentId)`; si hay slot → `appointments.repo.create(followup)`. Toast "Consulta cerrada · Próxima cita 19 oct 12:30" con botón PDF. Vuelve a Sala. **"Devolver a sala"** → `waiting` conservando draft.
9. **PDF**: `services/pdf/exportNote.ts` renderiza `components/print/NotePrint.tsx` (membrete, ficha de identificación, NOM-004 en orden, tabla de scores, resumen IA como anexo, "Referencias consultadas", archivos, firma + cédula) en contenedor oculto → html2pdf; `window.print()` con `print.css` como alternativa. Nunca se rasteriza la tarjeta en pantalla. "Exportar expediente completo" concatena todos los `completed` por `phone`.
10. **Edición posterior**: desde Historial, mismo doctor 24 h → `version++`, evento `note_edited`; después "Agregar adenda" (`addenda[]`).

### 4.7 Sala de Espera (`features/waitingRoom`)

Query `encounters.repo.listToday()` = `status in ('arrived','waiting','in_consultation') and created_at >= startOfTodayMazatlan() order by created_at asc` (llegó antes, pasa antes; hoy es desc). Al montar, `sweepAbandoned()` (admin/recepción) cancela encuentros abiertos de días anteriores. Columnas: **Llenando cuestionario** (`arrived`, con % `wizard.stepIdx/total`) · **Listos para pasar** (`waiting`, banderas rojas primero, luego por llegada) · **En consulta** (con doctor). Tarjeta: nombre, edad/sexo, motivos, tiempo de espera vivo, `AiStatusChip`, conteo de banderas (texto completo solo doctor), `intakeMode`, y los botones de `actionsFor(encounter, session)`. Contador en título de pestaña "(3) Sala de espera".

---

## 5. Pipelines de IA

### 5.1 Contrato
`symptoms.ai` es lo único que la UI lee. `none → pending → generating → done | error | skipped`.

### 5.2 Pipeline resumen preconsulta (`services/ai/summary.service.ts`)

1. **Disparo**: `submitIntake` deja `ai={status:'pending', attempts:0, requestedAt, inputHash: sha1(deidentifiedInput)}` y llama `ensure(id)` sin await de UI. También: "Reintentar" (recepción/doctor, `force:true`), watchdog `useWaitingRoom` cada 30 s (pending >20 s o error con `attempts<3`, **solo encuentros de las últimas 24 h**), y `inputHash` distinto al actual → chip "Resumen desactualizado · Regenerar".
2. **Claim** (`encounters.repo.claimAi(id)`): `update symptoms.ai={status:'generating', startedAt, attempts+1}` con filtro `.eq('id',id).or('symptoms->ai->>status.in.(pending,error),and(symptoms->ai->>status.eq.generating,symptoms->ai->>startedAt.lt.<now-90s>)')`. 0 filas afectadas ⇒ otro cliente lo tiene ⇒ return.
3. **Entrada**: `domain/deidentify.ts#buildAiInput(encounter)` — quita fullName, phone, email, birthDate, referredByDoctor; conserva edad, sexo, `kind`, motivos, síntomas, scores con interpretación (autoritativos, el prompt dice no recalcular), banderas, antecedentes, otros temas. Revisa campos libres (otherTopics, surgeries) con regex de teléfono/email antes de enviar.
4. **Proveedor primario**: Edge Function `generate-summary` (`supabase/functions/generate-summary/index.ts`, Deno): recibe `{encounterId}`, lee la fila con service role, desidentifica en servidor, `gpt-4o-mini` (`temperature 0.2`, `max_tokens 1200`, 3 reintentos backoff en 429/5xx, timeout 45 s), escribe `ai` ella misma. Idempotente por `inputHash`. Prompt en `services/ai/prompts/summaryPrompt.ts` (`promptVersion:'2026-09'`), importado también por `supabase/functions/_shared/prompt.ts`. Cabecera `x-uf-key: ENV.functionsKey` como guardia mínima hasta Auth.
5. **Fallback**: si `ENV.aiProxyUrl` está vacío y `ENV.isDev && ENV.openaiKey` → `providers/openaiClient.ts` (código actual de `utils/ai.ts`) y `finishAi({generatedBy:'client'})`. En producción sin función: `ai.status='error'`, `error:'proxy no configurado'`; el doctor ve la `DeterministicNote`.
6. **Fin**: `encounters.repo.finishAi(id, {status:'done', summary, model, promptVersion, generatedAt, generatedBy, inputHash})` + espejo `aiSummary`. Error → `{status:'error', error:<corto>}` sin tocar `aiSummary`. Evento `ai_done|ai_error` con duración.
7. **Superficie**: `AiStatusChip` (pending / generating spinner+segundos / done / error+Reintentar / skipped "Sin cuestionario"). Recepción solo ve el chip. Render "Nota v2026-09 · gpt-4o-mini · 12:41 (edge)".

### 5.3 Whisper — `services/ai/transcribe.service.ts`
Misma forma: Edge Function `transcribe` (multipart → `/audio/transcriptions`, `whisper-1`, `language:'es'`) con fallback DEV. Límite 25 MB; grabaciones >4 min se cortan en trozos.

### 5.4 Perplexity — `services/research/perplexity.service.ts`

1. **Entradas**: `ResearchDrawer` en el cockpit ("Investigar caso") y `ResearchPage` en la pestaña Investigación. Solo doctor/admin (`RequireRole`).
2. **Semilla**: `domain/deidentify.ts#buildCaseContext(encounter, noteDraft?)` → 4–6 líneas sin PII: "Varón de 62 años, primera vez. Motivos: próstata, vejiga. IPSS 24/35 (severo), QoL 5/6. Banderas: hematuria visible. Antecedentes: DM2, HTA; tamsulosina; alergia a penicilina. Dx de trabajo: HPB con LUTS severos." Caja editable + `suggestedQuestions(encounter)` por bandera/score.
3. **Chips** (`services/research/templates.ts`): Guías AUA/EAU para este caso · Diagnóstico diferencial · Estudios iniciales · Tratamiento de primera línea · Interacciones con sus medicamentos · Criterios de urgencia/referencia · texto libre.
4. **Petición**: `research({question, caseContext?, history?, onToken?})` → Edge Function `research` (secret `PERPLEXITY_API_KEY`, reenvía SSE) o fallback DEV. Body: `model: ENV.perplexityModel ('sonar-pro')`, `messages: [system, {role:'user', content:'CONTEXTO DEL CASO (anonimizado): …'}?, ...history, {role:'user', content: question}]`, `return_citations:true`, `search_domain_filter:['auanet.org','uroweb.org','ics.org','pubmed.ncbi.nlm.nih.gov','nice.org.uk']` (toggle "Solo guías y PubMed"; verificar límite del tier), `search_recency_filter` opcional, `stream:true`. System: experto en urología; prioriza AUA → EAU → ICS → NICE; nombra guía y año; citas numeradas `[n]`; marca discrepancias AUA/EAU y evidencia baja; español; sin identificadores.
5. **Respuesta**: `choices[0].message.content` + `citations[]` (+ `search_results[]{title,url,date}` cuando venga) → `services/research/citations.ts#linkify` reescribe `[n]` → `[n](url)` antes de `ReactMarkdown`; `CitationList` al pie (dominio/título/fecha/abrir).
6. **Acciones**: "Insertar en Recomendaciones" (párrafo + URLs con sufijo "(fuente: …)"), "Guardar en expediente" (`notes.repo.appendResearch` → PDF "Referencias consultadas"), "Copiar", "Preguntar más" (hilo). Sesiones libres → `localStorage['uf.research.recent']`.
7. **Errores**: 401/402 "Llave inválida o sin crédito"; 429 backoff 2 s ×3; timeout 60 s con reintento; la pregunta nunca se pierde. Rate limit cliente 20/min. Pie fijo: "Apoyo bibliográfico; la decisión clínica es del médico".

---

## 6. Estructura de carpetas `src/`

```
src/
├─ main.tsx
├─ app/
│  ├─ App.tsx                    — providers (SessionProvider, ToastProvider, RealtimeProvider) + RouterProvider
│  ├─ router.tsx                 — '/', '/kiosk', '/kiosk/intake/:encounterId', '/schedule', '/login',
│  │                               '/panel' (StaffLayout) → 'sala' | 'agenda' | 'pacientes' | 'pacientes/:phone' | 'investigacion' | 'admin',
│  │                               '/consulta/:encounterId'
│  ├─ guards/RequireRole.tsx, RequireKiosk.tsx
│  └─ layouts/StaffLayout.tsx, KioskLayout.tsx
├─ config/
│  ├─ clinic.ts                  — CLINIC {timezone, workdays, hours, slotMinutes, noShowAfterMin, perDoctor, blockedDates, whatsapp}
│  └─ roles.ts                   — Role, Action, PERMISSIONS, can()
├─ services/env.ts (existe), services/session.ts (existe)
├─ domain/                       — TypeScript puro, sin React ni supabase
│  ├─ types/patient.ts, encounter.ts, intake.ts, note.ts, appointment.ts, staff.ts, ai.ts, research.ts, index.ts
│  ├─ status.ts                  — EncounterStatus, AppointmentStatus, OPEN_STATUSES, ENCOUNTER_TRANSITIONS, APPOINTMENT_TRANSITIONS, canTransition, actionsFor, selectEncounterLabel
│  ├─ questionnaires/ (existe)   — + QuestionnaireStep lo consume; scoreAll ya calcula max/severity/subscales
│  ├─ intake/ (existe: catalog.ts, redFlags.ts) + branching.ts (computeActiveSteps), formModel.ts (initialFormData, toEncounterPayload)
│  ├─ summary/deterministicNote.ts
│  ├─ agenda.ts                  — AgendaSlot, getSlots, isSlotFree, suggestNoShows
│  ├─ deidentify.ts              — stripPII, buildAiInput, buildCaseContext, suggestedQuestions
│  └─ note.ts                    — NOM004_REQUIRED, validateNote, serializeVitals
├─ data/
│  ├─ supabase/client.ts         — (movido de store/supabase.ts)
│  ├─ mappers/encounterMapper.ts, appointmentMapper.ts, staffMapper.ts
│  ├─ repositories/
│  │  ├─ encounters.repo.ts      — create, createFollowup, saveDraft, submitIntake, skipIntake, findByKioskCode, findOpenForPhone, listToday, listByPhone, listHistory, transition, startConsultation, returnToRoom, signNote, claimAi, finishAi, appendEvent, cancel, sweepAbandoned
│  │  ├─ patients.repo.ts        — findByPhone, findReturning, search, listPersons
│  │  ├─ appointments.repo.ts    — create, get, listByDoctorAndDay, listRange, reschedule, confirm, cancel, checkIn, complete, markNoShow
│  │  ├─ notes.repo.ts           — saveDraft, sign, appendFile, appendResearch, addAddendum (todos read-merge-write)
│  │  ├─ staff.repo.ts           — listDoctors, authenticate, registerDoctor, deactivate
│  │  └─ files.repo.ts           — upload, publicUrl (→ signedUrl en migración)
│  ├─ realtime/useLiveTable.ts   — canal postgres_changes + fallback polling
│  └─ errors.ts                  — AppError, TransitionRejected, SlotTakenError, DuplicateOpenEncounter
├─ services/
│  ├─ ai/invoke.ts (functions.invoke + regla de fallback), summary.service.ts, transcribe.service.ts, prompts/summaryPrompt.ts, providers/openaiClient.ts
│  ├─ research/perplexity.service.ts, templates.ts, citations.ts
│  ├─ agenda/agendaService.ts    — checkIn (orquestación), whatsappLink, confirmationText
│  ├─ pdf/exportNote.ts, ics/buildIcs.ts
├─ hooks/useWaitingRoom.ts (live + sweep + watchdog IA), useAgenda.ts, useAvailability.ts, useEncounter.ts, useEncounterTransition.ts (optimista), usePatientLookup.ts, useIntakeWizard.ts, useIntakeAutosave.ts, useConsultationDraft.ts, useDictation.ts, useSummaryJob.ts, useInterval.ts, useVisibility.ts, useHotkey.ts, useDebounce.ts
├─ lib/dates.ts (America/Mazatlan: startOfToday, toClinicISO, formatClinic), phone.ts (normalizeMx, mask), ids.ts (uuid, kioskCode), markdown.ts
├─ features/
│  ├─ landing/LandingPage.tsx
│  ├─ kiosk/KioskHome.tsx, KioskPage.tsx, CodeEntry.tsx, ReturningLookup.tsx, IntakeDone.tsx, steps/{BasicDataStep, ReasonStep, SymptomChecklistStep, QuestionnaireStep, GeneralHistoryStep, HistoryConfirmStep, ClosingStep}.tsx
│  ├─ booking/SchedulePage.tsx, BookingWizard.tsx, IdentifyOrRegister.tsx, BookingDone.tsx
│  ├─ auth/LoginPage.tsx
│  ├─ waitingRoom/WaitingRoomPage.tsx, WaitingCard.tsx, AiStatusChip.tsx, RedFlagList.tsx
│  ├─ registration/RegisterPatientDialog.tsx, KioskCodeCard.tsx
│  ├─ agenda/AgendaPage.tsx, DayView.tsx, WeekView.tsx, AppointmentCard.tsx, AppointmentDrawer.tsx, SlotPicker.tsx, UnconfirmedList.tsx
│  ├─ consultation/ConsultationPage.tsx, ConsultationHeader.tsx, panes/IntakePane.tsx, panes/NotePane.tsx, ScoreBadge.tsx, ScoreDetails.tsx, DeterministicNoteView.tsx, VitalsFields.tsx, DictationButton.tsx, NextAppointmentPicker.tsx, FilesPanel.tsx, PrescriptionTemplates.tsx, ResearchDrawer.tsx
│  ├─ research/ResearchPage.tsx, ResearchChat.tsx, CaseContextBox.tsx, PromptChips.tsx, CitationList.tsx
│  ├─ history/PatientsPage.tsx, PatientTimeline.tsx, EncounterDetail.tsx, NoteReadOnly.tsx
│  └─ admin/AdminPage.tsx, DoctorsAdmin.tsx, AiHealthPanel.tsx
├─ components/ui/Button, Card, Badge, StatusPill, Chip, Tabs, Drawer, Modal, Field, TextArea, Select, Toast, Skeleton, EmptyState, Stepper, ProgressBar, Kbd
├─ components/print/NotePrint.tsx, PrintLayout.tsx
└─ styles/tokens.css, base.css, components.css, animations.css, print.css
supabase/functions/generate-summary/, transcribe/, research/, _shared/{prompt.ts, deidentify.ts, cors.ts, openai.ts}
supabase/migrations/0001_target_schema.sql  (no aplicada)
```
Se eliminan: `src/store/MockDB.ts` (ya `D`), `src/store/db.ts` (fachada temporal sobre repos durante la transición, luego borrado), `src/utils/ai.ts` → `services/ai/providers`, `src/utils/questionnaires.ts` → `domain`, `src/types/index.ts` → `domain/types`, `src/App.css` (ya `D`), `test*.js` (ya `D`), `.env` del control de versiones (ya `D`).

---

## 7. Estrategia de tiempo real

- `data/realtime/useLiveTable(table, onChange)`: `supabase.channel('uf-'+table).on('postgres_changes', {event:'*', schema:'public', table}, () => debouncedRefetch()).subscribe(status => setLive(status==='SUBSCRIBED'))`. El handler **refetch**ea (no aplica `payload.new`): más simple y consistente con envelopes jsonb.
- Requiere activar Replication para `patient_forms` y `appointments` en el dashboard (toggle, no esquema). Si no llega `SUBSCRIBED` en 5 s o cae a `CHANNEL_ERROR` → polling cada 10 s mientras `document.visibilityState==='visible'`; refetch inmediato en `visibilitychange`, `focus`, `online`. Con realtime activo el polling baja a 60 s como red de seguridad.
- Indicador honesto en la cabecera: "En vivo" / "Actualizado hace 8 s". Botón "Actualizar" queda como respaldo. Se elimina el listener de `storage`.
- Consumidores: `useWaitingRoom` (patient_forms), `useAgenda` (appointments), tablet lobby (`patient_forms` filtrado cliente a `arrived` de hoy, para auto-abrir cuando recepción pulsa "Abrir en tablet": `encounter.handoffAt` en los últimos 2 min → gate "confirme los últimos 4 dígitos de su teléfono"). El kiosko en wizard NO se suscribe (privacidad).
- Transiciones optimistas (`useEncounterTransition`): aplica localmente → repo con CAS → `TransitionRejected` revierte + toast + refetch.

---

## 8. Seguridad

### 8.1 Mínimo viable HOY (localhost, sin SQL)
1. **Rotar** las llaves de OpenAI, Perplexity, Gemini (test.js) y el anon key de Supabase. `.env` y `test*.js` ya están marcados para borrado; confirmar `.gitignore` incluye `.env*` menos `.env.example`; considerar `git filter-repo` antes de cualquier push si el repo fue público.
2. PIN de recepción y admins solo desde `ENV` (ya en `env.ts`); eliminar el literal `'<PIN>'` de `LoginPage`.
3. Sesión única `uf.session.v1` con expiración (existe). `RequireRole` en rutas; `can()` en botones.
4. Kiosko: `KioskLayout` a pantalla completa, salida con PIN, idle timeout, limpieza de `sessionStorage` al terminar, nunca listas de pacientes (solo código o búsqueda enmascarada), respuestas de búsqueda enmascaradas.
5. Desidentificación antes de cualquier llamada a IA. `getDoctors` sigue sin devolver `password`.
6. Fallback cliente de IA **solo** `ENV.isDev && !ENV.aiProxyUrl`; en build de producción `aiAvailable.*` = false sin proxy.
7. Se retira `clearForms`; ninguna ruta de borrado en UI.
8. Paths de storage no adivinables (`{phone}/{encounterId}/{ts}-{rand}`).
9. Edge Functions con cabecera `x-uf-key` como guardia mínima de abuso (mientras no hay Auth).

**Limitación honesta:** con anon key sin RLS, cualquiera con la URL lee/escribe `patient_forms`, `appointments` y `doctors.password`. Los roles son de cliente. No promocionar públicamente antes de 8.2.

### 8.2 Propio (MIGRACIÓN)
- Supabase Auth para doctores/recepción; `doctors.role` + `password_hash` (o `profiles`); eliminar `password` en claro; cédula profesional en `doctors.cedula`.
- RLS: anon solo `INSERT` en `encounters`/`appointments` con columnas limitadas y `UPDATE` de su propio encuentro vía RPC `kiosk_submit_intake(encounter_id, kiosk_code, payload)` SECURITY DEFINER; `find_returning_patient` devuelve enmascarado; recepción lee `waiting_board` (vista sin `ai`, `medical_notes`, `rawSymptoms`); doctores leen/escriben sus notas; admin todo.
- Bucket `patient_files` privado + políticas + `createSignedUrl`.
- `consultation_notes.locked` con trigger que rechaza updates; adendas en tabla propia (NOM-004 trazabilidad).
- `audit_log` por trigger sustituye `symptoms.events[]`.
- Secrets `OPENAI_API_KEY`, `PERPLEXITY_API_KEY` solo en `supabase secrets`; borrar `VITE_OPENAI_API_KEY`/`VITE_PERPLEXITY_API_KEY` del `.env` y del bundle.
- Índices únicos parciales (una visita abierta por paciente; sin doble reserva) y RPC `check_in` transaccional.

---

## 9. Fases de implementación (localhost, sin push, sin escrituras a DB hasta fase 2)

| Fase | Entregable | Criterios de aceptación |
|---|---|---|
| **0. Higiene** (½ día) | Llaves rotadas; `.env`/`test*.js` fuera del índice; `.gitignore`; PIN literal fuera de `LoginPage`; `ENV`/`session` ya existentes cableados en Login/Dashboard. | `git ls-files` no lista `.env` ni `test*.js`; `grep -r <PIN> src` vacío; login recepción/doctor funciona con `VITE_RECEPTION_PIN`; refresh conserva sesión; expira a 12 h. |
| **1. Dominio + datos** (2 días) | `domain/status.ts`, `domain/types`, `domain/intake/branching.ts`, `domain/deidentify.ts`, `domain/agenda.ts`, `domain/summary/deterministicNote.ts`, `lib/{dates,phone,ids}.ts`, mappers tolerantes, repos `encounters/patients/appointments/notes/staff/files`, `data/errors.ts`. `db.ts` pasa a fachada sobre repos. | Tests unitarios (vitest) de `canTransition`, `computeActiveSteps` (paridad con `FormPage.activeSteps` en 6 combinaciones), `scoreAll`, `getSlots`, `stripPII` (ningún campo PII en salida), `encounterMapper.fromRow` con las 10 filas legacy (fixture JSON) sin `undefined` en UI; `startOfToday()` correcto a las 23:30 UTC. Todo compila; las pantallas actuales siguen funcionando vía fachada. |
| **2. Kiosko save-first** (2 días) | `/kiosk` + `KioskLayout`, `useIntakeWizard`, `useIntakeAutosave`, `QuestionnaireStep` genérico sobre `domain/questionnaires`, `submitIntake`, `ReturningLookup`, `CodeEntry`, `IntakeDone`; `summary.service.ensure` con claim CAS + fallback cliente DEV. `/form` redirige a `/kiosk`. | Finalizar persiste `waiting` en <1 s con la red de OpenAI cortada (DevTools offline para api.openai.com); reabrir la tablet a mitad restaura el paso; doble tap en Finalizar produce 1 fila; recurrente crea fila nueva y no toca la anterior (`created_at` intacto); `ai.status` pasa `pending→generating→done` y nunca guarda texto de error en `aiSummary`; email vacío aceptado; salida del kiosko pide PIN. |
| **3. Sala de Espera + Registro + Check-in** (2 días) | `StaffLayout` con tabs por rol, `WaitingRoomPage` (3 columnas, orden banderas→llegada, `AiStatusChip`, `actionsFor`), `RegisterPatientDialog` (walk-in/agendar/atender ahora), `KioskCodeCard`, `sweepAbandoned`, `useLiveTable` (realtime + polling), watchdog IA. Botón "Limpiar registros" eliminado. | Registro walk-in en <30 s con solo teléfono+nombre; teléfono duplicado advierte y no bloquea; código de 4 dígitos abre el encuentro en la tablet; "Sin tablet" deja `waiting` con chip "Sin cuestionario"; recepción no ve texto de resumen ni scores; el tablero refleja un cambio hecho desde otra pestaña en ≤10 s sin realtime y ≤2 s con realtime; encuentros de ayer aparecen `cancelled/abandonado` al abrir el panel; `neq('completed')` ya no existe en el código. |
| **4. Cockpit de consulta** (3 días) | `/consulta/:id`, `IntakePane` (6 pestañas, deltas de scores, `DeterministicNote`), `NotePane` (vitales, dictado por campo con mimeType, plantillas, autosave, `NextAppointmentPicker`), `FilesPanel`, `signNote`, `NotePrint` + `exportNote`, edición 24 h/adenda, `PatientsPage` con timeline por `phone`. | "Atender" desde dos pestañas a la vez: solo una gana (CAS) y la otra ve toast; F5 a mitad de nota restaura el borrador; firmar sin diagnóstico bloquea con mensaje; firmar crea la cita de seguimiento y marca la cita origen `completed`; subir archivo y luego firmar conserva el archivo (bug actual reproducido y corregido); dictado inserta en el campo activo en Chrome y Safari/iPad; PDF sale con fecha de nacimiento, tabla de scores y "Referencias consultadas"; nota firmada no editable por otro doctor. |
| **5. Agenda + /schedule** (2 días) | `AgendaPage` (Día/Semana), `SlotPicker` compartido, `appointments.repo` completo, `agendaService.checkIn`, no-show sugerido, WhatsApp/`.ics`, `/schedule` slim sin cuestionario ni OpenAI. | Booking online no crea fila en `patient_forms`; dos reservas simultáneas del mismo slot: la segunda recibe `SlotTakenError`; cita a las 13:00 se ve 13:00 en un navegador con TZ Europe/Madrid; "Llegó" crea el encuentro `arrived` con datos prellenados y muestra el código; check-in repetido no duplica; `+30 min` sin llegada muestra "No llegó?"; reagendar conserva historial en `meta.history`. |
| **6. Perplexity + Edge Functions** (2 días) | `ResearchDrawer`/`ResearchPage` con contexto desidentificado, chips, streaming, citas `[n]` enlazadas, guardar en expediente; Edge Functions `generate-summary`, `transcribe`, `research` en `supabase/functions/` (código listo, despliegue posterior); `invoke.ts` con regla de fallback. | `buildCaseContext` de un encuentro con nombre/teléfono no contiene ninguno de los dos (test); respuesta con 5 citas renderiza 5 enlaces; "Guardar en expediente" aparece en el PDF; con `VITE_AI_PROXY_URL` vacío en DEV usa llaves locales, con build de producción y sin proxy muestra "Función no configurada" y la `DeterministicNote`. |
| **7. Limpieza + migración preparada** (1 día) | Borrar `db.ts`, `utils/ai.ts`, `utils/questionnaires.ts`, `types/index.ts`, `pages/*` viejos; `supabase/migrations/0001_target_schema.sql` escrito (no aplicado); `docs/` con este documento; herramienta admin "Marcar legacy" que escribe `symptoms.encounter={source:'legacy'}` en las 10 filas (una sola vez, idempotente). | `tsc --noEmit` y `vite build` limpios; ningún import de `store/db`; las 10 filas legacy se ven en Historial con nota "Registro anterior a la versión 2"; `AiHealthPanel` cuenta pendientes/errores del día. |

Cada fase se prueba en `localhost` contra la base actual **solo en lectura** hasta que el usuario autorice escrituras (las fases 2–5 necesitan una base de pruebas o un branch de Supabase para validar inserts).

---

## 10. Riesgos y mitigaciones (consolidado)

| Riesgo | Mitigación HOY | Cierre en MIGRACIÓN |
|---|---|---|
| Llaves en historial de git | Rotar, `git rm --cached`, `.gitignore`, `filter-repo` antes de push | Secrets solo en Edge Functions |
| Sin RLS, anon key en bundle | UI por rol, enmascarado, sin borrados | Auth + RLS + vistas + RPCs |
| PII a OpenAI/Perplexity | `deidentify.ts` con test | Desidentificación en servidor |
| Tablet bloqueada por IA | Save-first + watchdog | Cola `ai_jobs` + cron |
| Recurrente pisa datos | Fila nueva por visita; `updateForm` borrado | FK `prev_encounter_id` |
| `neq('completed')` deja pasar estados nuevos | Listas explícitas en repos; reemplazo en el mismo commit | CHECK constraint |
| Doble reserva / doble encuentro | Re-check + CAS + invariante en repo | Índices únicos parciales |
| Read-modify-write jsonb (events, files, notes) | Select fresco antes de cada merge; 1 doctor + 1 recepción | Tablas propias + `audit_log` por trigger |
| Dos doctores sobre el mismo paciente | `in_consultation` + CAS + `version` check | Lock por RLS |
| Timezone | `lib/dates.ts` Mazatlán en construir/mostrar/"hoy" | `timestamptz` + índice |
| Realtime no activado | Polling 10 s con indicador honesto | Publicación en migración |
| html2pdf con CSS moderno | `NotePrint` dedicado sin glass/backdrop-filter | — |
| iPad MediaRecorder | Detección de mimeType | — |
| Modelos externos retirados | `ENV.openaiModel`/`ENV.perplexityModel` | Error legible desde Edge |
| Kiosko compartido | Idle timeout, limpieza de estado, salida con PIN, ruta de escape `/login` documentada | — |
| 10 filas legacy | Mapper tolerante; watchdog limitado a 24 h; herramienta "Marcar legacy" | Backfill a `patients`/`encounters` |