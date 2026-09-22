# Plan 1 — Lógica y flujos · Urología Funcional

**Fecha:** 19 de septiembre de 2026 · **Alcance:** kiosko del paciente, panel de recepción, panel del doctor, agenda, resumen IA, investigación (Perplexity), datos y seguridad.
**Modo de trabajo:** localhost, sin push, sin escrituras a la base de datos de producción hasta que el usuario lo autorice.
**Anexo con todo el detalle técnico:** [anexos/arquitectura-detallada.md](anexos/arquitectura-detallada.md) (máquina de estados, mapeo jsonb, SQL de migración, permisos, pipelines de IA, riesgos).

---

## 1. Resumen ejecutivo

La app funciona como demo pero no como herramienta de consultorio: el "paciente" y el "formulario" son la misma fila, el paciente recurrente no existe, las citas web aparecen en la sala de espera, recepción puede borrar toda la base con un clic, el doctor escribe la nota sin ver el resumen, la IA se genera antes de guardar (si OpenAI tarda, la tablet se cuelga), y las llaves de OpenAI/Perplexity están en el bundle del navegador **y en GitHub** (`wataart/Urologia-funcional`, commits `aec57e3`, `af5eb43`, `275d0b6`).

El plan reorganiza todo alrededor de una idea: **una fila de `patient_forms` es una VISITA** con un ciclo de vida claro (`arrived → waiting → in_consultation → completed`), el paciente se identifica por teléfono entre visitas, y cada rol (paciente, recepción, doctor, admin) solo ve las acciones que su estado permite. Todo se puede enviar hoy sin cambiar el esquema de Supabase (se usan las columnas jsonb existentes); la migración SQL queda escrita para después.

---

## 2. Diagnóstico (auditoría de 8 dimensiones + verificación)

Leyenda: 🔴 crítico · 🟠 alto · 🟡 medio · ⚪ bajo · ✅ corregido en esta sesión · 🔧 en curso · ⏳ pendiente · 👤 requiere acción del usuario

### 2.1 Seguridad y privacidad

| Sev | Dónde | Hallazgo | Corrección | Estado |
|---|---|---|---|---|
| 🔴 | `.env`, `test*.js` | Llaves de OpenAI, Perplexity y Gemini rastreadas en git y ya publicadas en GitHub. | Rotar las tres llaves y el anon key. `.env` sacado del índice, `.gitignore` con `.env*`, `test*.js` eliminados, `.env.example` creado. Antes de cualquier push: `git filter-repo --path .env --invert-paths` (y los test). | ✅ repo · 👤 rotar llaves y purgar historial |
| 🔴 | `FormPage`, `SchedulePage`, `PerplexityResearch` | Llaves `VITE_*` compiladas en el bundle; rutas públicas llaman a OpenAI/Perplexity con PII completa. | Capa `services/ai/*` con proxy (Edge Function `supabase/functions/ai-proxy`) y fallback directo **solo** en desarrollo; entrada desidentificada (`domain/deidentify.ts`). | ✅ código · 👤 desplegar función y poner `VITE_AI_PROXY_URL` |
| 🔴 | `db.ts` (sin RLS) | El anon key lee/escribe/borra `patient_forms`, `appointments`, `doctors` y el bucket. | Mínimo hoy: UI por rol, sin rutas de borrado, paths de storage no adivinables. Propio: Supabase Auth + RLS + vistas (SQL en anexo §2.9 y §8.2). | 🔧 UI · 👤 RLS |
| 🔴 | `LoginPage`, `DashboardPage` | Sesión = `localStorage.isAuthenticated`; sin guardas de ruta ni expiración; `/dashboard` accesible por URL desde la tablet. | `services/session.ts` (una llave, 12 h de expiración, `useSession`), `RequireRole` en rutas, kiosko a pantalla completa con salida por PIN. | ✅ sesión · 🔧 guardas |
| 🔴 | `db.ts:266`, `LoginPage` | Contraseñas de doctores en texto plano comparadas con `.eq()`; PIN `<PIN>` en el código. | PIN y admins desde `ENV` (`VITE_RECEPTION_PIN`, `VITE_ADMIN_USERNAMES`). Contraseñas: Supabase Auth en migración (no se puede corregir sin tocar la base). | ✅ PIN/admin · 👤 Auth |
| 🔴 | `DashboardPage:392` | "Limpiar Registros" borra TODA la tabla y lo ve recepción. | Se elimina. Reemplazo: `cancelled` con motivo + barrido automático de visitas abandonadas. | ✅ |
| 🟠 | `DashboardPage:130` | `handleLogout` deja `doctorUsername`; recepción hereda el panel admin. | `logout()` limpia todo (incluye llaves legacy). | ✅ |
| 🟡 | `ClosingStep`, `/schedule` | Consentimiento de privacidad no se persiste; `/schedule` no muestra aviso. | `intake.consentAcceptedAt`; aviso en booking. | 🔧 |
| 🟡 | `files.repo` | Bucket público con URLs permanentes en el PDF. | Paths `{visitId}/{ts}-{nombre}`; bucket privado + `createSignedUrl` en migración. | 🔧 paths · 👤 bucket |

### 2.2 Modelo de datos

