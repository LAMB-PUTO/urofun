-- ============================================================================
-- Citas sin visita previa: patient_id pasa a ser opcional en appointments
-- ============================================================================
-- Antes, cada cita web creaba primero una fila en patient_forms y guardaba su
-- id en appointments.patient_id (NOT NULL). En el flujo nuevo la cita se crea
-- sola (teléfono + nombre) y la visita nace hasta el check-in "Llegó", que es
-- cuando se llena patient_id. Sin este cambio, agendar falla con:
--   null value in column "patient_id" of relation "appointments" violates not-null constraint
--
-- Ejecutar en Supabase > SQL Editor. Idempotente.
-- ----------------------------------------------------------------------------

alter table public.appointments alter column patient_id drop not null;

-- Si patient_id tiene llave foránea a patient_forms, que borrar una visita no
-- bloquee ni borre la cita: solo deja patient_id en null.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.appointments'::regclass and contype = 'f'
      and pg_get_constraintdef(oid) like '%(patient_id)%'
  loop
    execute format('alter table public.appointments drop constraint %I', c.conname);
    execute 'alter table public.appointments add constraint appointments_patient_id_fkey foreign key (patient_id) references public.patient_forms(id) on delete set null';
  end loop;
end $$;

-- Verificación: is_nullable debe ser YES para patient_id.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'appointments'
order by ordinal_position;
