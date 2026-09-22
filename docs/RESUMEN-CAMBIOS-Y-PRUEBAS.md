# Urología Funcional · Resumen de cambios, manejo de llaves y arranque de pruebas

Fecha: 20 y 21 de septiembre de 2026. Estado: código commiteado y pusheado a `main` el 21 sep (sin secretos); historial anterior pendiente de purgar (sección 2.3).

Este documento junta en un solo lugar: (1) qué se corrigió y por qué, (2) cómo van a quedar las variables de entorno para que ninguna llave vuelva a estar pública en el repo, y (3) la lista exacta para empezar a probar.

---

## 1. Lo que se arregló, en orden de importancia

### 1.1 Seguridad y llaves

| Problema encontrado | Qué se hizo |
|---|---|
| `.env` y seis scripts `test*.js` con las llaves de OpenAI, Perplexity y Gemini estaban **en git y ya publicados en GitHub** (`wataart/Urologia-funcional`). | `.env` sacado del índice (sigue en tu disco), `.gitignore` con `.env` y `.env.*` (solo `.env.example` se versiona), scripts borrados. **Falta purgar el historial y rotar llaves: sección 2.** |
| Las llaves de IA se compilaban dentro del JavaScript público. | Capa `services/ai/*` que usa una Edge Function (`supabase/functions/ai-proxy`) cuando existe `VITE_AI_PROXY_URL`; las llaves directas solo funcionan en desarrollo. |
| El PIN de recepción estaba en el código (`<PIN>`) y luego en `VITE_`, que también es público. | Con Edge Function, el PIN se verifica en el servidor (`POST /reception-login`, secreto `RECEPTION_PIN`). `VITE_RECEPTION_PIN` solo sirve en desarrollo local. |
| La Edge Function era un proxy abierto: sin autenticación, límite por IP falsificable, prompt de sistema enviado por el cliente. | Exige la llave anon del proyecto, limita por IP real (último salto) y global, prompts de sistema del lado del servidor (`prompts.ts`), mensajes acotados, `/health` cacheado. |
| Cualquier paciente podía entrar al panel: la sesión del personal sobrevivía al pasar la tablet al modo kiosko y `/login` redirigía sin PIN. | El kiosko cierra cualquier sesión al abrirse. La sesión expira a las 12 h aunque la pestaña siga abierta. |
| Datos que salían a terceros: el booking público descargaba correos y comentarios de otras citas; el kiosko revelaba "¿Es usted Roberto G.?" con solo teclear un teléfono; diagnóstico y preguntas a Perplexity sin desidentificar. | Disponibilidad pública sin sobre de datos; el kiosko solo ofrece el expediente si además coincide el primer nombre; contexto y pregunta a Perplexity pasan por redacción; `redactName` cubre nombres con acento (José, Ángel). |
| Botón "Limpiar registros" que borraba toda la base desde recepción. | Eliminado. No existe ninguna ruta de borrado en la app. |

### 1.2 Base de datos (lo que rompía las pruebas)

| Síntoma que viste | Causa | Corrección |
|---|---|---|
| Llenabas el cuestionario, tocabas "Enviar" y en el panel seguía "Sin cuestionario". | RLS activo en `patient_forms` con permiso de lectura e inserción pero **sin UPDATE** para la llave anon. PostgREST responde 200 con 0 filas, sin error. | `supabase/sql/permisos-anon-temporal.sql` (ya lo ejecutaste). Además el código ya distingue "otra pestaña lo movió" de "la base no aplicó el UPDATE" y lo dice en pantalla. |
| Agendar cita fallaba. | `appointments.patient_id` era NOT NULL (la app vieja creaba una fila en `patient_forms` por cada cita). | `supabase/sql/citas-patient-id-opcional.sql` (ya lo ejecutaste). |
| Fechas comparadas como texto con dos formatos (`+00:00` vs `.000Z`). | Postgres y JavaScript serializan distinto. | Toda fecha que entra de la base se normaliza (`isoUtc`). |
| Opcional: dos personas agendando el mismo horario al mismo milisegundo. | Sin índice único. | `supabase/sql/indices-recomendados.sql` (pendiente, opcional). La app traduce el error a "horario ocupado". |

### 1.3 Lógica del consultorio