| Sev | Dónde | Hallazgo | Corrección | Estado |
|---|---|---|---|---|
| 🔴 | `db.ts` | Paciente = formulario; no hay segunda visita, ni vínculo de archivos a la persona, ni consulta ligada a una cita. | Fila = visita; identidad por teléfono (`patientKey`); `kind: first/followup` + `prevVisitId`; `groupPatients()` arma el historial por persona. | ✅ dominio/datos |
| 🟡 | `db.ts` | `birthDate`, `isFirstTime`, `referralSource`, `referredByDoctor`, `otherReason` se capturan y nunca se guardan; se leen columnas inexistentes. | Sobre jsonb versionado `symptoms.version=2` con `personal`, `intake`, `ai`, `visit`; mapper tolerante lee las 10 filas legacy. | ✅ |
| 🟡 | `db.ts` | `medical_history` con dos formas incompatibles; scores/antecedentes guardados pero nunca mostrados. | `buildMedicalHistory` escribe forma plana (compat) + `v2`; el panel los muestra en la consulta. | ✅ datos · 🔧 UI |
| 🟡 | `db.ts:getForms` | `neq('completed')` deja pasar cualquier estado nuevo a la sala. | Listas explícitas de estados en cada consulta. | ✅ |
| ⚪ | `updateForm`, `MockDB` | Código huérfano; `updateForm` reescribe `created_at`. | Eliminados. | ✅ |

### 2.3 Kiosko (interrogatorio en tablet)

| Sev | Dónde | Hallazgo | Corrección | Estado |
|---|---|---|---|---|
| 🔴 | `FormPage:169`, `ai.ts` | La nota IA recibe los arreglos crudos con valores por defecto (no los puntajes), y el prompt se contradice ("Sin dato" vs omitir ALERTA): todas las notas reales empiezan con "ALERTA: Sin dato.". | `buildSummaryInput` envía puntajes ya interpretados, banderas rojas calculadas y datos limpios; prompt reescrito (system + user, ALERTA solo con banderas). | ✅ |
| 🟠 | `FormPage` | Respuestas por defecto sesgan puntajes (IIEF-5 = 5 "severa", FSFI-6 = 2 "positivo") y nada es obligatorio. | Cuestionarios declarativos (`domain/questionnaires`) con `null` por defecto, `unansweredItems()` y bloqueo de "Siguiente" hasta responder. | ✅ dominio · 🔧 UI |
| 🟠 | `LandingPage → /form?type=returning` | El flujo de paciente recurrente no existe; se registra desde cero y duplica filas. | "Ya he venido antes": teléfono + nombre → visita nueva `followup` con datos precargados; motivos de la última visita pre-marcados. | 🔧 |
| 🟠 | `FormPage` | Sin filtro por sexo (mujeres ven próstata; síntomas masculinos disparan IIEF-5 tras cambiar sexo); "Otro" inalcanzable. | Catálogo con `onlyFor`; selección de síntomas se limpia al cambiar sexo. | ✅ catálogo · 🔧 UI |
| 🟠 | `questionnaires.ts` | Banderas rojas muertas: "dolor testicular súbito" no existe en ninguna lista; hematuria solo en vejiga; Chequeo/Otro nunca preguntan alarma. | Pantalla de alarma para TODOS al inicio (`ALARM_SYMPTOMS`) + banderas por síntoma. | ✅ |
| 🟡 | `FormPage.handleSubmit` | La IA se genera antes de guardar; sin timeout; el texto de error se guarda como resumen. | Guardar primero (`completeIntake` → `waiting`, `ai.pending`), generar después con claim CAS y watchdog; error nunca se guarda como resumen; nota determinista de respaldo. | ✅ datos/IA · 🔧 UI |
| 🟡 | `FormPage` | Sin reinicio por inactividad; timer de redirección no se limpia; "Volver" en paso 0 descarta todo sin confirmar; correo obligatorio. | Autosave de borrador en la fila (`symptoms.wizard`) y en `sessionStorage`; modal "¿Sigue ahí?" a los 180 s; correo opcional. | 🔧 |
| 🟡 | Likert con `<select>` | Selects y checkboxes de 13 px en una tablet para pacientes de 50-75 años. | `OptionGroup` de píldoras, un ítem por pantalla. | 🔧 (Plan 2) |
| ⚪ | `questionnaires.ts` | ICIQ-UI SF 0 = "Leve" (debe ser "Sin incontinencia"); ICIQ-OAB molestia `min=1`; O'Leary-Sant ítem 4 con anclas movidas; IIEF-5 sin opción 0 en Q2-Q5. | Corregido en los instrumentos declarativos con escalas oficiales. | ✅ |

### 2.4 Agenda y citas

