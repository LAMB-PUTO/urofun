# Urología Funcional

Aplicación del consultorio del Dr. Miguel Ángel Sandoval Valle (Culiacán): kiosko de interrogatorio en tablet para pacientes, panel de recepción y doctor, agenda, resumen pre-consulta con IA e investigación clínica con fuentes.

> Resumen de cambios, manejo de llaves y checklist de pruebas: `docs/RESUMEN-CAMBIOS-Y-PRUEBAS.md`.

## Correr en local

```bash
npm install
cp .env.example .env   # y llenar las variables
npm run dev            # http://localhost:5173
```

Variables (`.env`):

| Variable | Uso |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Conexión a Supabase |
| `VITE_RECEPTION_PIN` | PIN de recepción (sin él, ese acceso queda deshabilitado) |
| `VITE_ADMIN_USERNAMES` | Usuarios de `doctors` con rol admin, separados por coma |
| `VITE_AI_PROXY_URL` | URL de la Edge Function `ai-proxy` (recomendado). Ej. `https://<proyecto>.supabase.co/functions/v1/ai-proxy` |
| `VITE_OPENAI_API_KEY`, `VITE_PERPLEXITY_API_KEY` | **Solo desarrollo local.** Se compilan en el bundle; nunca desplegar con ellas |
| `VITE_AGENDA_START_HOUR`, `VITE_AGENDA_END_HOUR`, `VITE_AGENDA_SLOT_MINUTES` | Horario de agenda (por defecto 12:00–18:00, 30 min) |

## Rutas

| Ruta | Quién | Qué |
|---|---|---|
| `/` | Paciente (tablet) | Inicio: primera visita, ya he venido antes, tengo un código |
| `/kiosk/nuevo`, `/kiosk/recurrente`, `/kiosk/codigo`, `/kiosk/continuar/:id` | Paciente | Interrogatorio por pantallas |
| `/schedule` | Público | Agendar cita en línea (solo crea la cita) |
| `/login` | Personal | PIN de recepción o usuario/contraseña de doctor |
| `/panel/espera` | Recepción y doctor | Sala de espera en vivo (orden de llegada, banderas rojas primero) |
| `/panel/registrar` | Recepción y doctor | Registrar paciente: está aquí (código para la tablet) · agendar cita · atender ahora |
| `/panel/agenda` | Recepción y doctor | Día / semana, check-in "Llegó", reagendar, cancelar, no llegó |
| `/panel/consulta/:id` | Doctor | Consulta: contexto a la izquierda, nota NOM-004 con dictado a la derecha |
| `/panel/pacientes` | Doctor | Expedientes por teléfono, visitas, cuestionarios, archivos, PDF |
| `/panel/investigacion` | Doctor | Perplexity con guías AUA/EAU/ICS y fuentes numeradas |
| `/panel/doctores` | Admin | Alta de doctores y salud de la IA |
| `/expediente/:id/print` | Doctor | Expediente para imprimir / guardar PDF |

## Estructura

```
src/domain      tipos, máquina de estados, cuestionarios declarativos (IPSS, NIH-CPSI, ICIQ, O'Leary-Sant, IIEF-5, PEDT, ADAM, FSFI-6), catálogo de síntomas, nota determinista
src/data        repositorios Supabase (patient_forms = visita, appointments, doctors, storage) con compare-and-set y realtime
src/services    env, sesión, IA (resumen, dictado, investigación) con proxy y fallback de desarrollo
src/features    kiosk · auth · waitingRoom · registration · agenda · consultation · patients · research · admin · print · booking
src/components  primitivas de UI (sin librerías de componentes)
src/styles      tokens, base, componentes, movimiento, kiosko, staff, impresión
supabase/       Edge Function ai-proxy y migración objetivo (no aplicada)
docs/           PLAN-LOGICA.md · PLAN-DISENO.md · anexos
```

## Comandos

```bash
npm run dev      # servidor de desarrollo
npm run build    # tsc + vite build
npm run lint     # oxlint
npm run check:ai # verifica las llaves de OpenAI y Perplexity (o la Edge Function) sin abrir la app
npm run smoke:db # prueba de humo de escritura contra la base de .env (crea y borra filas de prueba)
npm run smoke:db -- --ai   # lo mismo, y además genera un resumen real con OpenAI
```

## Base de datos (una sola vez, SQL Editor de Supabase)

1. `supabase/sql/permisos-anon-temporal.sql`: políticas RLS para la llave anon mientras no haya Supabase Auth. Sin esto, los UPDATE fallan en silencio (el kiosko "envía" pero nada cambia).
2. `supabase/sql/citas-patient-id-opcional.sql`: hace opcional `appointments.patient_id` para poder agendar sin crear una visita.
3. Verifica con `npm run smoke:db`.

## Antes de desplegar

1. Rotar las llaves que estuvieron en git y desplegar `supabase/functions/ai-proxy` con `supabase secrets set OPENAI_API_KEY=… PERPLEXITY_API_KEY=…`.
2. Activar Replication para `patient_forms` y `appointments` (si no, el panel sondea cada 20 s).
3. Revisar `supabase/migrations/0001_target_schema.sql` (Auth, RLS, bucket privado).

Detalle en [docs/PLAN-LOGICA.md](docs/PLAN-LOGICA.md) y [docs/PLAN-DISENO.md](docs/PLAN-DISENO.md).