- **Una fila = una visita**, con ciclo `arrived → waiting → in_consultation → completed` (o `cancelled`), transiciones validadas por rol y escrituras con compare-and-set. La identidad del paciente es el teléfono a 10 dígitos.
- **Los 10 expedientes viejos no pierden el cuestionario.** Antes, la primera escritura convertía la fila al formato nuevo sin cuestionario y la segunda borraba el espejo. Ahora se reconstruye y se guarda completo.
- **Escrituras concurrentes ya no se pisan.** Cada escritura exige la versión que leyó (`rev`); si otra pestaña escribió en medio, relee y reaplica. Cubre borrador de nota vs. "Atender", resumen de IA vs. consulta, dos doctores tocando "Atender" (uno gana).
- **Kiosko**: una pregunta por pantalla, pantalla de alarma para todos, motivos por sexo, nueve cuestionarios con escalas oficiales y sin valores por defecto, borrador que sobrevive (sesión + fila) y se reanuda por clave de paso, inactividad de 3 minutos, recurrente por teléfono + nombre, código de 4 dígitos único por día, aviso de privacidad guardado. Si el doctor toca "Atender ahora" mientras el paciente contesta, las respuestas se guardan igual (antes se perdían y la tablet decía "Listo").
- **Guardar primero, IA después**: el paciente ve "Listo" en menos de un segundo; el resumen se genera aparte con reclamación, reintentos, nota estructurada de respaldo y token para que una generación tardía nunca pise un resumen terminado.
- **Consulta**: primero se guarda la nota y después se crea la cita de seguimiento (antes al revés: quedaban citas huérfanas). "Terminar consulta" desde la sala lleva a la página de consulta, no cierra sin nota. Ctrl+Enter respeta permisos. "Reintentar transcripción" inserta en el campo dictado. El contexto se actualiza solo cuando llega el cuestionario o el resumen. La investigación no se pierde al firmar.
- **Agenda**: día/semana, check-in idempotente que liga la visita (también si nació en el kiosko), reagendar con historial, no-show y reapertura, choque de horario y traslape, booking público sin filas fantasma en la sala.
- **Panel**: Pacientes conserva la visita elegida al refrescar; "Registrar otro" limpia el formulario; los modales de confirmación muestran el error y siguen abiertos; recepción ve conteo de banderas rojas pero no texto clínico.
- **Diagnóstico de IA**: `npm run check:ai` y Administración › Probar conexiones dicen exactamente qué llave falla y dónde corregirla. Hoy: OpenAI ✔ y Perplexity ✔ (llave renovada el 21 sep).

### 1.4 Diseño y accesibilidad

Sistema "Consultorio Cálido" (Fraunces + Atkinson Hyperlegible, fondo arena, azul marino como acción, verde azulado solo para seleccionado), sin tarjetas de vidrio, gradientes ni emojis. Verificado con capturas en tablet horizontal y vertical, laptop normal y al 125 %, panel angosto: sin desbordes. Tras la revisión: etiquetas asociadas a los campos (tocar la etiqueta enfoca), botón cargando visible, casilla de consentimiento con palomita, movimiento reducido sin parpadeo, diálogos con cierre nativo sincronizado, scroll al inicio en cada paso, zoom permitido.

### 1.5 Cómo se verificó

| Verificación | Resultado |
|---|---|
| `tsc`, `oxlint`, `vite build` | Limpios |
| Pruebas de dominio puro (wizard, puntajes, mapeo v1/v2, máquina de estados, fechas, redacción) | 20 / 20 |
| `npm run smoke:db` contra tu Supabase (crea y borra filas de prueba `5559…`) | **40 / 40** |
| `npm run smoke:db -- --ai` (resumen real con OpenAI) | Nota con ALERTA, secciones y sin nombre |
| Revisión adversarial con seis agentes | 32 hallazgos, 29 corregidos, 3 eran los pendientes tuyos |

Detalle completo: `docs/PLAN-LOGICA.md` secciones 8.1 a 8.5 y `docs/PLAN-DISENO.md`.

---

## 2. Variables de entorno: cómo quedan para que nada vuelva a ser público

### 2.1 La regla

Todo lo que empieza con `VITE_` termina dentro del JavaScript que descarga cualquier visitante. Por eso:

| Va en `.env` del frontend (`VITE_`) | Va en secretos de la Edge Function (nunca en el frontend) |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (públicas por diseño de Supabase) | `OPENAI_API_KEY`, `PERPLEXITY_API_KEY` |
| `VITE_AI_PROXY_URL` (la URL de la función, pública) | `RECEPTION_PIN` |
| `VITE_ADMIN_USERNAMES`, horario, nombre de la clínica | `AI_PROXY_ALLOWED_ORIGINS` (tu dominio) |
| Solo en desarrollo local: `VITE_OPENAI_API_KEY`, `VITE_PERPLEXITY_API_KEY`, `VITE_RECEPTION_PIN` | opcional: `DOCTOR_NAME`, modelos |

`.env.example` documenta todas. En producción (Vercel, Netlify o donde lo montes) las `VITE_` se capturan en el panel del host, no en un archivo; y ahí **no** se ponen llaves de IA ni PIN.

### 2.2 Estado del repo hoy

