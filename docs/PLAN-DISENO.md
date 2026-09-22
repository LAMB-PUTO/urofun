# Plan 2 — Diseño visual y movimiento · Urología Funcional

**Fecha:** 19 de septiembre de 2026 · **Dirección elegida:** "Consultorio Cálido" (ganadora 3/3 en el panel de jueces) con injertos de "Folio" (editorial clínico) e "Instrumento" (herramienta de precisión).
**Anexo con la especificación completa:** [anexos/sistema-de-diseno-detallado.md](anexos/sistema-de-diseno-detallado.md) (tokens listos para pegar, specs de cada componente, sistema de movimiento con keyframes, reglas anti-plantilla).

---

## 1. Por qué hoy parece una app hecha con IA barata

| Síntoma | Dónde |
|---|---|
| Poppins + Montserrat, títulos con gradiente teal→navy, peso 800. | `index.html`, `.text-gradient` |
| Todo es una "glass-card" blanca de 16 px de radio con sombra y `translateY` al hover, incluso los formularios. | `.glass-card` |
| Landing con hero navy degradado y patrón de puntos, logo PNG de 400 px con 60 % de aire, tres tarjetas iguales con icono en cuadro tintado. | `LandingPage` |
| 354 `style={{}}` inline con márgenes al azar (1 / 1.5 / 2 / 3 rem). | 12 archivos |
| Emojis en badges (🩺), `alert()` / `confirm()` para todo, spinners de página completa. | `DashboardPage` |
| Likert con `<select>`, checkboxes de 13 px y sliders sin valor en una tablet para pacientes mayores. | pasos de cuestionario |
| Tabs como botones subrayados; listas de tarjetas apiladas para datos tabulares; resumen IA como muro de texto en cada tarjeta. | `DashboardPage` |
| Botones con sombra de color y `scale(1.02)`; iconos que rotan; `animate-fade-in` en cada elemento con stagger. | `index.css` |
| Copy de desarrollador ("Abra el formulario en otra pestaña para simular la tablet", "Dr. Gregory House"). | varios |

---

## 2. Dirección: papel y tinta

Dos superficies con un solo lenguaje:

