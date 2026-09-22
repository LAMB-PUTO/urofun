# Checklist de pruebas con el Dr. Sandoval

Imprimible. Marca cada punto cuando lo veas funcionar. Necesitas: la tablet del consultorio, la computadora de recepción y la del doctor, todas en la misma red apuntando a la app (`http://<ip-de-tu-laptop>:5173` mientras sea local).

Antes de empezar: `npm run check:ai` en verde (OpenAI y Perplexity) y `npm run smoke:db` en 40/40.

---

## A. Tablet del paciente (que la pruebe alguien que no sea tú)

- [ ] **A1. Portada.** Se lee de lejos, el saludo cambia con la hora, los tres botones son grandes. "Reducir animaciones" hace efecto.
- [ ] **A2. Primera visita, datos.** Nombre, fecha de nacimiento (día, mes, año en cajas separadas), sexo, teléfono, correo o "no tengo correo", cómo se enteró. En cuanto pasa esta sección, el paciente aparece en la sala como "Llenando cuestionario".
- [ ] **A3. Alarma.** La pantalla de síntomas de alarma aparece para todos. Marcar "sangre en la orina" hace que en la sala salga primero y con bandera roja.
- [ ] **A4. Motivos por sexo.** A una mujer no le aparece "Próstata"; a un hombre no le aparece FSFI-6.
- [ ] **A5. Cuestionarios.** Una pregunta por pantalla, "Siguiente" bloqueado hasta responder, las opciones se leen sin lentes de cerca. Pedirle al Dr. que verifique una escala completa (IPSS o IIEF-5) contra la oficial.
- [ ] **A6. Enviar.** "Enviar al doctor" tarda menos de un segundo y dice "Listo, gracias"; a los 20 segundos regresa solo a la portada.
- [ ] **A7. Resistencia.** A medio cuestionario: apagar pantalla, volver a abrir → "Continuar donde se quedó". Dejar la tablet quieta 3 minutos → "¿Sigue ahí?" y a los 30 segundos vuelve al inicio sin dejar datos en pantalla.
- [ ] **A8. Código.** Recepción registra al paciente y le da el código de 4 dígitos; en la tablet "Tengo un código" abre su cuestionario con nombre y datos ya puestos.
- [ ] **A9. Recurrente.** "Ya he venido antes" con teléfono + primer nombre encuentra al paciente y trae sus motivos anteriores. Con un teléfono ajeno y otro nombre no muestra a nadie.
- [ ] **A10. Privacidad.** Desde la portada, "Personal de la clínica" pide PIN o contraseña siempre, aunque recepción haya usado esa misma tablet un minuto antes.

## B. Recepción

- [ ] **B1. Entrar** con el PIN. Ve Sala, Agenda y Registrar; no ve Pacientes, Investigación ni Doctores.
- [ ] **B2. Sala.** En la sala ve nombre, edad, tiempo de espera, conteo de banderas rojas y si el resumen está listo; **no** ve el texto del resumen ni los puntajes.
- [ ] **B3. Registrar llegada.** Teléfono primero: si el paciente ya existe, se precarga; si no, se captura. Sale el código para la tablet, o "Sin tablet: pasar a sala".
- [ ] **B4. Registrar otro.** Después de registrar, el formulario queda vacío para el siguiente (no se arrastra el teléfono anterior).
- [ ] **B5. Agenda.** "Nueva cita" desde un horario libre; confirmar; reagendar; cancelar con motivo; "Llegó" crea la visita con código; "No llegó" aparece 30 minutos después de la hora. El mensaje de WhatsApp sale con fecha, hora y doctor correctos.
- [ ] **B6. Horario duplicado.** Intentar agendar dos veces la misma hora con el mismo doctor: la segunda dice "horario ocupado".
- [ ] **B7. Se retiró.** Marcar a alguien que se fue; si el doctor ya lo estaba atendiendo, el modal explica que no se pudo y se queda abierto.

## C. Doctor

