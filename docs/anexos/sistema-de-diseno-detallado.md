# Sistema de diseño — Urología Funcional

**Versión 1.0 · 19 de septiembre de 2026 · Base: "Consultorio Cálido" (ganadora 3/3) con injertos de "FOLIO" y "Instrumento".**

## 0. Tesis y decisiones de fusión

El sistema es **papel e ink**: superficies cálidas muy sutiles, tinta navy, y un solo acento teal que significa "esto es lo que usted eligió / esto está activo". Dos superficies, un solo lenguaje:

- **Kiosco** (tableta, pacientes 50-75 años): una pregunta por pantalla, pregunta en serif Fraunces, todo lo demás en Atkinson Hyperlegible Next, objetivos de 64 px, "usted".
- **Staff** (laptop 13-15", doctor y recepción): mismo papel y tinta a media escala y el doble de densidad; tablas tipo libro mayor, no pilas de tarjetas.

Injertos adoptados (con la razón):

| Injerto | Origen | Por qué |
|---|---|---|
| Acción primaria en **navy**, teal reservado a seleccionado/activo/enlace | FOLIO | Los tres jueces lo llamaron la mejor decisión de color; la página queda "tinta sobre papel" y el teal de la marca sigue siendo raro y significativo. |
| Regla hairline bajo cada título de página/sección como firma | FOLIO | Barato en CSS, imposible de confundir con plantilla. |
| Progreso por ítems (`respondidos / ítemsActivos`) | FOLIO | Las ramas no hacen retroceder la barra. |
| Borrador en `localStorage` del kiosco con aviso visible | Instrumento | Un "Atrás" accidental no pierde 8 minutos. |
| Fecha de nacimiento Día/Mes/Año con edad calculada en vivo | Instrumento + Cálido | El date picker nativo es el dolor actual. |
| Signos vitales estructurados, dictado por campo, chips de contexto para Perplexity | Instrumento | Mejor NOM-004 y mejor PDF. |
| Skeleton solo después de 300 ms; atajos mínimos (j/k, Enter, Esc, `/`, Ctrl+Enter) | Instrumento | Madurez sin construir un command palette. |
| Ruta de impresión dedicada con hoja de estilos `@media print` | Instrumento + Cálido | html2pdf capturando chips y sombras se ve peor con el nuevo layout. |

Recortes a la ganadora (para que no vuelva el look "app amigable"): sin sombra en reposo en las píldoras, sin easing con rebote, sin tintes de avatar por hash, sin shimmer (pulso de opacidad), escala de radio recortada a 4/6/10/14 (nada de 18 px), tinte sand más claro que la propuesta original.

---

## 1. Fuentes

**URL única (colocar en `index.html` reemplazando la de Montserrat/Poppins):**

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300..700,0..100&family=Atkinson+Hyperlegible+Next:wght@400;500;600;700&display=swap" rel="stylesheet">
```

| Rol | Familia | Pesos / ejes | Dónde |
|---|---|---|---|
| Display | **Fraunces** (variable) | wght 400 (display), 500 (h1/h2), 600 (numerales); SOFT 50; `font-optical-sizing: auto` | Pregunta del kiosco, títulos de pantalla, H1/H2 de staff, nombre del paciente en consulta, numerales grandes de puntaje, hora de agenda |
| UI | **Atkinson Hyperlegible Next** | 400, 500, 600, 700 | Todo lo demás: cuerpo, etiquetas, opciones, botones, tablas, notas |

Pila de respaldo obligatoria (si `Atkinson Hyperlegible Next` no resuelve en Google Fonts, cae a `Atkinson Hyperlegible`, que solo tiene 400/700; declarar ambas):

```css
--font-display: 'Fraunces', Georgia, 'Times New Roman', serif;
--font-ui: 'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', system-ui, 'Segoe UI', Roboto, sans-serif;
```

Reglas tipográficas:

1. Fraunces nunca en negrita > 600, nunca en mayúsculas, nunca con `letter-spacing`, nunca con gradiente ni `text-shadow`.
2. La pregunta del kiosco: Fraunces 500, `--fs-h2`, máximo 28 palabras, termina en `?`.
3. Solo un texto en mayúsculas en todo el sistema: la **caption de sección** (`.eyebrow`): `--fs-small` 600, `letter-spacing: .06em`, color `--ink-2`.
4. Todo número que se compara (puntajes, edades, horas, teléfonos, folios) lleva `.num` → `font-variant-numeric: tabular-nums lining-nums`, alineado a la derecha en tablas.
5. Ancho de lectura: kiosco `max-width: 34rem`; prosa staff `42rem`.
6. Etiquetas siempre arriba del campo; el placeholder es solo ejemplo (`Ej. 667 123 4567`).
7. Registro: "usted" en kiosco, clínico neutro en staff. Acentos obligatorios. `¿ ¡` reales. Rango en prosa con guion medio `4 – 6 semanas`; fracción de puntaje con barra `17 / 35`.
8. Cursiva solo para atribuciones clínicas (`según IPSS, AUA 2021`) y texto literal del paciente (`otherTopicsToDiscuss`).
9. Sin `text-xs` en el kiosco: nada por debajo de `--fs-small` (16.5 px).

---

## 2. Tokens `:root` (pegar en `src/styles/tokens.css`)

```css
/* ==========================================================
   Urología Funcional — tokens de diseño v1.0
   Dos superficies: [data-surface="kiosk"] y [data-surface="staff"]
   ========================================================== */
:root {
  /* ---------- Fuentes ---------- */
  --font-display: 'Fraunces', Georgia, 'Times New Roman', serif;
  --font-ui: 'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', system-ui, 'Segoe UI', Roboto, sans-serif;

  /* ---------- Navy (tinta y estructura; brand #273A5E) ---------- */
  --navy-900: #12203A;   /* tinta más oscura, hover de texto en sidebar, print */
  --navy-800: #1B2A46;   /* botón primario fill, H1 staff, texto seleccionado */
  --navy-700: #273A5E;   /* BRAND. hover/pressed primario, ítem activo, hora de agenda */
  --navy-600: #3B5080;   /* enlaces en tablas staff, iconos en reposo */
  --navy-300: #AEB8CC;   /* ticks inactivos del stepper, chevrones, numerales 01/02 */
  --navy-100: #E3E8F1;   /* chip de esfera, avatar de recepción/paciente, fila seleccionada */
  --navy-50:  #F0F3F8;   /* hover de fila y nav */

  /* ---------- Teal (única señal: seleccionado / activo / enlace; brand #078A86) ---------- */
  --teal-800: #085C59;   /* texto sobre teal-50 (7.4:1), hover de enlace */
  --teal-700: #0B6E6B;   /* texto teal sobre blanco/papel (6.1:1): enlaces, "Leve", check de seleccionado */
  --teal-600: #078A86;   /* BRAND. Solo fills/strokes: borde de opción seleccionada, progreso, rail activo, foco. NUNCA texto pequeño sobre blanco (4.2:1) */
  --teal-300: #7CC8C4;   /* segmentos secundarios de progreso */
  --teal-100: #CFEAE8;   /* hover de opción seleccionada, nav activo */
  --teal-50:  #E3F3F1;   /* fondo de opción seleccionada; el único tinte que ve el paciente */

  /* ---------- Sand (papel; mantener MUY claro) ---------- */
  --sand-900: #5E5A52;   /* texto secundario cálido (timestamps de kiosco) */
  --sand-400: #C7BDAE;   /* texto deshabilitado, ticks de ScoreBar */
  --sand-300: #D9D0C3;   /* borde por defecto: píldoras, inputs, tarjetas (hairline-strong) */
  --sand-200: #EFE8DE;   /* superficie hundida: sidebar, barra de acción del kiosco, cabecera de tabla */
  --sand-150: #E6E1D9;   /* hairline: divisores de fila, separadores de sección */
  --sand-100: #F6F2EC;   /* fondo de página ("papel") — más claro que la propuesta original */
  --sand-50:  #FFFDFA;   /* tarjetas, inputs, hojas (blanco cálido) */

  /* ---------- Tinta ---------- */
  --ink:   #1C2434;      /* texto por defecto (13.8:1 sobre sand-100) */
  --ink-2: #5E6673;      /* secundario, helper, meta (5.5:1) */
  --ink-3: #8A9099;      /* placeholders y deshabilitado SOLO (3.2:1) */

  /* ---------- Semánticos ---------- */
  --red-700:   #A4231A;  /* texto de bandera roja, error, "Severo" */
  --red-500:   #D0392E;  /* punto de bandera, borde de error, indicador de grabación, fill ScoreBar severo */
  --red-50:    #FBEAE7;  /* callout de bandera roja, fondo de campo con error */
  --amber-800: #7A4E00;  /* texto "Moderado", "Prefiere Dr. X" */
  --amber-500: #D99A1E;  /* fill ScoreBar moderado */
  --amber-50:  #FFF3DB;  /* fondo chip warning */
  --green-800: #1F6B3A;  /* texto "Completado", "Leve" */
  --green-500: #3A9A5C;  /* fill ScoreBar leve, punto "En vivo", guardado */
  --green-50:  #E6F4EA;  /* fondo chip success / toast */
  --severity-leve:     var(--green-500);
  --severity-moderado: var(--amber-500);
  --severity-severo:   var(--red-500);
  --whatsapp: #128C7E;   /* solo enlace de texto en /schedule; nunca en el kiosco */

  /* ---------- Roles de superficie ---------- */
  --bg:            var(--sand-100);
  --surface:       var(--sand-50);
  --surface-sunken: var(--sand-200);
  --hairline:        var(--sand-150);
  --hairline-strong: var(--sand-300);
  --overlay: rgba(27, 42, 70, 0.45);
  --focus: var(--teal-600);

  /* ---------- Elevación (3 niveles; las tarjetas nunca tienen sombra) ---------- */
  --shadow-0: none;
  --shadow-pop:   0 1px 2px rgba(28,36,52,.06), 0 8px 24px -8px rgba(28,36,52,.14);  /* popover, toast, select */
  --shadow-sheet: 0 12px 32px -8px rgba(28,36,52,.24);                                /* drawer, modal */
  --shadow-press: inset 0 2px 0 rgba(28,36,52,.10);                                   /* estado pressed */

  /* ---------- Espaciado (base 4) ---------- */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px; --sp-5: 20px;
  --sp-6: 24px; --sp-8: 32px; --sp-10: 40px; --sp-12: 48px; --sp-16: 64px; --sp-24: 96px;

  /* ---------- Radio (una familia = un radio; nunca > 14) ---------- */
  --r-xs: 4px;    /* chips de tabla, kbd, checkbox */
  --r-sm: 6px;    /* inputs, botones, chips, opciones en staff */
  --r-md: 10px;   /* tarjetas, drawers, slots de agenda, toasts, modal staff */
  --r-lg: 14px;   /* inputs, botones, píldoras y tarjetas del KIOSCO, modal kiosco */
  --r-pill: 999px;/* SOLO status chip, avatar, badge de conteo, track de progreso */

  /* ---------- Escala tipográfica (rem relativo a la superficie) ---------- */
  --fs-micro:   .75rem;  --lh-micro: 1.35;
  --fs-small:   .867rem; --lh-small: 1.45;
  --fs-body:    1rem;    --lh-body: 1.5;
  --fs-lead:    1.13rem; --lh-lead: 1.45;
  --fs-h3:      1.27rem; --lh-h3: 1.35;   /* sans 600 */
  --fs-h2:      1.6rem;  --lh-h2: 1.25;   /* Fraunces 500 */
  --fs-h1:      2rem;    --lh-h1: 1.15;   /* Fraunces 500 */
  --fs-display: 2.67rem; --lh-display: 1.1; /* Fraunces 400 SOFT 100, solo saludo del kiosco */
  --fs-numeral: 1.87rem; --lh-numeral: 1;   /* Fraunces 600 tabular: puntajes, hora de agenda */

  /* ---------- Dimensiones de control ---------- */
  --ctl-kiosk: 64px;  --ctl-kiosk-sm: 56px;
  --ctl-staff: 40px;  --ctl-staff-sm: 32px;
  --row-staff: 48px;  --row-agenda: 56px;
  --sidebar-w: 240px; --sidebar-rail: 64px;
  --drawer-w: 560px;  --drawer-w-lg: 720px;
  --kiosk-header-h: 80px; --kiosk-footer-h: 104px;
  --staff-header-h: 56px;

  /* ---------- Z-index ---------- */
  --z-sticky: 10; --z-sidebar: 20; --z-dropdown: 30; --z-drawer: 40;
  --z-modal: 50;  --z-toast: 60;  --z-tooltip: 70;

  /* ---------- Movimiento ---------- */
  --dur-instant: 80ms;  /* feedback de press */
  --dur-fast:   160ms;  /* hover, foco, chip, selección */
  --dur-base:   240ms;  /* cambio de paso, drawer, toast, segmented */
  --dur-slow:   400ms;  /* progreso, ScoreBar */
  --dur-reveal: 600ms;  /* trazo del check de éxito */
  --ease-out:      cubic-bezier(0.2, 0, 0, 1);    /* entra */
  --ease-in:       cubic-bezier(0.4, 0, 1, 1);    /* sale */
  --ease-standard: cubic-bezier(0.2, 0, 0.2, 1);  /* cambio de propiedad */
}

/* Raíces por superficie */
html { font-size: 16px; }
[data-surface="kiosk"] { font-size: 19px; }
[data-surface="staff"] { font-size: 15px; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* Utilidades */
.num { font-variant-numeric: tabular-nums lining-nums; }
.eyebrow { font: 600 var(--fs-small)/var(--lh-small) var(--font-ui); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); }
.display, .h1, .h2 { font-family: var(--font-display); font-weight: 500; font-variation-settings: "SOFT" 50; letter-spacing: 0; }
.display { font-size: var(--fs-display); line-height: var(--lh-display); font-weight: 400; font-variation-settings: "SOFT" 100; }
.h1 { font-size: var(--fs-h1); line-height: var(--lh-h1); }
.h2 { font-size: var(--fs-h2); line-height: var(--lh-h2); }
.h3 { font: 600 var(--fs-h3)/var(--lh-h3) var(--font-ui); }
.lead { font-size: var(--fs-lead); line-height: var(--lh-lead); }
.small { font-size: var(--fs-small); line-height: var(--lh-small); }
.muted { color: var(--ink-2); }
.stack { display: flex; flex-direction: column; gap: var(--sp-4); }
.row { display: flex; align-items: center; gap: var(--sp-3); }
.rule { border-bottom: 1px solid var(--hairline-strong); padding-bottom: var(--sp-3); }  /* firma del sistema bajo títulos */
.visually-hidden { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }

:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
[data-surface="staff"] :focus-visible { outline-width: 2px; }
[data-surface="kiosk"] { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
[data-surface="kiosk"] .option, [data-surface="kiosk"] .btn { user-select: none; }
```

Contraste verificado: `--ink` sobre `--sand-100` 13.8:1; `--ink-2` 5.5:1; `--teal-700` sobre blanco 6.1:1; `--navy-800` fill con texto blanco > 12:1; `--red-700` sobre `--red-50` 6.4:1. El brand `#078A86` **no** se usa como texto.

---

## 3. Layout

### 3.1 Kiosco (`<div data-surface="kiosk">` en `/`, `/form`, `/form?type=returning`)

Dispositivo: tableta 10-11" (1180×820 landscape, 820×1180 portrait). Una sola columna en ambas orientaciones. `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">`. Alturas con `100dvh`.

**Landing (`/`)**

| Región | Spec |
|---|---|
| Franja superior | 72 px; izquierda `logo-lockup.png` a 160 px de ancho (ya recortado); derecha reloj y fecha `.small .muted .num`: `Jueves 19 de septiembre · 11:42` |
| Área principal | centrada verticalmente, `max-width: 52rem`, padding 0 32 px. Saludo `.display`: `Buenos días.` (calculado por hora). Debajo `.lead .muted`: `Bienvenido al consultorio del Dr. Miguel Ángel Sandoval Valle. Esta tableta le hará algunas preguntas antes de pasar con el doctor. Tarda entre 5 y 10 minutos.` |
| Dos filas de elección | **Filas tipo libro mayor, no tarjetas** (injerto FOLIO): ancho completo, 112 px de alto (128 en portrait), hairline arriba y abajo, sin sombra. Izquierda numeral Fraunces `01` / `02` en `--navy-300` `--fs-numeral`; título `.h3` `Es mi primera visita` / `Ya he venido antes`; subtítulo `.muted` `Llenaremos su historial completo.` / `Solo actualizaremos sus síntomas de hoy.`; derecha `ArrowRight` 28 px `--teal-700`. Press: fondo `--navy-50`, `--shadow-press`. Toda la fila es el botón. |
| Pie | `.small .muted`: `Si tiene dudas, la asistente le puede ayudar.` Esquina inferior derecha, enlace ghost 40 px: `Personal de la clínica` → `/login`. **Sin WhatsApp ni Doctoralia** (viven en `/schedule`). |

**Wizard (`/form`)** — tres regiones fijas:

1. **Header** 80 px, `--bg`, `border-bottom: 1px solid var(--hairline-strong)`. Izquierda: botón ghost 56 px `Atrás` con `ArrowLeft` (en paso 0 dice `Salir` y abre modal `¿Desea salir sin guardar?`). Centro: `.stepper` segmentado por sección. Derecha: botón secondary 56 px `Ayuda` → modal `Levante la mano y la asistente vendrá a ayudarle.` con un botón `Entendido`.
2. **Región de scroll**: columna `max-width: 34rem` centrada, padding `40px 32px 160px`. Orden: `.eyebrow` (`PREGUNTA 3 DE 7 · PRÓSTATA`), pregunta `.h2` Fraunces, helper opcional `.muted` (`Piense en el último mes.`), control de respuesta, opción ghost `No estoy seguro` donde sea clínicamente aceptable. Al cambiar de paso el foco va al `h2` (`tabindex=-1`) y el scroll se reinicia a `top: 0` **sin** smooth.
3. **Barra de acción** sticky bottom 104 px, `--surface-sunken`, `border-top: 1px solid var(--hairline-strong)`, `padding-bottom: env(safe-area-inset-bottom)`. Derecha: primario `Siguiente` (`min-width: 220px`, 64 px). Izquierda: `.small .muted` `Guardado en esta tableta` (autosave a `localStorage` con debounce 500 ms). Nada más: `Atrás` vive en el header para que un pulgar tembloroso no pueda tocar dos botones opuestos. Último paso: `Enviar al doctor`. Primario deshabilitado (no oculto) con línea `Elija una opción para continuar.` encima.

Tipos de pantalla:

| Tipo | Control |
|---|---|
| Datos | Un grupo por pantalla. Nombre: input 64 px `autocapitalize="words"`. Fecha de nacimiento: tres inputs `Día / Mes / Año` `inputmode="numeric"` (72 px cada uno) + texto vivo `Tiene 63 años`. Sexo: dos píldoras grandes. Teléfono: `inputmode="tel"` con formato en vivo. Correo: opcional + píldora `No tengo correo`. |
| Motivo / Síntomas | `SymptomToggle` multi-select, `Puede elegir varias opciones.` |
| Cuestionario Likert | **Un ítem por pantalla**, `OptionGroup` vertical con etiqueta completa. Auto-avance 350 ms en single-select (desactivable en ajustes y desactivado en modo asistido). |
| Conteos 0-5 (nocturia, ICIQ frecuencia) | `OptionGroup` en grid 6-up de 72 px cuadrados con numeral Fraunces. Nunca tira horizontal 0-10 de 56 px. |
| Molestia 0-10 | `OptionGroup` en grid 6+5 de 72 px con leyendas `Nada` / `Muchísimo` en `.lead` bajo el grid. |
| Antecedentes | Toggles + 3 pantallas de texto corto con píldora `Ninguno` exclusiva; se permiten 2-3 sí/no por pantalla solo aquí (ADAM). |
| Otros temas | Textarea `min-height: 180px`, opcional. |
| Revisión | Lista de secciones con enlaces `Cambiar`. No se muestran puntajes al paciente. |
| Envío | Check dibujado, `.h1` `Listo, gracias.`, `.lead` `Entregue la tableta a la asistente y tome asiento. El doctor ya tiene su información.` Anillo de cuenta regresiva 20 s + `Esta pantalla se cerrará sola`. **El resumen de OpenAI se genera después de mostrar esta pantalla**; si falla, se guarda sin resumen y staff puede `Regenerar`. Al cerrar: `navigate('/')` + reset duro del estado y del `localStorage`. |

Inactividad: 180 s sin interacción en el wizard → modal `¿Sigue ahí?` con conteo 30 s y `Sí, continuar`; al expirar, reset y landing. Errores: inline bajo el campo (`--red-700`, `AlertCircle` 16 px, foco al campo); Toast solo por fallo de red (`No se pudo enviar. La asistente puede reintentar.`).

Modo **asistido** (`/panel/registrar`, desde el sidebar de staff): mismo wizard con `data-surface="staff"` (15 px), sin auto-avance, sin cuenta regresiva, con el rail de secciones clicable y botón `Guardar y volver a Sala de espera`.

**Público `/schedule`**: mismos primitivos a raíz 16 px, columna única 640 px, tira de fechas + `OptionGroup` de horas en lugar de dos `<select>`, WhatsApp como enlace de texto en el pie.

### 3.2 Staff (`<div data-surface="staff">` en `/login` y `/panel/*`)

Laptop 1280-1536 px. Breakpoints: `≥1200` sidebar 240 px; `1100-1199` sidebar 64 px (rail de iconos con tooltips; cubre 13" Windows a 125 %); `<800` barra superior 56 px con menú que abre el nav en un Drawer izquierdo.

**AppShell**: `display: grid; grid-template-columns: var(--sidebar-w) 1fr; height: 100dvh`. Sidebar `--surface-sunken`, `border-right: 1px solid var(--hairline-strong)`; main `--bg` con `overflow: auto` en el contenido (no en body).

Sidebar (arriba→abajo, separados por hairlines): `logo-mark.png` 32 px + `logo-lockup` no; usar mark + nombre de rol en `.small .muted` (`Recepción` / `Dr. Miguel Sandoval`) → nav → bloque de usuario (Avatar 36 + nombre + `Salir` ghost). Nav `<nav aria-label="Principal">`, `NavLink` 40 px, `--r-sm`, padding 0 12 px, icono 18 px `--navy-600`, etiqueta `.933rem 500 --ink-2`. Activo: fondo `--teal-100`, texto `--navy-800`, icono `--navy-800`, barra 3 px `--teal-600` en el borde izquierdo del sidebar. Hover: `--sand-300` al 50 %.

Rutas (reemplazan las tabs-botón): `/panel/espera`, `/panel/agenda`, `/panel/pacientes`, `/panel/investigacion` (doctor), `/panel/registrar`, `/panel/consulta/:id`, `/panel/doctores` (admin, grupo `Administración`), `/expediente/:id/print`. Recepción ve: Sala de espera, Agenda, Registrar paciente.

Cabecera de página 56 px, sin borde: `.h1` Fraunces a la izquierda con `.rule` debajo (firma); derecha: indicador `8px --green-500` + `.small .muted .num` `En vivo · actualizado hace 12 s` (Supabase realtime en `patient_forms`, fallback polling 30 s etiquetado honestamente `actualizado 14:32:05`), botón icono `RefreshCw`, y una sola acción primaria por página. Padding de contenido `24px 32px`, `max-width: 1440px`.

| Vista | Layout |
|---|---|
| **Sala de espera** | Master/detail. Izquierda 400 px (`--surface`, `border-right`): filas de cola 72 px (Avatar 36, nombre 600, meta `.small .num` `63 a · Masculino · hace 14 min`, chips de esfera `--navy-100` máx. 2 + `+1`, punto rojo 8 px si `redFlags.length > 0`, chip amber `Prefiere Dr. X`). Orden `created_at asc`. Derecha: header sticky (nombre `.h2`, edad/sexo/teléfono, StatusChip, primario `Atender` → `/panel/consulta/:id`; recepción ve `Marcar como no presentado`). Cuerpo, grid 2 columnas ≥1280: Callout de banderas rojas primero y a ancho completo; `Resumen previo (IA)` con caption `Generado automáticamente · revisar` y botón texto `Regenerar`; `Cuestionarios` con un ScoreBar por instrumento; `Antecedentes` como `<dl>` 2 columnas; `Respuestas completas` en `<details>`. `Limpiar registros` sale de aquí → admin, modal con confirmación tecleada. Atajos: `/` búsqueda, `j/k` fila, `Enter` abrir, `Esc` cerrar. |
| **Consulta** `/panel/consulta/:id` | Página completa, grid `5fr 7fr`, gap 24 px; apila `<1100`. Izquierda sticky (`top: 24px; max-height: calc(100dvh - 48px); overflow: auto`): mismas tarjetas de contexto + enlace `Copiar resumen a Padecimiento actual`. Derecha: `.eyebrow` `NOTA DE CONSULTA · NOM-004`, `.h1` nombre, meta `.num` (folio, fecha, hora); mini-nav sticky con scroll-spy (Signos vitales · Padecimiento · Interrogatorio · Exploración · Diagnóstico · Receta · Recomendaciones · Próxima cita). Signos vitales: fila de 6 inputs `.field--mono` 88 px con sufijo de unidad (TA, FC, FR, Temp, Peso, Talla). Textareas auto-grow con botón `Mic` en la esquina inferior derecha de cada una; el dictado se inserta **en el caret del campo enfocado**. Barra inferior sticky: `.small .num` `Borrador guardado 11:52` (autosave 10 s a `localStorage` por id) · `Guardar borrador` secondary · `Terminar consulta` primary (`Ctrl+Enter`). `Cancelar` pregunta por modal solo si hay texto sin guardar. Botón icono `Investigar` en el header → Drawer 560 px de Perplexity con chips de contexto clicables (`IPSS 22 severo`, `63 años`, `PSA nunca`) y `Insertar en recomendaciones`. |
| **Agenda** | Tira de 7 días (celdas 56 px, numeral `.num`, hoy con subrayado 2 px `--teal-600`, seleccionado `--navy-800` con texto blanco, flechas de semana) + `Nueva cita` primario → Drawer con doctor `Select`, fecha, horas como grid de píldoras, búsqueda de paciente por teléfono. Cuerpo: libro mayor de slots 12:00-18:00 (30 min), fila 56 px, columna de hora 88 px con numeral Fraunces `--navy-700`; slot vacío = rectángulo interior con borde discontinuo 1.5 px `--sand-400` y `Disponible` en `--ink-3`, hover `--teal-50`; slot ocupado = Avatar + nombre 600 + teléfono `.muted .num`, chip de doctor (admin), StatusChip, kebab (`Marcar completada`, `Reagendar`, `Cancelar`). Slots pasados en `--ink-3`, no interactivos. Hora actual: línea 2 px `--teal-600` + etiqueta `ahora`. Vacío: EmptyState `No hay citas este día` + `Nueva cita` secondary. |
| **Pacientes** | Buscador (nombre/teléfono, debounce 300 ms, estilo subrayado, 320 px) + chips de filtro (`Todos · En espera · Atendidos`). Tabla: Avatar+nombre, edad/sexo, teléfono `.num`, última visita `.num`, esferas, archivos (conteo `.num` + `Paperclip`). Clic → Drawer 720 px con `SegmentedControl` (`Notas · Cuestionarios · Archivos`), `Exportar PDF` (abre `/expediente/:id/print` y `window.print()`) y `Subir estudios` (dropzone discontinua con filas de progreso). |
| **Investigación** | Dos columnas 320 px + 1fr. Izquierda: textarea 3 filas, `Buscar` primario, `Consultas rápidas` como enlaces de texto (`Guía AUA HPB: primera línea`, `EAU litiasis: indicaciones URS`, `ICS vejiga hiperactiva: anticolinérgicos vs β3`), `Historial` en `localStorage`. Derecha: columna de lectura `max-width: 42rem`: pregunta como `.h2`, respuesta `react-markdown` 17px/1.6, citas como superíndices `.num` que enlazan a `Fuentes` numeradas al final (dominio + título), `Copiar`, `Insertar en nota` (solo desde consulta). Carga: Skeleton de 3 párrafos. Error: Callout inline. |
| **Login** | Tarjeta 400 px centrada sobre `--bg`, `logo-lockup.png` 180 px arriba, `SegmentedControl` (`Recepción / Médico`) con radios reales, PIN como 8 cajas `inputmode="numeric"` `.field--mono`, error inline, `Entrar` primario, enlace ghost `Volver a la tableta`. |

---

## 4. Componentes

Todas las clases viven en `src/styles/{tokens,base,components,kiosk,staff,print}.css`. Ningún `style={{}}` de layout en JSX (hoy hay 354 en 12 archivos; `DashboardPage` 72, `BladderSteps` 48, `SchedulePage` 46).

### Button `.btn`
- Variantes: `.btn--primary` (fill `--navy-800`, texto blanco, hover `--navy-700`, pressed `--navy-900` + `--shadow-press` + `translateY(1px)`); `.btn--secondary` (fill `--surface`, borde 1.5 px `--navy-700`, texto `--navy-800`, hover `--navy-50`); `.btn--ghost` (transparente, texto `--navy-700`, hover `--surface-sunken`); `.btn--danger` (fill `--red-700`, blanco; solo tras modal de confirmación); `.btn--link` (texto `--teal-700`, subrayado offset 3 px).
- Tamaños: `.btn--kiosk` 64 px / padding 0 24 px / `--r-lg` / `--fs-lead` 600; `.btn--kiosk-sm` 56 px; `.btn--md` 40 px / 0 16 px / `--r-sm` / `.933rem` 600; `.btn--sm` 32 px / 0 12 px (tablas).
- Icono 20 px kiosco / 16 px staff, a la izquierda salvo flechas, gap 8 px. Icon-only: cuadrado + `aria-label` + tooltip.
- Estados: `[disabled]` fill `--sand-200`, texto `--ink-3`, sin truco de opacidad; `.is-loading` conserva ancho, cambia icono por loader de 3 puntos, `aria-busy`. Sin escala en hover, sin sombra de color.

### Card `.card`
Superficie `--surface`, borde 1 px staff / 1.5 px kiosco `--hairline-strong`, `--r-md` staff / `--r-lg` kiosco, padding 20 / 28 px, **sin sombra, sin transform en hover**. Slot header `.card__header` (`.h3` + acción texto, hairline debajo). `.card--sunken` para contexto de solo lectura. `.card--rail-info|alert|warning`: borde izquierdo 3 px. Las tarjetas no se anidan y no son el contenedor por defecto en staff (lo son tablas, `<dl>` y reglas). Eliminar `.glass-card`.

### Field `.field`
`.field__label` arriba (`.small` 600 staff / `.lead` 500 kiosco); `(obligatorio)` en texto en kiosco, asterisco en staff; `.field__help` `.small .muted`; `.field__error` `.small --red-700` + `AlertCircle` 16, `role="alert"`, `aria-describedby`. Input: `--surface`, borde 1.5 px `--hairline-strong`, `--r-lg` 64 px padding 0 20 px kiosco / `--r-sm` 40 px padding 0 12 px staff; hover borde `--navy-600`; focus borde `--teal-700` + outline; error borde `--red-500` + fondo `--red-50`; disabled `--surface-sunken`. Textarea auto-grow (`field-sizing: content` + fallback JS), slot `.field__corner` para dictado. `.field--mono` (vitales, teléfono, PIN): `.num`, sufijo `.field__unit` (`mmHg`, `kg`). `.field--search`: sin borde, solo `border-bottom` 1 px `--hairline-strong`, icono `Search` 20 px. `<select>` nativo solo en staff, con chevron custom; en kiosco todo select es `OptionGroup`.

### OptionGroup `.optgroup` (radio de píldoras para Likert)
`<fieldset>` + `<legend>` = pregunta; cada opción `<label class="option">` que envuelve `<input type="radio" class="visually-hidden">`. Vertical: gap 12 px, `min-height` 64 px kiosco / 44 px staff, ancho completo, `--r-lg` / `--r-sm`, `--surface`, borde 1.5 px `--hairline-strong`, **sin sombra en reposo**, texto `.lead` 500 alineado a la izquierda, padding 0 20 px; anillo 24 px (2 px `--sand-400`) a la izquierda; valor numérico `.option__value .num .muted` junto al anillo en instrumentos puntuados (`0`…`5`). Estados: `:hover` borde `--navy-600`; `:active` `--shadow-press` + `scale(.985)` 80 ms; `:has(:checked)` borde 2 px `--teal-700` con ring interior 1 px `--teal-50` (no salta), fondo `--teal-50`, anillo relleno `--teal-700` con check blanco trazado en 200 ms, texto `--navy-800` 600; `:focus-visible` outline. `.optgroup--grid-6`: `grid-template-columns: repeat(6, 1fr)`, celdas 72 px cuadradas, numeral Fraunces. Prop `autoAdvance` (solo kiosco single-select): 350 ms → `onNext`; `Atrás` restaura la selección. Teclado: flechas mueven, espacio selecciona.

### SymptomToggle `.toggle`
`<label>` con checkbox oculto; ancho completo, `min-height` 72 px kiosco / 48 px staff, `--r-lg` / `--r-sm`, `--surface`, borde 1.5 px `--hairline-strong`. Izquierda icono 28 px `--teal-600` solo en motivos del kiosco (`Droplets` vejiga, `CircleDot` próstata, `Heart` salud sexual, `Beaker` riñón); texto `.lead` 500 hasta 2 líneas + `.toggle__gloss .small .muted` para la glosa clínica; derecha checkbox 28 px `--r-xs` que se rellena `--teal-700` con check blanco. Seleccionado: borde 2 px `--teal-700`, fondo `--teal-50`. Fila `exclusive` (`Ninguno`) limpia las demás. Cuando abre una rama, hint `.small .muted` `Le preguntaremos más sobre esto`. Etiquetas ≤ 60 caracteres, **movidas a constantes** antes de editar copy (son claves en `activeSteps` y `extractRedFlags`).

### Stepper `.stepper` / Progress `.progress`
Kiosco: barra segmentada por sección activa (Datos · Motivo · Síntomas · Preguntas · Antecedentes · Revisión), 6 px, `--r-pill`, gap 6 px, track `--hairline-strong`, fill `--teal-700`; el segmento actual se llena por `ítemsRespondidos / ítemsActivosDeLaSección` (progreso por ítems, nunca retrocede visualmente; segmentos entran/salen por opacidad 240 ms). `.eyebrow` encima: `SECCIÓN 2 DE 5 · MOTIVO DE LA VISITA`. `role="progressbar" aria-valuetext="Sección 2 de 5"`; live region anuncia el cambio. Modo asistido: rail vertical clicable 44 px por fila, numeral `.num`, actual con regla izquierda 3 px `--navy-700`, hecho con `CheckCircle` 16 `--teal-700`. Staff (drawer de cita): stepper de 4 puntos numerados 24 px.

### Badge `.tag` / StatusChip `.chip`
- `.tag` (esferas, doctor): 24 px staff / 32 px kiosco, `--r-xs`, borde 1 px `--hairline-strong`, fondo transparente, `.small` 500 `--ink-2`; sin icono. `.tag--navy` (fondo `--navy-100`, texto `--navy-800`) solo para esferas en la cola.
- `.chip` (estado de flujo, único elemento con `--r-pill` aparte de avatar): 24 / 32 px, padding 0 10 px, `.small` 600, punto 8 px opcional. Tonos: `.chip--info` (`--teal-50` / `--teal-800`) `En espera`, `Programada`; `.chip--success` (`--green-50` / `--green-800`) `Atendido`, `Completada`; `.chip--warning` (`--amber-50` / `--amber-800`) `Prefiere Dr. X`, `Moderado`; `.chip--danger` (`--red-50` / `--red-700`) `Severo`, `Cancelada`, `No asistió`; `.chip--neutral` (`--navy-100` / `--navy-800`).
- `.badge-count` (sidebar): círculo 20 px `--navy-700`, numeral blanco `.num`.
- Bandera roja en tablas: punto 8 px `--red-500` + conteo `.num`, nunca chip. Máximo un chip relleno por fila.

### ScoreBar `.scorebar`
Grid `140px 1fr auto`. Izquierda: `.small` 600 nombre + una línea `.muted` (`IPSS · síntomas prostáticos`). Centro: track 10 px `--surface-sunken` `--r-pill` con ticks 1 px `--sand-400` en los cortes tomados de `utils/questionnaires.ts` (IPSS 8/20; NIH-CPSI 10/19; ICIQ-UI SF 6/13/19; IIEF-5 8/12/17/22 invertido; PEDT 9/11; FSFI-6 20 invertido; O'Leary-Sant ICSI 0-20 e ICPI 0-16 como dos barras; ADAM = chip `Positivo`/`Negativo`), fill coloreado por banda (`--severity-*`), ancho anima 400 ms una vez por `patient id`. Derecha: numeral Fraunces `.num` `18` + `/35` `.muted` + `.chip` con la interpretación. Tooltip con subpuntajes NIH-CPSI. Nunca visible para el paciente. Umbrales nunca hardcodeados en el componente.

### Drawer `.drawer` / Modal `.modal`
Ambos `<dialog>` con `showModal()`; `::backdrop` `--overlay`; `@starting-style` + `transition-behavior: allow-discrete` con fallback de clase `.is-open` para iPadOS < 17.4. Drawer: anclado derecha, `min(var(--drawer-w), 100vw - 64px)` (720 en expediente), altura completa, `--surface`, `--shadow-sheet`, `border-left` 1 px `--hairline-strong`; header 64 px con `.h2` Fraunces + meta + botón cerrar; body scroll padding 24 px; footer 72 px sticky con acciones a la derecha y hairline arriba. Portrait tablet: ancho completo. Modal: centrado, `max-width` 480 px kiosco / 440 px staff, `--r-lg` / `--r-md`, padding 28 px, `.h2`, cuerpo, acciones (secondary izquierda, primary/danger derecha; destructivo requiere teclear `ELIMINAR`). Reemplaza el modal de consulta (ahora ruta) y todo `confirm()`.

### Toast `.toast` (+ `ToastProvider` / `useToast()`, ~60 líneas)
Abajo-centro en kiosco (sobre la barra de acción), abajo-derecha en staff; `max-width` 420 px, `--surface`, borde 1 px `--hairline-strong`, `--r-md`, `--shadow-pop`, rail izquierdo 3 px por tono (info `--teal-600`, success `--green-500`, error `--red-500`), icono 20 px, texto `.body`, acción opcional (`Reintentar`), cerrar. Auto-cierre 5 s (info/success); errores persisten. Máximo 3 apilados, gap 8 px. `role="status"` / `role="alert"`. Reemplaza cada `alert()`.

### EmptyState `.empty`
Centrado, padding 64 px 24 px, `max-width` 360 px: icono 48 px `stroke 1.5` `--navy-300` en círculo 72 px `--surface-sunken` (`Armchair` sala, `CalendarX` agenda, `FolderOpen` pacientes, `BookOpen` investigación), `.h3`, una frase `.muted` que dice cuándo aparecerá contenido, botón secondary opcional. Sin ilustraciones, sin copy de desarrollador.

### Skeleton `.skeleton`
Bloques `--surface-sunken` `--r-sm`, alturas reales (líneas 14 px a 92/78/85 %, avatar 36, fila 48, track 6). Animación: **pulso de opacidad** 1 → .55 → 1, 1.6 s, aplicado al contenedor; **sin shimmer**. Visible solo si la carga supera 300 ms (`animation-delay: 300ms` con `opacity: 0` inicial). El skeleton de tabla reutiliza la cabecera real. Nunca más de 8 s sin mensaje de error.

### Avatar `.avatar`
Círculo 36 px staff (28 en tablas, 48 en header de consulta, 56 en revisión kiosco), iniciales `.small` 600. Fondo `--navy-100` + texto `--navy-800` para pacientes y recepción; `--navy-700` + blanco para doctores. Borde 1 px `--hairline-strong`. **Sin tintes por hash**, sin fotos, sin anillos.

### Table `.table` / Agenda slot `.slot`
Tabla ancho completo, contenedor `--surface` con borde 1 px `--hairline-strong` `--r-md` `overflow: hidden`; header `--surface-sunken` `.eyebrow`, 36 px, hairline abajo; filas 48 px, divisores 1 px `--hairline`, celdas `12px 16px`, numéricas `.num` a la derecha; hover `--navy-50`; seleccionada `--navy-50` + rail izquierdo 3 px `--teal-600`; fila `tabindex=0`, `Enter` abre; sin cebra, sin líneas verticales; `Mostrar más` en lugar de paginación. `.slot` (agenda): ver 3.2.

### SegmentedControl `.segmented`
Radios reales; contenedor `--surface-sunken` `--r-sm` padding 3 px; opciones 34 px `.933rem` 500 `--ink-2`; marcada `--surface` + `--navy-800` 600 + borde 1 px `--hairline-strong` (sin sombra); el fondo se desliza 200 ms (`reduced-motion`: instantáneo). Usos: Login, tabs del Drawer de paciente, filtros de staff. Reemplaza los botones-tab subrayados de `DashboardPage`.

### Callout `.callout`
`--r-md`, padding 16 px, rail izquierdo 3 px, icono 20 px, título 600 + cuerpo. `.callout--alert` (`--red-50`, rail `--red-500`, texto `--red-700`) banderas rojas con lista; `.callout--info` (`--teal-50`, rail `--teal-600`, texto `--teal-800`) `Resumen generado automáticamente. Verifique con el paciente.`; `.callout--warning` (`--amber-50`) resumen faltante con botón `Regenerar`.

### Kbd `.kbd`
`.micro .num`, `--surface-sunken`, borde 1 px `--hairline`, `--r-xs`, padding 1 px 5 px; solo en tooltips de staff.

---

## 5. Sistema de movimiento

Principio: **algo se mueve solo porque cambió un estado**. Transforms limitados a opacidad y ≤ 24 px de translate (más el `scale(.985)` de press). Sin springs, sin rebote, sin bucles salvo skeleton, punto de grabación y loader de 3 puntos.

| Qué | Cómo |
|---|---|
| Cambio de paso (kiosco) | Sale: opacidad 1→0, `translateX(0 → -16px)` 160 ms `--ease-in`. Entra: opacidad 0→1, `translateX(24px → 0)` 240 ms `--ease-out`, delay 60 ms. Atrás invierte el eje. Wrapper con `key={stepIndex}` + clase; foco al `h2`; scroll a top instantáneo. |
| Press y selección de píldora | `:active` `scale(.985)` + `--shadow-press` 80 ms; borde/fondo 160 ms `--ease-standard`; check SVG `stroke-dashoffset` 200 ms `--ease-out`. **Sin overshoot** en el anillo. |
| Progreso y ScoreBar | Ancho 400 ms `--ease-out`; segmento que aparece/desaparece por rama: opacidad 240 ms. ScoreBar solo al montar. |
| Botones | Fondo/borde 160 ms; active `translateY(1px)` 80 ms; loading: 3 puntos con pulso de opacidad 900 ms, stagger 150 ms. |
| Drawer / Modal | Scrim opacidad 240 ms; drawer `translateX(24px → 0)` + opacidad 240 ms `--ease-out`, cierre 160 ms `--ease-in`; modal opacidad + `translateY(8px → 0)` 200 ms (sin scale). Scroll del body bloqueado. |
| Filas y toasts | Nueva fila en cola (realtime): opacidad 0→1 240 ms y fondo `--teal-50 → --surface` en 1.2 s; render inicial escalona máximo 6 filas × 40 ms. Toast: `translateY(12px)` + opacidad 240 ms, salida 160 ms; el apilado reacomoda transform 200 ms. Segmented: 200 ms. |
| Éxito e inactividad | Círculo entra en 240 ms, check se traza 600 ms `--ease-out`, texto aparece 240 ms tras 300 ms. Anillo de cuenta regresiva 20 s lineal. Grabación: punto 8 px `--red-500` opacidad .4↔1 cada 1 s. |
| Nivel de página en staff | Sin transiciones de ruta; solo el swap skeleton → contenido a 200 ms de opacidad. |
| Hover | Solo color de fondo/borde a 160 ms. Nada se eleva, escala ni rota. |

```css
/* src/styles/motion.css */
@keyframes step-in  { from { opacity: 0; transform: translateX(24px);  } to { opacity: 1; transform: none; } }
@keyframes step-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(-16px); } }
@keyframes step-in-back  { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
@keyframes step-out-back { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(16px); } }
@keyframes fade-in  { from { opacity: 0; } to { opacity: 1; } }
@keyframes rise-in  { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes drawer-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
@keyframes modal-in  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes skeleton-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
@keyframes rec-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
@keyframes dots { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }
@keyframes row-arrive { from { background-color: var(--teal-50); } to { background-color: var(--surface); } }
@keyframes draw { to { stroke-dashoffset: 0; } }

.step-enter        { animation: step-in  var(--dur-base) var(--ease-out) 60ms both; }
.step-exit         { animation: step-out var(--dur-fast) var(--ease-in) both; }
.step-enter--back  { animation: step-in-back  var(--dur-base) var(--ease-out) 60ms both; }
.step-exit--back   { animation: step-out-back var(--dur-fast) var(--ease-in) both; }

.drawer[open]  { animation: drawer-in var(--dur-base) var(--ease-out); }
.modal[open]   { animation: modal-in  var(--dur-base) var(--ease-out); }
.drawer::backdrop, .modal::backdrop { background: var(--overlay); animation: fade-in var(--dur-base) var(--ease-out); }
.toast         { animation: rise-in var(--dur-base) var(--ease-out); }
.toast.is-leaving { transition: opacity var(--dur-fast) var(--ease-in); opacity: 0; }

.option, .toggle, .btn, .table tr, .nav__item { transition: background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard); }
.option:active, .toggle:active { transform: scale(.985); box-shadow: var(--shadow-press); transition-duration: var(--dur-instant); }
.btn:active { transform: translateY(1px); box-shadow: var(--shadow-press); transition-duration: var(--dur-instant); }
.option__check path { stroke-dasharray: 24; stroke-dashoffset: 24; }
.option:has(:checked) .option__check path { animation: draw 200ms var(--ease-out) forwards; }