| Sev | Dónde | Hallazgo | Corrección | Estado |
|---|---|---|---|---|
| 🟠 | `SchedulePage:178` | La cita web inserta una fila `waiting` en `patient_forms`: aparece en la sala de espera sin estar en el consultorio; nunca se sincroniza con `appointments`. | La cita solo crea `appointments`; la visita nace en el check-in "Llegó". | ✅ repos · 🔧 UI |
| 🟠 | `SchedulePage` | Duplicado de teléfono bloquea sin salida; búsqueda de recurrente por nombre exacto. | Teléfono primero; duplicado = advertencia, nunca bloqueo. | 🔧 |
| 🟡 | `SchedulePage` | Sin disponibilidad: horas fijas 12-18 todos los días, sin choque de horario, sin pasado; fecha `min` en UTC. | `domain/agenda.ts#getSlots` + `findConflicts` + `lib/dates.ts` en zona `America/Mazatlan`. | ✅ |
| 🟡 | `SchedulePage` | Reutiliza el prompt del interrogatorio sobre 11 checkboxes (nota casi vacía) y llama a OpenAI desde una página pública; taxonomía `HealthSphere` incorrecta. | Booking slim: motivo con chips; sin IA; taxonomía única (`REASONS`). | 🔧 |
| 🟡 | `DashboardPage` | "Marcar como completada" no deja rastro; "Próxima cita" de la nota no crea cita. | Firmar nota completa la cita origen y crea la de seguimiento. | 🔧 |
| 🟡 | — | Sin check-in, cancelación, no-show, reagendar. | Estados `scheduled/confirmed/checked_in/completed/cancelled/no_show` + `meta.history`. | ✅ tipos/repo · 🔧 UI |

### 2.5 Panel de recepción y doctor

| Sev | Dónde | Hallazgo | Corrección | Estado |
|---|---|---|---|---|
| 🟠 | `DashboardPage` | Recepción no tiene pestañas: no puede registrar, hacer check-in ni entregar la tablet, pero ve todo el resumen clínico. | Sidebar por rol; recepción: Sala, Agenda, Registrar; ve conteo de banderas y chip de IA, no el texto. | 🔧 |
| 🟠 | `DashboardPage` | El modal de consulta oculta resumen, banderas y puntajes justo cuando el doctor escribe; estado no se limpia entre pacientes; dos doctores pueden atender al mismo. | Ruta `/panel/consulta/:id` con panel de contexto a la izquierda y nota NOM-004 a la derecha; `startConsultation` con CAS. | 🔧 |
| 🟡 | `DashboardPage` | Dictado solo en Receta; mime type fijo; audio perdido si falla. | `DictationButton` por campo; mime detectado (Safari); reintento. | ✅ servicio · 🔧 UI |
| 🟡 | `PatientHistoryCard` | Subir varios archivos guarda solo el último; `saveConsultation` borra `attachedFiles`. | `addFile` read-merge-write; `saveConsultation` conserva archivos. | ✅ |
| 🟡 | `DashboardPage` | Sin realtime: la sala no se actualiza sola; `storage` listener muerto; doble descarga. | `useTableSubscription` (Realtime + sondeo 20 s + foco). | ✅ hook · 👤 activar Replication |
| 🟡 | `DashboardPage` | Sala ordenada por más reciente; sin tiempo de espera ni posición. | Orden de llegada; "hace 14 min"; banderas primero. | 🔧 |
| 🟡 | `PerplexityResearch` | Citas descartadas (`[1][2]` sin destino); sin contexto de caso; error mostrado como resultado. | `services/ai/research.ts` devuelve fuentes; `caseContext()` desidentificado; presets AUA/EAU; hilo multi-turno. | ✅ servicio · 🔧 UI |
| ⚪ | `PatientHistoryCard` | PDF sin saltos de página, sin firma/cédula, con estilos de pantalla. | Ruta de impresión `/expediente/:id/print` con `print.css`. | 🔧 |

---

## 3. Decisiones de arquitectura

| # | Decisión | Por qué |
|---|---|---|
| D1 | **1 fila de `patient_forms` = 1 visita.** El recurrente crea fila nueva (`kind: followup`, `prevVisitId`). `created_at` nunca se reescribe. | Las 10 filas legacy siguen funcionando; la evolución de puntajes (IPSS 24 → 15) sale gratis. |
| D2 | **La visita nace cuando el paciente está en el consultorio** (kiosko o check-in). La cita web/telefónica solo crea `appointments`. | Elimina filas fantasma en la sala de espera. |
| D3 | **Guardar primero, enriquecer después.** `completeIntake` persiste en < 1 s con `ai.status = pending`; la IA corre aparte con claim CAS y watchdog; nunca se guarda un error como resumen. | Con red lenta el paciente cierra la tablet y hoy se pierde todo. |
| D4 | **Nota determinista de respaldo** cuando no hay resumen IA. | La consulta nunca depende de OpenAI. |
| D5 | **Una sola tabla de transiciones** `VISIT_TRANSITIONS[status][rol]` en `domain/status.ts`; cada cambio usa filtro `.in('status', from)` (compare-and-set). | Ningún componente decide por su cuenta quién está en sala. |
| D6 | **Consulta a pantalla completa** `/panel/consulta/:id` (contexto a la izquierda, nota a la derecha). | Es lo que el doctor usa 30-40 min por paciente. |
| D7 | **Registro rápido < 30 s, teléfono primero;** duplicado = advertencia. Mismo diálogo en recepción y doctor. | Familias comparten teléfono/correo. |
| D8 | **Invariante: un teléfono tiene a lo más UNA visita abierta hoy.** | Evita dos tarjetas por doble tap. |
| D9 | **Desidentificación única** para OpenAI y Perplexity: nunca nombre, teléfono, correo ni fecha de nacimiento. | Hoy se manda el `formData` completo. |
| D10 | **Llaves detrás de la Edge Function `ai-proxy`;** llamada directa solo con `VITE_AI_PROXY_URL` vacío en desarrollo. | Las llaves ya están expuestas. |
| D11 | **"Limpiar registros" desaparece.** `cancelled` con motivo + barrido automático de visitas abandonadas al abrir el panel. | Borrado total con un clic de recepción. |
| D12 | **Fechas en `America/Mazatlan`** (UTC-7 fijo) para "hoy", agenda y visualización. | Después de las 17:00 el tablero mostraría el día equivocado en UTC. |

