-- =====================================================================
-- Urología Funcional — esquema objetivo (NO APLICADA)
-- La app actual corre sobre patient_forms / appointments / doctors usando
-- columnas jsonb y el status en texto libre. Esta migración formaliza el
-- modelo (personas, visitas, notas, archivos, auth, RLS) para cuando se
-- decida aplicarla. Revisar cada bloque antes de ejecutar en producción.
-- =====================================================================

-- 1. Restricciones sobre las tablas actuales (compatibles con el código)
alter table patient_forms
  add constraint patient_forms_status_chk
  check (status in ('arrived','waiting','in_consultation','completed','cancelled'));
create index if not exists patient_forms_status_created_idx on patient_forms (status, created_at);
create index if not exists patient_forms_phone_idx on patient_forms (phone);

alter table appointments
  add constraint appointments_status_chk
  check (status in ('scheduled','confirmed','checked_in','completed','cancelled','no_show'));
create index if not exists appointments_doctor_date_idx on appointments (doctor_username, appointment_date);
create unique index if not exists appointments_no_double_booking
  on appointments (doctor_username, appointment_date)
  where status in ('scheduled','confirmed','checked_in');

-- 2. Personas (identidad entre visitas; hoy se deriva del teléfono)
create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  birth_date date,
  gender text check (gender in ('Masculino','Femenino')),
  phone text not null,
  email text,
  referral_source text,
  referred_by text,
  preferred_doctor text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists patients_phone_idx on patients (phone);
create extension if not exists pg_trgm;
create index if not exists patients_name_trgm on patients using gin (full_name gin_trgm_ops);

-- Backfill: una persona por teléfono normalizado (últimos 10 dígitos)
insert into patients (full_name, birth_date, gender, phone, email, created_at)
select distinct on (right(regexp_replace(phone, '\D', '', 'g'), 10))
  full_name,
  nullif(symptoms->'personal'->>'birthDate','')::date,
  gender,
  right(regexp_replace(phone, '\D', '', 'g'), 10),
  email,
  min(created_at) over (partition by right(regexp_replace(phone, '\D', '', 'g'), 10))
from patient_forms
order by right(regexp_replace(phone, '\D', '', 'g'), 10), created_at desc;

alter table patient_forms add column if not exists patient_id uuid references patients(id);
update patient_forms pf set patient_id = p.id
from patients p where p.phone = right(regexp_replace(pf.phone, '\D', '', 'g'), 10);

-- 3. Columnas planas para lo que hoy vive en symptoms.visit / symptoms.ai
alter table patient_forms
  add column if not exists kind text check (kind in ('first','followup')),
  add column if not exists source text,
  add column if not exists intake_mode text,
  add column if not exists prev_visit_id uuid references patient_forms(id),
  add column if not exists appointment_id uuid,
  add column if not exists kiosk_code text,
  add column if not exists doctor_username text,
  add column if not exists checked_in_at timestamptz,
  add column if not exists called_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists ai_status text,
  add column if not exists ai_summary text,
  add column if not exists ai_error text,
  add column if not exists ai_generated_at timestamptz;

update patient_forms set
  kind = coalesce(symptoms->'visit'->>'kind','first'),
  source = coalesce(symptoms->'visit'->>'source','legacy'),
  intake_mode = coalesce(symptoms->'visit'->>'intakeMode','tablet'),
  prev_visit_id = nullif(symptoms->'visit'->>'prevVisitId','')::uuid,
  appointment_id = nullif(symptoms->'visit'->>'appointmentId','')::uuid,
  kiosk_code = symptoms->'visit'->>'kioskCode',
  doctor_username = symptoms->'visit'->>'doctorUsername',
  checked_in_at = nullif(symptoms->'visit'->>'checkedInAt','')::timestamptz,
  called_at = nullif(symptoms->'visit'->>'calledAt','')::timestamptz,
  completed_at = nullif(symptoms->'visit'->>'completedAt','')::timestamptz,
  cancelled_at = nullif(symptoms->'visit'->>'cancelledAt','')::timestamptz,
  cancel_reason = symptoms->'visit'->>'cancelReason',
  ai_status = coalesce(symptoms->'ai'->>'status', case when coalesce(symptoms->>'aiSummary','') <> '' then 'ready' else 'skipped' end),
  ai_summary = coalesce(symptoms->'ai'->>'summary', nullif(symptoms->>'aiSummary','')),
  ai_error = symptoms->'ai'->>'error',
  ai_generated_at = nullif(symptoms->'ai'->>'generatedAt','')::timestamptz;

-- Una sola visita abierta por persona
create unique index if not exists patient_forms_one_open_per_patient
  on patient_forms (patient_id)
  where status in ('arrived','waiting','in_consultation') and patient_id is not null;

-- 4. Citas: vínculo con la visita y datos que hoy viven en symptoms
alter table appointments
  add column if not exists visit_id uuid references patient_forms(id),
  add column if not exists patient_ref uuid references patients(id),
  add column if not exists duration_min int default 30,
  add column if not exists kind text,
  add column if not exists source text,
  add column if not exists notes text,
  add column if not exists prev_visit_id uuid,
  add column if not exists confirmed_at timestamptz,
  add column if not exists checked_in_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists no_show_at timestamptz;