.progress__fill, .scorebar__fill { transition: width var(--dur-slow) var(--ease-out); }
.stepper__segment { transition: opacity var(--dur-base) var(--ease-standard); }
.segmented__thumb { transition: transform 200ms var(--ease-standard); }
.table tr.is-new { animation: fade-in var(--dur-base) var(--ease-out), row-arrive 1.2s var(--ease-standard); }
.skeleton { animation: skeleton-pulse 1.6s ease-in-out infinite; }
.skeleton--delayed { opacity: 0; animation: fade-in 1ms linear 300ms forwards, skeleton-pulse 1.6s ease-in-out 300ms infinite; }
.rec-dot { animation: rec-pulse 1s ease-in-out infinite; }
.dots > i { animation: dots 900ms ease-in-out infinite; } .dots > i:nth-child(2) { animation-delay: 150ms; } .dots > i:nth-child(3) { animation-delay: 300ms; }
.success-check circle { stroke-dasharray: 176; stroke-dashoffset: 176; animation: draw var(--dur-reveal) var(--ease-out) forwards; }
.success-check path   { stroke-dasharray: 48;  stroke-dashoffset: 48;  animation: draw 320ms var(--ease-out) 400ms forwards; }

/* Reducción de movimiento: preferencia del SO o ajuste del kiosco (localStorage → <html data-reduced-motion>) */
@media (prefers-reduced-motion: reduce) { :root { --rm: 1; } }
:root[data-reduced-motion] { --rm: 1; }
@media (prefers-reduced-motion: reduce) { .rm-scope, * { animation-duration: 1ms !important; transition-duration: 1ms !important; } }
:root[data-reduced-motion] *, :root[data-reduced-motion] *::backdrop { animation-duration: 1ms !important; transition-duration: 1ms !important; }
@media (prefers-reduced-motion: reduce) { .step-enter, .step-exit, .step-enter--back, .step-exit--back, .drawer[open], .modal[open], .toast { transform: none !important; } .skeleton, .skeleton--delayed { animation: none; opacity: .8; } .rec-dot { animation: none; } .success-check circle, .success-check path { stroke-dashoffset: 0; animation: none; } .countdown-ring { display: none; } .countdown-text { display: inline; } html { scroll-behavior: auto; } }
```

Ajuste `Reducir animaciones` en el pie del kiosco (para la asistente) escribe `localStorage.reducedMotion=1` y aplica `data-reduced-motion` en `<html>`.

---

## 6. Reglas anti-plantilla-IA (qué borrar del UI actual)

1. **Borrar** el hero navy con gradiente y patrón de puntos teal de `LandingPage`; la landing es papel con saludo alineado a la izquierda y dos filas de libro mayor.
2. **Borrar** `.text-gradient` y todo título con gradiente; los títulos son `--navy-800` sólido.
3. **Borrar** `.glass-card`, su `:hover` con `translateY` y crecimiento de sombra; una tarjeta es un borde de 1 px sobre `--surface`.
4. **Reemplazar** Montserrat/Poppins (línea 10 de `index.html`) por Fraunces + Atkinson Hyperlegible Next; nada de peso 800, nada de títulos en mayúsculas.
5. **Borrar** `--radius: 16px` global; usar la escala por familia (4/6/10/14); nada más redondo que 14 px salvo `.chip`, `.avatar`, `.badge-count`.
6. **Borrar** emojis (`🩺 Prefiere:`, ✅) en badges y texto; lucide 16/20/28 px `stroke 1.75`, y solo donde significan algo. Sin iconos junto a cada título, sin `.option-icon` en cuadrado tintado.
7. **Migrar** los 354 `style={{}}` a clases con tokens; agregar un check en `package.json` (`"lint:styles": "grep -rn 'style={{' src --include=*.tsx | grep -E 'padding|margin|display|grid|flex|width|gap' && exit 1 || exit 0"`) para que no vuelvan.
8. **Borrar** `alert()`, `confirm()`, `prompt()`: Toast para resultados, Modal para destructivos, error inline para validación.
9. **Borrar** `<select>` y `<input type=range>` en cuestionarios; cada ítem puntuado es `OptionGroup` con la etiqueta completa; nada de tiras horizontales 0-5 con etiquetas diminutas en el kiosco.
10. **Borrar** las tabs-botón subrayadas de `DashboardPage`; navegación = sidebar con rutas; sub-navegación = `SegmentedControl`.
11. **Borrar** listas de tarjetas apiladas para datos tabulares; sala de espera, agenda y pacientes son tablas/ledgers con numerales tabulares.
12. **Borrar** spinners `Loader2` de página completa; Skeleton con la forma del contenido tras 300 ms; loader de 3 puntos dentro de botones.
13. **Renombrar** "Resumen de Inteligencia Artificial" con icono `Activity` → `Resumen previo (IA)` en un `.callout--info` con caption `Generado automáticamente · revisar`. Sin sparkles, sin robots.
14. **Borrar** copy de desarrollador: `(Abra el formulario en otra pestaña para simular la tablet)`, `Ej. Dr. Gregory House`, `Agendar Cita (Interno)`; placeholders con ejemplos locales (`Ej. 667 123 4567`, `TA 120/80`).
15. **Borrar** los botones verde WhatsApp y teal Doctoralia del kiosco; enlaces de texto en el pie de `/schedule`.
16. **Borrar** sombras de color en botones (`0 4px 14px teal`), `scale(1.02)` en hover, `rotate(-5deg)` en iconos.
17. **Borrar** cajas rellenas de color para secciones informativas (`#fef2f2`, blanco al 50 %); usar `.eyebrow` + hairline y, para banderas rojas, un rail izquierdo de 3 px.
18. **Reemplazar** `public/favicon.svg` (rayo morado de Vite, `#863bff`) por el logomark; `<title>` por ruta (`Sala de espera · Urología Funcional`).
19. **Borrar** grids `auto-fit` de tarjetas iguales; los layouts staff son asimétricos (400 px + fluido, 5/7).
20. **Borrar** `animate-fade-in` / `stagger-1..4` en cada elemento; el movimiento existe solo donde lo lista la sección 5.
21. **Prohibido** placeholder como etiqueta; **prohibido** un solo `px` de tamaño de fuente en componentes (dos raíces rem).
22. Microcopy concreto y sin exclamaciones: `Entregue la tableta a la asistente`, no `¡Su registro ha sido enviado exitosamente!`. Timestamps `hace 14 min` / `Jueves 19 sep · 11:42`, nunca `toLocaleString()` crudo.
23. Un solo color relleno por vista (el primario navy); todo lo demás es contorno, gris o un punto de 8 px.
24. El PDF tiene su propia hoja `@media print`: fondo blanco, `logo-mark` mono, sin chips ni sombras.