- [ ] **C1. Entrar** con usuario y contraseña. Ve todo el menú.
- [ ] **C2. Sala.** Banderas rojas primero, luego orden de llegada. Teclas j / k mueven la selección, Esc cierra el detalle.
- [ ] **C3. Resumen de IA.** Llega en 10 a 20 segundos después de que el paciente envía. Pedirle al Dr. que lea 2 o 3 resúmenes reales: ¿la sección ALERTA solo aparece cuando hay bandera roja? ¿los puntajes y su interpretación coinciden con lo que contestó el paciente? ¿le sirve el formato o quiere otra estructura? (el prompt se ajusta en un solo lugar).
- [ ] **C4. Atender.** Abre la consulta con el contexto a la izquierda (resumen, puntajes con barra, banderas, antecedentes, visita anterior si la hay) y la nota a la derecha.
- [ ] **C5. Nota.** "Traer del cuestionario" llena el padecimiento actual. Cada campo tiene micrófono: dictar, detener, ver el texto insertado donde estaba el cursor. Probar una vez que el dictado falle (sin internet un momento) y "Reintentar" en el campo correcto.
- [ ] **C6. Autosave.** Escribir, recargar la página: el borrador sigue. Cerrar la pestaña y abrir desde otra computadora: sigue.
- [ ] **C7. Investigar caso.** Pregunta con el contexto del paciente (sin nombre). Responde con fuentes numeradas que abren al tocarlas. "Insertar" lo mete en Recomendaciones. Pedirle al Dr. que evalúe si las respuestas citan AUA/EAU y si le sirven los presets.
- [ ] **C8. Terminar consulta.** Exige signos vitales, padecimiento, exploración, diagnóstico y receta. "Agendar seguimiento" crea la cita. El paciente pasa a "Atendido".
- [ ] **C9. PDF.** Desde Pacientes o desde la consulta: el expediente se imprime con datos, cuestionarios, nota y fuentes. Pedirle al Dr. qué le falta para NOM-004 (firma, cédula, logo).
- [ ] **C10. Pacientes.** Buscar por nombre o teléfono; abrir un expediente con varias visitas; cambiar entre visitas; el detalle no se brinca solo aunque pasen minutos.
- [ ] **C11. Expedientes viejos.** Abrir uno de los 10 pacientes anteriores: se ven sus motivos, puntajes y resumen antiguos; atenderlo y guardar nota **no** los borra.
- [ ] **C12. Dos doctores.** Si hubiera dos, tocar "Atender" al mismo paciente desde dos computadoras: solo uno entra; el otro ve el aviso.
- [ ] **C13. Devolver a sala.** Desde la consulta, regresa al paciente a la sala conservando el borrador.

## D. Administración (usuario admin)

- [ ] **D1. Probar conexiones.** OpenAI y Perplexity en OK.
- [ ] **D2. Registrar doctor.** Crea el usuario y puede entrar.

## E. Paciente desde su celular (`/schedule`)

- [ ] **E1.** Agenda una cita con mínimo una hora de anticipación, elige doctor y horario, acepta el aviso. Aparece en la agenda de recepción como "En línea"; **no** aparece en la sala de espera.
- [ ] **E2.** Descarga el `.ics` y el WhatsApp sale con el texto correcto.

## F. Preguntas para el Dr. (decisiones que necesito de él)

1. Horario real de consulta y días (hoy: lunes a viernes, 12:00 a 18:00, citas de 30 minutos).
2. ¿La sección ALERTA y el formato del resumen le funcionan así, o quiere cambiar orden, extensión o lenguaje?
3. ¿Qué debe llevar el PDF para cumplir NOM-004 en su práctica (firma, cédula, membrete)?
4. ¿Los cuatro síntomas de alarma son los que quiere que disparen prioridad (hematuria, retención, fiebre con dolor lumbar, dolor testicular agudo)?
5. ¿Quiere que recepción vea algo más del cuestionario, o está bien que solo vea el conteo de banderas?
6. ¿Cuántos días de anticipación se ofrecen en línea (hoy 45) y cuánto tiempo mínimo antes (hoy 60 minutos)?
7. ¿Qué preguntas frecuentes quiere como presets en Investigación (hoy: HPB, vejiga hiperactiva, litiasis, ITU recurrente, disfunción eréctil, hematuria)?

---

Cualquier cosa que falle: anotar qué paso, qué esperabas y qué pasó, y una captura. Con eso lo corrijo.
