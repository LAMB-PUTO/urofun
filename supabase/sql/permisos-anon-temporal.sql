-- ============================================================================
-- Permisos temporales para la llave anon (MIENTRAS no exista Supabase Auth)
-- ============================================================================
-- Síntoma que corrige: el kiosko crea la visita pero "Enviar al doctor" no
-- cambia nada, el borrador no se guarda y el doctor no puede iniciar/cerrar
-- consulta. Causa: RLS activo con políticas de SELECT/INSERT pero sin UPDATE
-- para `anon`; PostgREST responde 200 con 0 filas y no hay error visible.
--
-- La app hoy usa SOLO la llave anon (no hay sesión de Supabase Auth), así que
-- RLS no puede distinguir kiosko de personal. Estas políticas dejan la base
-- funcional y explícita; se sustituyen por las de 0001_target_schema.sql
-- cuando el personal inicie sesión con Supabase Auth.
--
-- Ejecutar en Supabase > SQL Editor. Idempotente.
-- ----------------------------------------------------------------------------

-- 1) Diagnóstico (solo lectura): ¿qué hay ahora?
select c.relname as tabla, c.relrowsecurity as rls_activo
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('patient_forms', 'appointments', 'doctors');

select tablename, policyname, cmd, roles
from pg_policies where schemaname = 'public'
order by tablename, policyname;

-- 2) Políticas permisivas para anon (equivalen a "RLS apagado", pero quedan
--    declaradas para reemplazarlas después sin tocar el frontend).
do $$
declare t text;
begin
  foreach t in array array['patient_forms', 'appointments', 'doctors'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists anon_temp_select on public.%I', t);
    execute format('drop policy if exists anon_temp_insert on public.%I', t);
    execute format('drop policy if exists anon_temp_update on public.%I', t);
    execute format('drop policy if exists anon_temp_delete on public.%I', t);
    execute format('create policy anon_temp_select on public.%I for select to anon using (true)', t);
    execute format('create policy anon_temp_insert on public.%I for insert to anon with check (true)', t);
    execute format('create policy anon_temp_update on public.%I for update to anon using (true) with check (true)', t);
  end loop;
end $$;

-- DELETE solo lo usa scripts/smoke-db.mjs para borrar sus propias filas de
-- prueba (teléfono 5559…). La app no borra nada.
create policy anon_temp_delete on public.patient_forms for delete to anon using (phone like '5559%');
create policy anon_temp_delete on public.appointments for delete to anon using (patient_phone like '5559%');

-- Storage: el bucket patient_files debe permitir insert/select a anon (o
-- ser público) mientras no haya Auth; revisar en Storage > Policies.

-- 3) Verificación: debe devolver 1 fila (no-op sobre la primera visita abierta).
with v as (select id from public.patient_forms where status in ('arrived','waiting') limit 1)
update public.patient_forms p set status = p.status from v where p.id = v.id returning p.id;

-- ----------------------------------------------------------------------------
-- Alternativa mínima (si prefieres volver al estado previo, sin RLS):
--   alter table public.patient_forms disable row level security;
--   alter table public.appointments  disable row level security;
--   alter table public.doctors       disable row level security;
-- ----------------------------------------------------------------------------