---

## 7. Tratamiento del logo

Activos existentes y verificados: `public/logo.png` (1080×1080, ~60 % de padding, **dejar de usar en pantalla**), `public/logo-mark.png` (242×248, círculo partido teal/navy), `public/logo-lockup.png` (402×412, marca + wordmark).

1. **Usos**: `logo-mark.png` a 32 px (sidebar staff, header de PDF), 40 px (header del kiosco en modo asistido), 96 px (login). `logo-lockup.png` solo en la landing del kiosco (160 px), login (180 px) y cabecera del PDF (140 px). Pedir el vector al doctor para producir `logo-mark.svg` y `favicon.svg`; mientras tanto exportar `favicon-32.png`, `apple-touch-icon.png` 180 px sobre `--sand-50` desde `logo-mark.png`.
2. **El wordmark se conserva como imagen**; no se retipea en Fraunces ni Atkinson (las capitales geométricas son parte de la identidad). El nombre del doctor sí es texto: `Dr. Miguel Ángel Sandoval Valle · Urología` en `.small .muted` bajo el lockup.
3. **Reglas**: nunca `filter: drop-shadow`, nunca sobre navy o teal (la mitad navy desaparece), nunca sobre gradientes o fotos, nunca recolorear, nunca estirar a 400 px de hero. Espacio libre mínimo = el radio del círculo. Tamaño mínimo 24 px.
4. Los tokens `--teal-600 #078A86` y `--navy-700 #273A5E` son exactamente los pigmentos de la marca; el UI y el logo comparten tinta. El único eco del logo en el sistema: el rail activo del sidebar en `--teal-600`.
5. PDF: `logo-mark.png` 32 px + lockup en escala de grises no; usar mark a color (imprime bien) + línea `Dr. Miguel Ángel Sandoval Valle · Urología · Culiacán, Sinaloa` y regla hairline-strong debajo.

