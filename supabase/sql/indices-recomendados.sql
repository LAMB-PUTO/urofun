-- ============================================================================
-- Índices recomendados (opcionales, idempotentes)
-- ============================================================================
-- 1) Un doctor no puede tener dos citas abiertas a la misma hora, aunque dos
--    clientes pasen la verificación de conflicto al mismo tiempo. La app traduce
--    el error 23505 a "Ese horario ya está ocupado".
create unique index if not exists appointments_open_slot_uidx
  on public.appointments (doctor_username, appointment_date)
  where status in ('scheduled', 'confirmed', 'checked_in');

-- 2) Búsquedas frecuentes.
create index if not exists patient_forms_phone_idx on public.patient_forms (phone);
create index if not exists patient_forms_status_created_idx on public.patient_forms (status, created_at desc);
create index if not exists appointments_date_idx on public.appointments (appointment_date);
create index if not exists appointments_phone_idx on public.appointments (patient_phone);
