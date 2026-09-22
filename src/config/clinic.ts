import { ENV } from '../services/env';

/** Configuración de la clínica (horario, slots). Ajustable por .env. */
export const CLINIC = {
  name: ENV.clinicName,
  doctorDisplayName: ENV.doctorDisplayName,
  city: 'Culiacán, Sinaloa',
  timezone: 'America/Mazatlan',
  whatsapp: ENV.whatsappNumber,
  /** 0 = domingo … 6 = sábado */
  workdays: [1, 2, 3, 4, 5],
  hours: {
    start: `${String(ENV.agendaStartHour).padStart(2, '0')}:00`,
    end: `${String(ENV.agendaEndHour).padStart(2, '0')}:00`,
  },
  slotMinutes: ENV.agendaSlotMinutes,
  /** Minutos tras la hora de la cita para sugerir "No llegó". */
  noShowAfterMinutes: 30,
  /** Minutos mínimos de anticipación para reservar en línea. */
  onlineLeadMinutes: 60,
  /** Días hacia adelante que se ofrecen en línea. */
  onlineHorizonDays: 45,
  /** Segundos de inactividad antes del aviso en el kiosko. */
  kioskIdleSeconds: 180,
  kioskIdleWarningSeconds: 30,
  kioskDoneSeconds: 20,
} as const;