---

## 4. Máquina de estados

### 4.1 Visita (`patient_forms.status`)

| Estado | Significado | Entra por | Quién | Sale a |
|---|---|---|---|---|
| `arrived` | En el consultorio; tablet en curso o por entregar. | Kiosko "Soy nuevo / Ya he venido" al pasar datos básicos; check-in "Llegó" sobre una cita; registro walk-in. | paciente / recepción / doctor | `waiting`, `in_consultation` (doctor "Atender ahora"), `cancelled` |
| `waiting` | Cuestionario terminado (o saltado). Listo para pasar. | Kiosko "Enviar al doctor"; recepción "Sin tablet". | paciente / recepción | `in_consultation`, `arrived` ("Reaplicar"), `cancelled` |
| `in_consultation` | Un doctor lo atiende. Otro doctor ve la tarjeta bloqueada. | Doctor "Atender" (CAS desde `waiting`/`arrived`). | doctor | `completed`, `waiting` ("Devolver a sala") |
| `completed` | Nota guardada. Vive en Pacientes. | Doctor "Terminar consulta" con obligatorios NOM-004. | doctor | — |
| `cancelled` | Se retiró / error / abandonado. Nunca se borra. | Recepción "Se retiró"; barrido automático de visitas abiertas de días anteriores. | recepción / doctor / sistema | `arrived` (admin "Reactivar") |

Legacy aceptado en lectura: `waiting`, `completed` (las 10 filas actuales).

### 4.2 Cita (`appointments.status`)

`scheduled → confirmed → checked_in → completed`, con salidas `cancelled` y `no_show` (sugerido a +30 min sin check-in). Reagendar = misma fila, nueva fecha, `meta.history[]`. Check-in crea o reutiliza la visita (`meta.visitId`).

### 4.3 Resumen IA (`symptoms.ai.status`, ortogonal)

`pending → generating → ready | failed` (reintento con `attempts < 3`) · `skipped` (sin cuestionario). `generating` con más de 90 s se trata como `failed`.

---

## 5. Roles y permisos

| Acción | Kiosko | Recepción | Doctor | Admin |
|---|:-:|:-:|:-:|:-:|
| Crear su visita, llenar cuestionario | ✔ | — | — | — |
| Buscar recurrente (respuesta enmascarada) | ✔ | ✔ | ✔ | ✔ |
| Sala de espera (nombre, edad, motivos, estado, conteo de banderas, chip IA) | — | ✔ | ✔ | ✔ |
| Texto del resumen IA, puntajes, respuestas, antecedentes | — | — | ✔ | ✔ |
| Registrar paciente, check-in, "Sin tablet", "Se retiró" | — | ✔ | ✔ | ✔ |
| Agenda: crear / reagendar / cancelar / confirmar | — | ✔ todas | ✔ propia | ✔ |
| Atender, nota NOM-004, dictado, próxima cita, PDF | — | — | ✔ | ✔ |
| Investigación (Perplexity) | — | — | ✔ | ✔ |
| Historial completo | — | — | ✔ | ✔ |
| Registrar doctores | — | — | — | ✔ |
| Borrar filas | ✗ | ✗ | ✗ | ✗ (no existe) |

**Honestidad:** con anon key y sin RLS esto es control de cliente. No exponer públicamente antes de aplicar Auth + RLS (anexo §8.2).

---

## 6. Flujos

### 6.1 Kiosko — paciente nuevo
1. Landing (`/`): "Es mi primera visita" · "Ya he venido antes" · "Tengo un código". Salida al panel con PIN.
2. Datos básicos (una pregunta por pantalla): nombre, fecha de nacimiento (edad en vivo), sexo, teléfono, correo opcional, cómo se enteró. Al capturar el teléfono se busca expediente: "¿Es usted Juan P.?".
3. Al salir de datos básicos se crea la visita (`arrived`, `kind: first`, `source: kiosk`). Cada paso guarda borrador en la fila y en `sessionStorage`; si la tablet se cierra, al reabrir aparece "Continuar registro".
4. Pantalla de alarma (4 síntomas de urgencia) → motivos → síntomas por esfera (filtrados por sexo) → cuestionarios disparados (un ítem por pantalla, sin valores por defecto) → antecedentes específicos → antecedentes generales → otros temas + aviso de privacidad → revisión.
5. "Enviar al doctor": `completeIntake` calcula puntajes y banderas en cliente y persiste `waiting` + `ai.pending` en una sola escritura.
6. Pantalla "Listo, gracias" 20 s → reinicio. La IA se genera en segundo plano (`ensureSummary`); el watchdog del panel completa si la tablet se cerró.