- `.env` ya no está en el índice de git (sigue en tu disco y funciona).
- `.gitignore` ignora `.env` y `.env.*`, y solo permite `.env.example`.
- Los `test*.js` con llaves ya no existen.
- **Pero el historial de commits ya publicado en GitHub sigue teniendo las llaves.** Borrar el archivo no borra el pasado: cualquiera puede leer los commits anteriores.

### 2.3 Qué hacer, en este orden (todo tuyo, unos 20 minutos)

1. **Rotar llaves y cambiar el PIN** (hazlo aunque vayas a purgar el historial; asume que ya los copiaron). El PIN de recepción actual también estuvo publicado en el código: pon uno nuevo en `VITE_RECEPTION_PIN` y avísale a recepción.
   - OpenAI: platform.openai.com › API keys › crear nueva, borrar la vieja.
   - Perplexity: hecho el 21 sep (llave nueva en `.env`). Borra la anterior en console.perplexity.ai si aún existe.
   - Gemini: aistudio.google.com › borrar la vieja (la app nueva no la usa).
   - Supabase: Settings › API › "Generate new JWT secret" invalida la llave anon publicada. Hazlo al final, porque obliga a actualizar `.env` y el host.
2. **Actualizar `.env` local** con las llaves nuevas y reiniciar `npm run dev` (Vite solo lee `.env` al arrancar). Verificar con `npm run check:ai`.
3. **Purgar el historial antes del próximo push.** Como el repo tiene pocos commits y todos son de la versión anterior, lo más limpio es empezar el historial de cero (opción A). Si prefieres conservar los commits, opción B.

   Opción A, historial nuevo (recomendada):
   ```
   git checkout --orphan limpio
   git add -A
   git commit -m "Urología Funcional: reconstrucción (kiosko, panel, agenda, IA) sin secretos"
   git branch -D main
   git branch -m main
   git push --force origin main
   ```
   Opción B, reescribir conservando commits (requiere `pip install git-filter-repo`):
   ```
   git filter-repo --invert-paths --path .env --path test.js --path test2.js --path test3.js --path test4.js --path test_openai.js --path test_perpl.js
   git remote add origin https://github.com/wataart/Urologia-funcional.git
   git push --force origin main
   ```
   En ambos casos, después: GitHub › Settings › Code security › Secret scanning, cerrar alertas; y valorar poner el repo en privado. Si alguien más lo tiene clonado, debe volver a clonar.
4. **Desplegar la Edge Function** con las llaves nuevas (una sola vez):
   ```
   npm i -g supabase
   supabase login
   supabase link --project-ref <ref-de-tu-proyecto>
   supabase secrets set OPENAI_API_KEY=... PERPLEXITY_API_KEY=... RECEPTION_PIN=... AI_PROXY_ALLOWED_ORIGINS=https://tu-dominio
   supabase functions deploy ai-proxy --no-verify-jwt
   ```
   Luego en `.env` (y en el host): `VITE_AI_PROXY_URL=https://<ref>.supabase.co/functions/v1/ai-proxy`, y **quita** `VITE_OPENAI_API_KEY`, `VITE_PERPLEXITY_API_KEY` y `VITE_RECEPTION_PIN` del `.env` de producción. `npm run check:ai` debe decir "modo: Edge Function".

---

## 3. Listo para probar: checklist

### 3.1 Antes de la primera prueba

- [x] `permisos-anon-temporal.sql` ejecutado.
- [x] `citas-patient-id-opcional.sql` ejecutado.
- [x] Llave nueva de Perplexity en `.env` y `npm run check:ai` en verde (21 sep).
- [ ] Opcional: `indices-recomendados.sql`.
- [ ] Opcional pero recomendable: Supabase › Database › Replication › activar `patient_forms` y `appointments` (si no, el panel se refresca cada 20 s en vez de al instante).
- [ ] `npm run smoke:db` debe dar 40/40 (crea y borra sus propias filas; no toca nada tuyo).
- [ ] Limpiar tus dos visitas de prueba viejas ("josue ruiz" y "hjosu er", en "Llenando cuestionario"): en la sala, marcarlas "Se retiró". Si no, mañana el barrido las cancela solo.

### 3.2 Accesos

| Quién | Dónde | Con qué |
|---|---|---|
| Paciente (tablet) | `http://localhost:5173/` | Sin acceso |
| Recepción | `http://localhost:5173/login` › Recepción | PIN de `.env` (`VITE_RECEPTION_PIN`) |
| Doctor | `http://localhost:5173/login` › Médico | Usuario y contraseña de la tabla `doctors` |
| Administración | Panel › Doctores | Usuario listado en `VITE_ADMIN_USERNAMES` |
| Paciente desde su celular | `http://localhost:5173/schedule` | Sin acceso |

### 3.3 Recorridos de prueba y lo que debe pasar

