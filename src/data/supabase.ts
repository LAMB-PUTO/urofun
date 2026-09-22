import { createClient } from '@supabase/supabase-js';
import { ENV } from '../services/env';

if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env');
}

export const supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 5 } },
});

export const TABLES = {
  visits: 'patient_forms',
  appointments: 'appointments',
  doctors: 'doctors',
} as const;

export const BUCKETS = {
  patientFiles: 'patient_files',
} as const;

export class DataError extends Error {
  readonly detail?: unknown;
  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = 'DataError';
    this.detail = detail;
  }
}

export const fail = (message: string, error: unknown): never => {
  console.error(message, error);
  throw new DataError(message, error);
};