### 6.2 Kiosko — paciente recurrente
Teléfono + primer nombre → resultado enmascarado → "Bienvenido de nuevo, ¿sus datos siguen igual?" → si recepción ya hizo check-in hoy se reclama esa visita; si no, se crea `followup` con datos y antecedentes copiados → wizard corto (alarma, motivos pre-marcados, síntomas, cuestionarios, "¿sus antecedentes siguen igual?") → igual que 6.1.

### 6.3 Kiosko — "Tengo un código"
Código de 4 dígitos generado por recepción en el check-in → abre la visita `arrived` de hoy con los datos precargados.

### 6.4 Recepción / Doctor — "Registrar paciente" (mismo diálogo, atajo `N`)
Teléfono (autofocus) → busca expediente → nombre, sexo, fecha de nacimiento o edad, correo opcional → motivo (chips) → doctor → **¿Cómo llega?**: *Está aquí* (crea `arrived` + código para la tablet, o "Sin tablet" → `waiting`) · *Agendar cita* (SlotPicker → solo `appointments`; mensaje de confirmación para WhatsApp) · Doctor además: *Registrar y atender ahora*.

### 6.5 Agenda
Vista Día (columnas por doctor) y Semana. Slots desde `getSlots` (horario de clínica, ocupados, pasados). Crear re-verifica el slot antes de insertar. Acciones por estado: Confirmar, Llegó (check-in → visita `arrived` + código), Reagendar, Cancelar, No llegó. `/schedule` público: tipo → datos o búsqueda enmascarada → doctor + slot → motivo → confirmar (solo `appointments`).

### 6.6 Doctor — consulta
"Atender" → `startConsultation` (CAS) → `/panel/consulta/:id`. Izquierda: Resumen IA (o nota determinista) · Alertas · Puntajes con barras y delta vs visita previa · Antecedentes · Visitas previas · Archivos. Derecha: signos vitales estructurados, padecimiento actual ("Traer del resumen"), interrogatorio, exploración, diagnóstico, receta, recomendaciones, próxima cita (SlotPicker). Dictado en cada campo, autosave cada 10 s, "Devolver a sala", "Terminar consulta" (valida NOM-004, completa la cita origen, crea la de seguimiento). PDF por ruta de impresión.

### 6.7 Investigación (Perplexity)
Desde la consulta ("Investigar caso", con contexto desidentificado y preguntas sugeridas por bandera/puntaje) o desde la pestaña Investigación (presets AUA/EAU/ICS, historial). Respuesta con citas numeradas enlazadas, "Insertar en recomendaciones", "Copiar", hilo multi-turno.

---

## 7. Estructura de código (implementada / en curso)

```
src/
├─ app/            App.tsx, router.tsx, guards/RequireRole.tsx, layouts/{KioskLayout,StaffLayout}.tsx
├─ config/         clinic.ts (zona horaria, horario, slots), roles.ts
├─ domain/         types.ts · status.ts (transiciones) · agenda.ts · deidentify.ts · summary/deterministicNote.ts
│  ├─ questionnaires/  9 instrumentos declarativos + scoreAll         ✅
│  └─ intake/          catalog.ts (motivos, síntomas, alarma) · redFlags.ts · branching.ts
├─ data/           supabase.ts · mappers.ts · visits.repo.ts · appointments.repo.ts · doctors.repo.ts · files.repo.ts · realtime.ts   ✅
├─ services/       env.ts ✅ · session.ts ✅ · ai/{client,summary,transcribe,research}.ts ✅
├─ lib/            dates.ts (Mazatlán) · phone.ts · ids.ts
├─ components/ui/  Button, Card, Field, OptionGroup, SymptomToggle, Stepper, Chip, ScoreBar, Drawer, Modal, Toast, EmptyState, Skeleton, Avatar, Table, Segmented, Callout
├─ features/       kiosk/ · booking/ · auth/ · waitingRoom/ · registration/ · agenda/ · consultation/ · research/ · patients/ · admin/ · print/
└─ styles/         tokens.css · base.css · components.css · motion.css · kiosk.css · staff.css · print.css
supabase/functions/ai-proxy/index.ts   ✅ (código listo; despliegue pendiente)
supabase/migrations/0001_target_schema.sql (no aplicada)
```

---

## 8. Fases y criterios de aceptación