---

## 8. Dependencias npm

**Ninguna obligatoria.** Todo es CSS plano (custom properties, grid, `<dialog>`, `@starting-style` con fallback de clase, `prefers-reduced-motion`) + React 19 + `lucide-react` y `react-markdown` ya instalados.

| Paquete | Estado | Justificación |
|---|---|---|
| `@fontsource-variable/fraunces` + `@fontsource/atkinson-hyperlegible-next` | Opcional, fase 2 | Solo si el kiosco debe funcionar sin depender de Google Fonts en el Wi-Fi de la clínica; hasta entonces el `<link>` de la sección 1 basta, con `<link rel="preload">` de los dos woff2 tras la primera carga. |
| `motion` (mini API, ~5 kB) | Opcional, no recomendado ahora | Solo si se exigen animaciones de salida en filas de lista; el swap de paso lo resuelve un hook `useStepTransition` de ~30 líneas. |
| Tailwind, MUI/Chakra/shadcn, framer-motion completo, react-hot-toast | **No agregar** | Pelean contra el sistema de tokens y devuelven el look genérico. |

`html2pdf.js` se mantiene solo hasta que exista la ruta `/expediente/:id/print` + `window.print()`; después se retira.

---

## 9. Riesgos que este sistema hereda (para el plan de lógica)

- Verificar que `Atkinson Hyperlegible Next` resuelve en Google Fonts; el fallback pierde 500/600.
- Dos raíces rem obligan a eliminar cada `px` de fuente en los cinco archivos de pasos (~1200 líneas).
- Acortar etiquetas de síntomas cambia claves usadas por `activeSteps` y `extractRedFlags`: constantes primero, copy después.
- Consulta como ruta cambia la propiedad del estado (guard de auth en layout route, borrador por id, inserción de Whisper en caret).
- Realtime en `patient_forms` depende de RLS/anon key; si no, polling 30 s etiquetado honestamente.
- Verificar la versión de Chrome de la tableta real antes de confiar en `@starting-style`; el fallback de clase debe existir desde el día uno.
- Auto-avance de 350 ms probar con pacientes reales de 60+; el ajuste para desactivarlo debe existir en el primer despliegue.
- `.env` con llaves de OpenAI/Perplexity está en git y las llamadas corren en el navegador del kiosco: `Regenerar` e `Investigar` hacen visible la exposición; planear un proxy.