- **Kiosko** (tablet 10-11", pacientes de 50 a 75 años): raíz 19 px, una pregunta por pantalla, pregunta en **Fraunces** (serif suave), todo lo demás en **Atkinson Hyperlegible Next**, objetivos táctiles de 64 px, trato de "usted", sin exclamaciones.
- **Staff** (laptop 13-15"): raíz 15 px, mismo papel y tinta con el doble de densidad; tablas tipo libro mayor con numerales tabulares, no pilas de tarjetas; sidebar con rutas.

Reglas de color: el **navy** (`#273A5E`) es la tinta y la acción primaria; el **teal** (`#078A86`) se reserva para "seleccionado / activo / enlace / foco" y nunca se usa como texto pequeño sobre blanco. Fondo "papel" `#F6F2EC`, superficies blanco cálido `#FFFDFA`, hairlines arena. Semánticos: rojo para banderas y "Severo", ámbar para "Moderado", verde para "Leve" y "Atendido".

---

## 3. Tipografía

```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300..700,0..100&family=Atkinson+Hyperlegible+Next:wght@400;500;600;700&display=swap" rel="stylesheet">
```

| Rol | Familia | Uso |
|---|---|---|
| Display | Fraunces 400-600, `SOFT` 50 | Pregunta del kiosko, H1/H2 del staff, nombre del paciente en consulta, numerales grandes (puntajes, hora de agenda) |
| UI | Atkinson Hyperlegible Next 400-700 | Cuerpo, etiquetas, opciones, botones, tablas, notas |

Reglas: Fraunces nunca en negrita > 600, nunca en mayúsculas, nunca con gradiente. Un solo texto en mayúsculas en todo el sistema: la caption `.eyebrow`. Todo número comparable lleva `.num` (tabular). Nada por debajo de 16.5 px en el kiosko.

---

## 4. Tokens

Archivo: `src/styles/tokens.css` (bloque `:root` completo en el anexo §2). Escalas: navy 50-900, teal 50-800, sand 50-900, tinta 3 niveles, semánticos rojo/ámbar/verde; espaciado base 4; radios **4 / 6 / 10 / 14** (nada más redondo salvo chips y avatares); tres sombras (popover, sheet, pressed) y **ninguna en tarjetas**; escala tipográfica en rem con dos raíces (`[data-surface="kiosk"]` 19 px, `[data-surface="staff"]` 15 px); duraciones 80 / 160 / 240 / 400 / 600 ms y tres curvas.

---

## 5. Layouts

### Kiosko
- **Landing:** franja superior con `logo-lockup.png` a 160 px y fecha/hora; saludo `Buenos días.` en Fraunces; dos filas tipo libro mayor de 112 px (`01 Es mi primera visita` / `02 Ya he venido antes`) + fila discreta `Tengo un código`; pie con enlace ghost `Personal de la clínica`. Sin WhatsApp ni Doctoralia (viven en `/schedule`).
- **Wizard:** header 80 px (Atrás / stepper segmentado por sección / Ayuda), región de scroll con columna de 34 rem (`eyebrow` → pregunta → helper → control), barra de acción sticky de 104 px con un solo botón primario `Siguiente` (deshabilitado, no oculto, con la razón encima) y `Guardado en esta tableta`.
- **Tipos de pantalla:** datos (un grupo por pantalla; fecha de nacimiento como Día/Mes/Año con edad en vivo; sexo como dos píldoras), síntomas (`SymptomToggle`), Likert (`OptionGroup` vertical, un ítem por pantalla, auto-avance 350 ms desactivable), conteos 0-5 (grid 6-up de 72 px), molestia 0-10 (grid 6+5), antecedentes, revisión, envío (check dibujado, cuenta regresiva 20 s).
- Inactividad 180 s → "¿Sigue ahí?"; errores inline con foco al campo; toast solo por fallo de red.

### Staff
- **AppShell:** grid `240px 1fr`, sidebar arena hundida con logo-mark 32 px, rol, nav por rutas (`/panel/espera`, `/panel/agenda`, `/panel/pacientes`, `/panel/investigacion`, `/panel/registrar`, `/panel/consulta/:id`, `/panel/doctores`), bloque de usuario con Salir. Rail de 64 px entre 1100-1199 px; drawer bajo 800 px.
- **Cabecera de página:** H1 Fraunces con regla hairline debajo (firma del sistema), indicador `En vivo · actualizado hace 12 s`, una sola acción primaria por página.
- **Sala de espera:** master/detail (lista de 400 px con filas de 72 px: avatar de iniciales, nombre, `63 a · Masculino · hace 14 min`, chips de esfera, punto rojo si hay banderas) + detalle con banderas primero, `Resumen previo (IA)` con caption `Generado automáticamente · revisar`, ScoreBars, antecedentes en `<dl>`.
- **Consulta:** grid 5/7; izquierda sticky con contexto; derecha nota NOM-004 con mini-nav scroll-spy, signos vitales en 6 campos mono con unidad, textareas auto-grow con `Mic` por campo, barra inferior `Borrador guardado 11:52 · Guardar borrador · Terminar consulta`.
- **Agenda:** tira de 7 días + libro mayor de slots de 56 px con hora en Fraunces; slot vacío con borde discontinuo `Disponible`; ocupado con avatar, nombre, teléfono, chip de estado y menú de acciones; línea `ahora`.
- **Pacientes:** buscador subrayado + chips de filtro + tabla; drawer de 720 px con `Notas · Cuestionarios · Archivos`, `Exportar PDF`, dropzone.
- **Investigación:** 320 px (pregunta, presets, historial) + columna de lectura de 42 rem con citas numeradas y `Fuentes`.

---

## 6. Componentes (clases en `src/styles/components.css`)

Button (`primary` navy / `secondary` contorno / `ghost` / `danger` / `link`; tamaños kiosk 64 / kiosk-sm 56 / md 40 / sm 32; loading con 3 puntos; disabled sin opacidad) · Card (borde 1 px, sin sombra, sin hover) · Field (etiqueta arriba, ayuda, error inline `role=alert`, variantes `mono` con unidad y `search` subrayado) · OptionGroup (radio de píldoras, anillo + check trazado, `grid-6`) · SymptomToggle (checkbox de 28 px, glosa clínica, fila `Ninguno` exclusiva) · Stepper (segmentos por sección con progreso por ítems) · Tag / StatusChip (único elemento pill; tonos info/success/warning/danger/neutral) · ScoreBar (track con ticks en los cortes oficiales, fill por severidad, numeral Fraunces, chip de interpretación) · Drawer y Modal (`<dialog>`, destructivo requiere teclear) · Toast (`useToast`, máximo 3, errores persisten) · EmptyState (icono lucide en círculo arena, una frase útil) · Skeleton (pulso de opacidad tras 300 ms, sin shimmer) · Avatar (iniciales, sin tintes por hash) · Table (cabecera eyebrow, filas 48 px, hover arena, sin cebra) · SegmentedControl (radios reales, thumb deslizante) · Callout (rail izquierdo 3 px: alerta / info / aviso) · Kbd.

---

## 7. Movimiento

Principio: algo se mueve solo porque cambió un estado. Sin springs, sin rebote, sin bucles salvo skeleton, punto de grabación y loader.

| Qué | Cómo |
|---|---|
| Cambio de paso (kiosko) | Sale 160 ms (`opacity`, `-16px`), entra 240 ms (`24px → 0`) con 60 ms de retraso; "Atrás" invierte el eje; foco al `h2`; scroll a top instantáneo. |
| Píldoras y toggles | `:active` `scale(.985)` + sombra pressed 80 ms; borde/fondo 160 ms; check SVG trazado 200 ms. |
| Progreso y ScoreBar | Ancho 400 ms; ScoreBar solo al montar. |
| Drawer / Modal | Scrim 240 ms; drawer `translateX(24px)`; modal `translateY(8px)`; cierre 160 ms. |
| Filas nuevas (realtime) | Fade 240 ms + fondo teal-50 → superficie en 1.2 s; render inicial escalona máximo 6 filas × 40 ms. |
| Éxito | Círculo 240 ms + check trazado 600 ms; anillo de cuenta regresiva 20 s lineal. |
| Staff | Sin transiciones de ruta; skeleton → contenido 200 ms. Hover solo color. |
| Reducción | `prefers-reduced-motion` y ajuste `Reducir animaciones` en el kiosko → todo a 1 ms, sin transforms. |

Keyframes y clases en `src/styles/motion.css` (anexo §5).

---

## 8. Reglas anti-plantilla (qué se borra)

1. Hero navy con gradiente y puntos; landing = papel con saludo y filas.
2. `.text-gradient` y títulos con gradiente.
3. `.glass-card`, su hover y su sombra; tarjeta = borde de 1 px.
4. Montserrat/Poppins; nada de peso 800 ni títulos en mayúsculas.
5. `--radius: 16px` global.
6. Emojis en UI; iconos lucide solo donde significan algo; sin `.option-icon` tintado.
7. Los 354 `style={{}}` de layout (script `lint:styles` en `package.json` para que no vuelvan).
8. `alert()` / `confirm()` / `prompt()`.
9. `<select>` y `<input type=range>` en cuestionarios.
10. Tabs-botón subrayadas.
11. Tarjetas apiladas para datos tabulares.
12. Spinners de página completa.
13. "Resumen de Inteligencia Artificial" con icono `Activity` → `Resumen previo (IA)` en callout con caption.
14. Copy de desarrollador y placeholders ajenos (`Ej. 667 123 4567`, `TA 120/80`).
15. Botones WhatsApp/Doctoralia en el kiosko.
16. Sombras de color, `scale(1.02)`, `rotate(-5deg)`.
17. Cajas rellenas de color para secciones informativas.
18. `favicon.svg` de Vite; `<title>` por ruta.
19. Grids `auto-fit` de tarjetas iguales.
20. `animate-fade-in` / `stagger-*` en cada elemento.
21. Placeholder como etiqueta; `px` de fuente en componentes.
22. Microcopy con exclamaciones; timestamps crudos de `toLocaleString()`.
23. Más de un color relleno por vista.
24. PDF sin hoja de impresión propia.

---

## 9. Logo

`public/logo.png` (1080², 60 % de aire) deja de usarse en pantalla. Nuevos activos recortados: `logo-lockup.png` (402×412, marca + wordmark) para landing (160 px), login (180 px) y PDF (140 px); `logo-mark.png` (242×248) para sidebar (32 px), favicon y kiosko asistido. Nunca con `drop-shadow`, nunca sobre navy/teal, nunca estirado. Pedir el vector al doctor para `logo-mark.svg`.

---

## 10. Fases y estado

| Fase | Entregable | Estado |
|---|---|---|
| A Fundamentos | Fuentes, `tokens.css`, `base.css`, `motion.css`, favicon/logo, `<title>` por ruta. | ✅ |
| B Primitivas | `components.css` + componentes React (`src/components/ui`). | ✅ |
| C Kiosko | Landing, wizard, OptionGroup/SymptomToggle, stepper, pantalla final, inactividad. | ✅ |
| D Staff shell | Sidebar, cabeceras, login, sala de espera master/detail. | ✅ |
| E Consulta y agenda | Grid 5/7, signos vitales, dictado por campo, agenda libro mayor, pacientes tabla + drawer. | ✅ |
| F Investigación y print | Página/drawer de Perplexity, `print.css`, ruta de impresión. | ✅ |
| G Verificación | Capturas en 1180×820, 820×1180, 1366×900, 1150×800 (rail), **laptop al 125 % (1093×614)**, **tablet 10" vertical (800×1280)** y **panel angosto (820)** con Chrome headless, sin desbordes horizontales; `prefers-reduced-motion` y ajuste manual. Ajustes derivados: sala a dos columnas entre 900 y 1199 px, lista completa y detalle al elegir por debajo de 900 px, saludo del kiosko alineado arriba en vertical. Pendiente solo la tablet física. | ✅ emulado · 👤 tablet real |

Capturas de verificación de esta sesión: landing (tablet y portrait), wizard (nombre, fecha, alarma, motivos, síntomas, IPSS lista y grid, NIH-CPSI, IIEF-5, ADAM, antecedentes, revisión), recurrente, código, booking, login, sala de espera (doctor, recepción, rail), agenda, registrar, pacientes, investigación, administración.


## Accesibilidad verificada (20 sep 2026)

Tras la revisión adversarial: etiquetas asociadas a campos y grupos (`Field` con `useId`), botón cargando con contraste, casilla de consentimiento visible, `prefers-reduced-motion` sin estroboscopio en indicadores, diálogos con ids únicos y cierre nativo sincronizado, scroll al inicio en cada paso, zoom del navegador permitido.