| Fase | Entregable | Aceptación | Estado |
|---|---|---|---|
| **0 Higiene** | `.env` fuera del índice, `.gitignore`, test scripts borrados, PIN/admins en `ENV`, sesión única, `lang="es"`. | `git ls-files` no lista `.env`; `grep <PIN> src` vacío; login funciona con `VITE_RECEPTION_PIN`. | ✅ |
| **1 Dominio + datos** | Cuestionarios declarativos, catálogo, tipos de visita/cita, mappers tolerantes, repos con CAS, realtime, capa IA con proxy. | `tsc` limpio; las 10 filas legacy se mapean sin `undefined`; `scoreAll` reproduce las tablas oficiales. | ✅ |
| **2 Sistema de diseño** | tokens/base/components/motion/kiosk/staff/print CSS + primitivas UI. | Ningún `style={{}}` de layout en JSX; contraste AA. | ✅ |
| **3 Kiosko save-first** | Landing, wizard por pantallas, recurrente, código, borrador, pantalla final, IA en segundo plano. | "Enviar" persiste `waiting` en < 1 s con OpenAI bloqueado; doble tap = 1 fila; recurrente no toca la fila anterior. | ✅ código · ✅ `smoke:db` 40/40 |
| **4 Panel: sala + registro + check-in** | StaffLayout por rol, sala en orden de llegada con banderas primero, RegisterPage, código de tablet, barrido de abandonados, watchdog IA. | Registro walk-in < 30 s; recepción no ve texto clínico; cambio desde otra pestaña se refleja en ≤ 20 s. | ✅ código · ✅ `smoke:db` 40/40 |
| **5 Consulta** | Ruta de consulta, contexto + nota NOM-004, dictado por campo, autosave, archivos, próxima cita, PDF por impresión, Pacientes por teléfono. | Dos "Atender" simultáneos: uno gana; F5 restaura borrador; firmar crea seguimiento; archivo sobrevive a firmar. | ✅ código · ✅ `smoke:db` 40/40 |
| **6 Agenda + booking** | Día/Semana, SlotPicker compartido, check-in, no-show, `/schedule` slim. | Booking no crea fila en `patient_forms`; slot doble → error; 13:00 se ve 13:00 en cualquier zona horaria. | ✅ código · ✅ `smoke:db` 40/40 |
| **7 Investigación** | Drawer en consulta + página, contexto desidentificado, citas enlazadas, insertar en nota. | Contexto no contiene nombre ni teléfono; 5 citas → 5 enlaces. | ✅ |
| **8 Limpieza** | Borrar `store/db.ts`, `utils/*`, `types/index.ts`, `pages/*`; migración SQL escrita; README real. | `tsc -b && vite build` limpios; sin imports de `store/db`. | ✅ |

**Nota sobre pruebas:** todo se verificó en localhost contra la base actual en modo lectura (10 filas legacy se ven en la sala y en Pacientes). Los flujos que escriben (registro en kiosko, check-in, consulta, citas) están implementados pero no se ejecutaron contra la base de producción por decisión de no crear datos de prueba ahí. Para probarlos: usar un proyecto/branch de Supabase de pruebas en `.env` o autorizar filas de prueba.

---

## 8.1 Verificación (20 sep 2026)

**Dominio puro, sin red — 18/18 pruebas pasan** (wizard, puntajes, mapeo fila↔visita v1/v2, máquina de estados, fechas, agenda, teléfono, desidentificación, nota determinista). Cubre: mujer nunca ve próstata ni IIEF-5; instrumentos sin responder quedan "incompletos" y no sesgan; IPSS 35 severo; banderas rojas sin duplicar; ida y vuelta `visitToRow → rowToVisit` sin pérdida; filas legacy v1 se leen y re-escriben con espejo; "Llegó" solo hoy en zona de la clínica; traslape de 45 min bloquea dos slots.

**Escritura contra la base — pendiente de correr por el usuario.** El arnés `scripts/smoke-db.mjs` (`npm run smoke:db`, o `-- --ai` para además generar un resumen real con OpenAI) ejercita con filas marcadas (teléfono `5559…`, nombre "Prueba Auto …") y las borra al final:

| Flujo | Qué comprueba |
|---|---|
| Kiosko nuevo | `createVisit` arrived → borrador en fila → `DuplicateOpenVisit` con el mismo teléfono → `completeIntake` deja `waiting`, `ai.pending`, `classification`, `medical_history.v2`, espejo v1 → doble tap idempotente |
| IA | `claimAi` CAS (segunda reclamación = null), forzado, tope de 3 intentos; con `--ai`: nota con **ALERTA**, secciones, sin nombre |
| Consulta | Dos "Atender" simultáneos: exactamente uno gana; recepción no mueve `in_consultation`; devolver a sala; borrador de nota; firmar → `completed` con firma y sin borrador; archivo sobrevive |
| Recepción | Código de 4 dígitos → `findByKioskCode`; `skipIntake` invalida el código; "Se retiró" y reactivar solo admin; "Registrar y atender" nace con hora de inicio |
| Barrido | Visita de ayer → `cancelled/abandonado`; filas legacy intactas (snapshot antes/después) |
| Agenda | Slot doble y traslape de 15 min → `SlotTakenError`; otro doctor mismo slot OK; `listOccupiedSlots` sin nombres; confirmar; reagendar con historial; check-in crea visita ligada y es idempotente; cerrar consulta completa la cita; check-in de recurrente hereda datos y `prevVisitId`; check-in sobre cancelada no deja visita huérfana; no-show y reapertura |

Correcciones hechas en esta pasada: check-in valida la transición **antes** de crear la visita; "Registrar y atender" inicia la nota con hora y doctor; "Llegó" usa el día de la clínica y no el del navegador; el borrador del kiosko se reanuda por clave de paso (sobrevive al cambio nuevo→recurrente y conserva respuestas si recepción registró al paciente en paralelo); la pantalla de confirmación del recurrente exige teléfono de 10 dígitos.