update appointments set
  visit_id = nullif(symptoms->>'visitId','')::uuid,
  duration_min = coalesce((symptoms->>'durationMinutes')::int, 30),
  kind = coalesce(symptoms->>'kind','first'),
  source = coalesce(symptoms->>'source','web'),
  notes = symptoms->>'notes',
  prev_visit_id = nullif(symptoms->>'prevVisitId','')::uuid,
  confirmed_at = nullif(symptoms->>'confirmedAt','')::timestamptz,
  checked_in_at = nullif(symptoms->>'checkedInAt','')::timestamptz,
  cancelled_at = nullif(symptoms->>'cancelledAt','')::timestamptz,
  cancel_reason = symptoms->>'cancelReason',
  no_show_at = nullif(symptoms->>'noShowAt','')::timestamptz;

-- 5. Archivos (hoy dentro de medical_notes.attachedFiles; el bucket es público)
create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references patient_forms(id) on delete cascade,
  patient_id uuid references patients(id),
  storage_path text not null,
  name text,
  mime text,
  size int,
  uploaded_by text,
  created_at timestamptz default now()
);
insert into attachments (visit_id, patient_id, storage_path, name, mime, created_at)
select pf.id, pf.patient_id, coalesce(f->>'path', f->>'url'), f->>'name', f->>'type', coalesce(nullif(f->>'uploadedAt','')::timestamptz, pf.created_at)
from patient_forms pf, jsonb_array_elements(coalesce(pf.medical_notes->'attachedFiles','[]'::jsonb)) f;
update storage.buckets set public = false where id = 'patient_files';
-- En el frontend cambiar getPublicUrl -> createSignedUrl(path, 3600).

-- 6. Investigación guardada en el expediente
create table if not exists research_notes (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references patient_forms(id) on delete cascade,
  doctor_username text,
  query text,
  answer text,
  sources jsonb,
  created_at timestamptz default now()
);

-- 7. Personal y autenticación (Supabase Auth)
alter table doctors
  add column if not exists role text check (role in ('doctor','admin','reception')) default 'doctor',
  add column if not exists active boolean default true,
  add column if not exists auth_user_id uuid references auth.users(id),
  add column if not exists cedula text;
update doctors set role = 'admin' where username = 'miguel sandoval';
-- Después de crear los usuarios en Auth y ligar auth_user_id:
-- alter table doctors drop column password;

create or replace function current_staff_role() returns text language sql stable as $$
  select role from doctors where auth_user_id = auth.uid() and active limit 1
$$;

-- 8. Auditoría por trigger (sustituye symptoms.visit.events)
create table if not exists audit_log (
  id bigserial primary key,
  table_name text,
  row_id uuid,
  event text,
  by_user uuid,
  at timestamptz default now(),
  old_status text,
  new_status text
);
create or replace function audit_status() returns trigger language plpgsql as $$
begin
  if (tg_op = 'UPDATE' and new.status is distinct from old.status) or tg_op = 'INSERT' then
    insert into audit_log (table_name, row_id, event, by_user, old_status, new_status)
    values (tg_table_name, new.id, tg_op, auth.uid(), case when tg_op='UPDATE' then old.status end, new.status);
  end if;
  return new;
end $$;
drop trigger if exists patient_forms_audit on patient_forms;
create trigger patient_forms_audit after insert or update on patient_forms for each row execute function audit_status();
drop trigger if exists appointments_audit on appointments;
create trigger appointments_audit after insert or update on appointments for each row execute function audit_status();

-- 9. Realtime
alter publication supabase_realtime add table patient_forms, appointments;

-- 10. RLS (el kiosko sigue siendo anónimo: solo puede crear su visita y
--     actualizarla mientras esté en 'arrived'; el personal necesita Auth)
alter table patients enable row level security;
alter table patient_forms enable row level security;
alter table appointments enable row level security;
alter table doctors enable row level security;
alter table attachments enable row level security;
alter table research_notes enable row level security;

create policy kiosk_insert_visit on patient_forms for insert to anon with check (status = 'arrived' or status = 'waiting');
create policy kiosk_update_open_visit on patient_forms for update to anon using (status = 'arrived') with check (status in ('arrived','waiting'));
create policy kiosk_lookup_visit on patient_forms for select to anon using (true); -- TODO: sustituir por RPC find_returning_patient con respuesta enmascarada
create policy public_booking_insert on appointments for insert to anon with check (status = 'scheduled' and source = 'web');
create policy public_booking_slots on appointments for select to anon using (true); -- TODO: vista appointments_public(appointment_date, status, doctor_username)
create policy staff_all_visits on patient_forms for all to authenticated using (current_staff_role() is not null) with check (current_staff_role() is not null);
create policy staff_all_appointments on appointments for all to authenticated using (current_staff_role() is not null) with check (current_staff_role() is not null);
create policy staff_read_patients on patients for select to authenticated using (current_staff_role() is not null);
create policy staff_write_patients on patients for insert to authenticated with check (current_staff_role() is not null);
create policy staff_read_doctors on doctors for select to authenticated using (current_staff_role() is not null);
create policy admin_write_doctors on doctors for all to authenticated using (current_staff_role() = 'admin') with check (current_staff_role() = 'admin');
create policy doctor_attachments on attachments for all to authenticated using (current_staff_role() in ('doctor','admin','reception')) with check (current_staff_role() in ('doctor','admin','reception'));
create policy doctor_research on research_notes for all to authenticated using (current_staff_role() in ('doctor','admin')) with check (current_staff_role() in ('doctor','admin'));