**Kiosko, paciente nuevo**
1. "Es mi primera visita" › nombre, fecha de nacimiento, sexo, teléfono, correo (o "no tengo"), cómo se enteró. Al salir de esta sección la visita aparece en la sala como "Llenando cuestionario".
2. Alarma › motivo › síntomas › cuestionarios (una pregunta por pantalla, "Siguiente" bloqueado hasta responder) › antecedentes › otros temas › aviso de privacidad › revisión › "Enviar al doctor".
3. Debe decir "Listo, gracias" y en la sala pasar a "En sala de espera" con el resumen "Generando" y luego "Resumen listo" (unos 10 a 20 segundos).
4. Prueba de resistencia: a medio cuestionario, cierra la pestaña y vuelve a abrir `localhost:5173/`; debe ofrecer "Continuar donde se quedó". Deja la tablet quieta 3 minutos: aparece "¿Sigue ahí?" y a los 30 segundos regresa al inicio.

**Kiosko, código de recepción**
1. Recepción › Registrar paciente › teléfono, nombre, fecha › "Está aquí" › "Registrar llegada": aparece un código de 4 dígitos.
2. Tablet › "Tengo un código" › los 4 dígitos › "Sí, soy yo": abre el cuestionario con sus datos precargados.
3. Recepción también puede "Sin tablet: pasar a sala" (queda "Sin cuestionario").

**Kiosko, recurrente**
- "Ya he venido antes" › teléfono + primer nombre: si existe, entra con datos y motivos anteriores precargados; si no, ofrece registrarse.
- Con un teléfono ajeno y un nombre que no coincide, no debe mostrar el nombre de nadie.

**Doctor**
1. Sala de espera: los que tienen bandera roja van primero; "Atender" abre la consulta.
2. Consulta: contexto a la izquierda (resumen de IA, puntajes con barra, banderas, antecedentes, visita anterior si la hay); nota NOM-004 a la derecha. "Traer del cuestionario" llena el padecimiento actual. Dictado por campo (micrófono). Autosave: recarga la página y el borrador sigue.
3. "Investigar caso": pregunta con contexto desidentificado; con la llave de Perplexity nueva debe responder con fuentes numeradas; "Insertar" lo mete en Recomendaciones.
4. "Terminar consulta" exige signos vitales, padecimiento, exploración, diagnóstico y receta. Con "Agendar cita de seguimiento" crea la cita. La visita pasa a "Atendido"; el PDF se abre desde Pacientes o desde la consulta.
5. Prueba de choque: abre la misma visita en dos pestañas como doctor y toca "Atender" en las dos: una gana y la otra avisa.

**Recepción**
- Agenda: "Nueva cita" desde un slot libre, confirmar, reagendar, cancelar, "Llegó" (crea la visita con código), "No llegó" pasados 30 minutos. WhatsApp de confirmación con el texto listo.
- Un horario ocupado no se puede volver a ocupar con el mismo doctor.

**Booking público (`/schedule`)**
- Elige tipo, datos, doctor y horario (mínimo 60 minutos de anticipación), motivo y consentimiento. Debe crear la cita en la agenda, **no** una visita en la sala. Ofrece archivo `.ics` y WhatsApp.

**Administración › Probar conexiones**
- OpenAI OK y Perplexity OK (tras la llave nueva). Registrar doctor funciona y avisa que las contraseñas siguen en texto plano (pendiente de Supabase Auth).

### 3.4 Lo que todavía es limitación conocida durante las pruebas

- Sin Supabase Auth: toda la app usa la llave anon con políticas permisivas. Es lo mismo que había, pero explícito; el siguiente paso real de seguridad es Auth + las políticas de `supabase/migrations/0001_target_schema.sql`.
- Contraseñas de doctores en texto plano en la tabla (heredado; se resuelve con Auth).
- El bucket `patient_files` es público; los archivos llevan rutas no adivinables.
- Sin Replication activada, el panel sondea cada 20 segundos.
- Horario de consulta configurado lunes a viernes 12:00 a 18:00 (editable en `.env`: `VITE_AGENDA_START_HOUR`, `VITE_AGENDA_END_HOUR`, `VITE_AGENDA_SLOT_MINUTES`). Confírmame el real.

---

## 4. Comandos de referencia

```
npm run dev              # servidor local en http://localhost:5173
npm run check:ai         # verifica llaves de OpenAI y Perplexity (o la Edge Function)
npm run smoke:db         # 40 pruebas de escritura contra la base; crea y borra sus filas
npm run smoke:db -- --ai # lo mismo y además genera un resumen real con OpenAI
npm run build            # tsc + vite build
npm run lint             # oxlint
```

Archivos clave: `docs/PLAN-LOGICA.md`, `docs/PLAN-DISENO.md`, `supabase/sql/*.sql`, `supabase/functions/ai-proxy/`, `.env.example`, `scripts/smoke-db.mjs`, `scripts/check-ai.mjs`.