## 8.2 Diagnóstico de proveedores de IA (20 sep 2026)

Al probar la investigación, Perplexity respondió **401 Invalid API key**: la llave `pplx-…` de `.env` ya no es válida (revocada tras la fuga o rotada sin actualizar `.env`). La de OpenAI sí es válida. Para que esto sea evidente y no un "Error 401: {json}":

- `services/ai/client.ts`: `describeAiError` traduce 401/402/403/404/429/5xx a mensajes accionables por proveedor (directo o vía proxy) y guarda el texto crudo en `AiError.detail` (consola `[ai]`).
- `services/ai/health.ts` + **Administración › Probar conexiones**: OpenAI con `GET /v1/models/<modelo>` (gratis), Perplexity con una solicitud de 5 tokens; con proxy consulta `GET /health` de la Edge Function (ruta nueva).
- `npm run check:ai`: lo mismo desde la terminal.

Regla operativa: tras cambiar una llave en `.env` hay que **reiniciar `npm run dev`** (Vite solo lee `.env` al arrancar); en producción, `supabase secrets set` + redeploy de `ai-proxy`.

## 8.3 Hallazgo: RLS bloquea los UPDATE de la llave anon (20 sep 2026)

Síntoma reportado: el paciente llena todo, toca "Enviar al doctor", el kiosko dice "Listo" y en la sala la visita sigue como "Llenando cuestionario · Sin cuestionario". Diagnóstico (solo lectura sobre las filas de prueba): las visitas se crean (INSERT) pero no tienen borrador ni evento posterior; un UPDATE no-op con la llave anon responde **200 con 0 filas**. Es RLS activo en `patient_forms` con políticas de SELECT/INSERT y sin UPDATE para `anon`. Como la app no usa Supabase Auth, *todas* las escrituras (borrador, enviar, atender, cerrar consulta, citas) son `anon` y estaban fallando en silencio.

Correcciones:

- `supabase/sql/permisos-anon-temporal.sql`: diagnóstico + políticas permisivas para anon en `patient_forms`, `appointments` y `doctors` (DELETE solo para filas de prueba `5559…`). Se sustituyen por las de `0001_target_schema.sql` cuando exista Auth.
- `patch()` y `write()` ya distinguen "otra pestaña movió la fila" (transición, CAS) de "la base no aplicó el UPDATE" (`DataError` con mensaje que apunta al SQL). `claimAi` igual.
- El kiosko solo va a "Listo" si la visita realmente avanzó; si no, muestra el error y conserva las respuestas. El pie del wizard avisa "Sin conexión con el servidor" cuando el borrador remoto falla.
- `npm run smoke:db` empieza probando INSERT/UPDATE/DELETE y explica qué ejecutar si falla.

## 8.4 Resultado de `npm run smoke:db` (20 sep 2026, tras permisos-anon-temporal.sql)

- **Permisos**: INSERT / UPDATE / DELETE de anon ✅.
- **Kiosko**: crear visita, borrador en fila, duplicado por teléfono, `completeIntake` (waiting, ai.pending, columnas planas, espejo v1), doble tap ✅.
- **IA**: `claimAi` CAS, forzado, tope de 3 intentos ✅; con `--ai`, OpenAI generó la nota real (gpt-4o-mini, ~1.7 k caracteres) con **ALERTA**, secciones y sin nombre del paciente ✅.
- **Consulta**: dos "Atender" simultáneos → uno gana; recepción no mueve `in_consultation`; devolver a sala; borrador; firmar; archivo ✅.
- **Recepción**: código de tablet, `skipIntake`, "Se retiró", reactivar solo admin, "Registrar y atender" ✅.
- **Barrido**: cancela la de ayer, no toca legacy ✅.
- **Agenda**: al principio bloqueada porque `appointments.patient_id` era NOT NULL (la app vieja creaba una fila en `patient_forms` por cada cita); tras `supabase/sql/citas-patient-id-opcional.sql` pasan crear, choque de horario, traslape, otro doctor, slots públicos sin nombres, confirmar, reagendar con historial, check-in idempotente, cerrar consulta completa la cita, subsecuente con `prevVisitId`, check-in sobre cancelada sin visita huérfana, no-show y reapertura ✅.
- **Fechas**: Postgres devuelve timestamptz como `…+00:00` y el código genera `…Z`; `rowToVisit`/`rowToAppointment` normalizan con `isoUtc()` para que los filtros por día y el orden comparen un solo formato.

**Resultado final (20 sep 2026): 40/40.**

## 8.5 Revisión adversarial y correcciones (20 sep 2026, tarde)

Seis revisores independientes (repos/estado, kiosko, panel, mapeo/puntajes, seguridad/privacidad, UI/accesibilidad) produjeron 32 hallazgos; los verificadores toparon con el límite de sesión, así que los 29 restantes se confirmaron leyendo el código. Corregido en esta pasada (todo re-verificado: tsc, lint, 20/20 dominio, **40/40 `smoke:db`**, build):

