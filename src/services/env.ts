/**
 * Acceso tipado a variables de entorno. Todo lo que empieza con VITE_ llega al
 * navegador: las llaves de IA solo deben existir aquí en desarrollo local.
 * En producción se usa VITE_AI_PROXY_URL (Supabase Edge Function).
 */
const raw = import.meta.env;

const str = (key: string, fallback = ''): string => {
  const v = raw[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : fallback;
};

export const ENV = {
  supabaseUrl: str('VITE_SUPABASE_URL'),
  supabaseAnonKey: str('VITE_SUPABASE_ANON_KEY'),

  /** PIN de recepción. Sin valor => el acceso de recepción queda deshabilitado. */
  receptionPin: str('VITE_RECEPTION_PIN'),

  /** Usuarios con rol admin mientras no exista la columna `role` en `doctors`. */
  adminUsernames: str('VITE_ADMIN_USERNAMES', 'miguel sandoval')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  /** URL base de la Edge Function que envuelve OpenAI/Perplexity. */
  aiProxyUrl: str('VITE_AI_PROXY_URL').replace(/\/$/, ''),

  openaiKey: str('VITE_OPENAI_API_KEY'),
  openaiModel: str('VITE_OPENAI_MODEL', 'gpt-4o-mini'),
  transcribeModel: str('VITE_OPENAI_TRANSCRIBE_MODEL', 'whisper-1'),
  perplexityKey: str('VITE_PERPLEXITY_API_KEY'),
  perplexityModel: str('VITE_PERPLEXITY_MODEL', 'sonar-pro'),

  whatsappNumber: str('VITE_WHATSAPP_NUMBER', '526678458498'),
  clinicName: str('VITE_CLINIC_NAME', 'Urología Funcional'),
  doctorDisplayName: str('VITE_DOCTOR_NAME', 'Dr. Miguel Ángel Sandoval Valle'),

  /** Horario de agenda (hora local de Culiacán). */
  agendaStartHour: Number(str('VITE_AGENDA_START_HOUR', '12')),
  agendaEndHour: Number(str('VITE_AGENDA_END_HOUR', '18')),
  agendaSlotMinutes: Number(str('VITE_AGENDA_SLOT_MINUTES', '30')),

  isDev: Boolean(raw.DEV),
} as const;

export const aiAvailable = {
  summary: Boolean(ENV.aiProxyUrl || ENV.openaiKey),
  transcribe: Boolean(ENV.aiProxyUrl || ENV.openaiKey),
  research: Boolean(ENV.aiProxyUrl || ENV.perplexityKey),
};
