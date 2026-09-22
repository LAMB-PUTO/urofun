import type { Doctor } from '../domain/types';
import { TABLES, fail, supabase } from './supabase';

const table = () => supabase.from(TABLES.doctors);

export const listDoctors = async (): Promise<Doctor[]> => {
  const { data, error } = await table().select('id, full_name, username').order('full_name');
  if (error) fail('No se pudieron cargar los doctores.', error);
  return (data ?? []).map((row) => ({ id: row.id, fullName: row.full_name, username: row.username }));
};

/**
 * Autenticación provisional contra la tabla `doctors` (contraseña en texto plano,
 * heredado). Sustituir por Supabase Auth; ver docs/PLAN-LOGICA.md.
 */
export const authenticateDoctor = async (username: string, password: string): Promise<Doctor | null> => {
  const { data, error } = await table()
    .select('id, full_name, username')
    .eq('username', username.toLowerCase().trim())
    .eq('password', password)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, fullName: data.full_name, username: data.username };
};

export const registerDoctor = async (fullName: string, username: string, password: string): Promise<{ error: string | null }> => {
  const { error } = await table().insert([{ full_name: fullName.trim(), username: username.toLowerCase().trim(), password }]);
  if (error) {
    if (error.code === '23505') return { error: 'Ese nombre de usuario ya está en uso.' };
    console.error('registerDoctor', error);
    return { error: 'No se pudo registrar al doctor.' };
  }
  return { error: null };
};