**Datos y concurrencia**
- **Expedientes v1 ya no pierden el cuestionario**: la primera escritura convertía la fila a v2 sin `intake` y la segunda borraba el espejo. `rowToVisit` reconstruye `legacyIntake` en filas v2 sin intake y el sobre guarda `legacy` completo. Prueba de dominio con dos reescrituras.
- **Concurrencia optimista** en `patch()`, `claimAi` y `appointments.write`: contador `rev` en el jsonb; si otra pestaña escribió en medio, se relee y se reaplica (hasta 3 veces). Ningún escritor pisa columnas que no tocó (borrador de nota vs. "Atender", watchdog de IA vs. consulta).
- `completeIntake` acepta `in_consultation` sin regresar el estado: si el doctor tocó "Atender ahora" mientras el paciente contestaba, las respuestas ya no se descartan; el kiosko solo dice "Listo" si la consulta está `completed` y avisa si fue cancelada.
- Código de tablet único por día (se regenera si ya existe; si hubiera duplicado, no se adivina).
- `finishAi` con token de reclamación: una generación tardía no pisa un resumen terminado; umbral de "colgada" de 90 s a 5 min (mayor que el presupuesto de reintentos).
- `saveConsultation` conserva `research` y demás campos que el formulario no administra; `hasNotes` ya no ignora campos.
- Check-in que reutiliza una visita del kiosko la liga a la cita (`linkAppointment`) para que cerrar la consulta la complete.
- `saveNoteDraft` solo sobre consultas abiertas; el autosave remoto se detiene al cerrar/devolver y solo escribe si hay cambios.

**Panel**
- Cerrar consulta: primero la nota, después la cita de seguimiento (sin citas huérfanas); si el horario se ocupó, avisa y ofrece agendar.
- "Terminar consulta" en la sala lleva a la página de consulta (no cierra sin nota).
- Ctrl+Enter respeta `canWrite`; "Reintentar transcripción" inserta en el campo dictado, no en Receta.
- Pacientes: al refrescar la lista se conserva la visita elegida. "Registrar otro" limpia el formulario. Modales de confirmación muestran el error y siguen abiertos.
- La consulta se actualiza sola cuando llega el cuestionario o el resumen (sin tocar la nota).

**Seguridad y privacidad**
- El kiosko cierra cualquier sesión del personal al abrirse (salida por PIN real). La sesión expira aunque la pestaña siga abierta.
- Con Edge Function, el PIN se verifica en el servidor (`POST /reception-login`, secreto `RECEPTION_PIN`); solo en desarrollo se usa `VITE_RECEPTION_PIN`.
- Edge Function: exige la llave anon, límite por IP (último salto de x-forwarded-for) y global, prompts de sistema en el servidor (`prompts.ts`), mensajes acotados, `/health` cacheado 60 s.
- Kiosko: el teléfono solo muestra "¿Es usted…?" si además coincide el primer nombre. Booking público: la disponibilidad ya no descarga el sobre (correo, comentarios).
- Investigación: contexto y pregunta pasan por `redactFreeText`; diagnóstico por `redactName`. `redactName` cubre nombres con acento.

**UI / accesibilidad**
- Etiquetas asociadas automáticamente (`Field` genera id y `aria-labelledby`): tocar la etiqueta enfoca el campo.
- Botón cargando conserva su color (los puntos eran blancos sobre arena). Casilla de consentimiento se ve marcada. Movimiento reducido ya no estroboscopea los indicadores. Diálogos: ids únicos y cierre nativo (gesto atrás) sincronizado. Scroll al inicio en cada paso del kiosko. Zoom permitido (`maximum-scale` retirado).

Pendiente opcional: `supabase/sql/indices-recomendados.sql` (índice único de horario por doctor; la app traduce 23505 a "horario ocupado").

## 9. Acciones que solo el usuario puede hacer

0. **Base de datos**: `supabase/sql/permisos-anon-temporal.sql` y `supabase/sql/citas-patient-id-opcional.sql` ✅ ejecutados el 20 sep (necesarios en cualquier proyecto Supabase nuevo antes de `npm run smoke:db`).

1. **Rotar** las llaves de OpenAI, Perplexity, Gemini y regenerar el anon key de Supabase (ya están en GitHub).
2. **Purgar el historial** antes de volver a hacer push: `git filter-repo --path .env --path test.js --path test2.js --path test3.js --path test4.js --path test_openai.js --path test_perpl.js --invert-paths` y `git push --force` (coordinar con quien tenga clones).
3. **Desplegar** `supabase/functions/ai-proxy` con `supabase secrets set OPENAI_API_KEY=… PERPLEXITY_API_KEY=…` y poner `VITE_AI_PROXY_URL` en `.env`; quitar `VITE_OPENAI_API_KEY`/`VITE_PERPLEXITY_API_KEY` del build de producción.
4. **Activar Replication** (Realtime) para `patient_forms` y `appointments` en el dashboard de Supabase (si no, el panel usa sondeo cada 20 s).
5. **Aplicar la migración** `supabase/migrations/0001_target_schema.sql` cuando se decida (Auth, RLS, bucket privado, tablas propias). Hasta entonces la app corre sobre las columnas actuales.
6. Confirmar **horario real de consulta** y días laborales para `config/clinic.ts` (hoy: lunes a viernes 12:00-18:00, slots de 30 min, editable por `.env`).
