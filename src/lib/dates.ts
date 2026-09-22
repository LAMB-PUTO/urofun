/**
 * Fechas en la zona horaria de la clínica (Culiacán: America/Mazatlan, UTC-7
 * sin horario de verano). Todo lo que se muestra o se compara con "hoy" pasa
 * por aquí; lo que se guarda en la base es ISO UTC.
 */
export const CLINIC_TZ = 'America/Mazatlan';
export const LOCALE = 'es-MX';

const pad = (n: number) => String(n).padStart(2, '0');

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Hora de pared en la clínica para un instante dado. */
export const wallClock = (date: Date): WallClock => {
  const p = Object.fromEntries(partsFormatter.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
};

/** Convierte una fecha/hora de pared en la clínica a un instante UTC. */
export const clinicToUtc = (day: string, time = '00:00'): Date => {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm ?? 0, 0));
  const w = wallClock(guess);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const diff = asUtc - guess.getTime();
  return new Date(guess.getTime() - diff);
};

export const toClinicISO = (day: string, time: string): string => clinicToUtc(day, time).toISOString();

/** 'YYYY-MM-DD' del día en la clínica para un instante. */
export const clinicDayOf = (date: Date | string): string => {
  const w = wallClock(typeof date === 'string' ? new Date(date) : date);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
};

/** 'HH:mm' en la clínica. */
export const clinicTimeOf = (date: Date | string): string => {
  const w = wallClock(typeof date === 'string' ? new Date(date) : date);
  return `${pad(w.hour)}:${pad(w.minute)}`;
};

export const todayClinic = (): string => clinicDayOf(new Date());

export const startOfTodayClinicISO = (): string => clinicToUtc(todayClinic()).toISOString();

export const startOfDayClinicISO = (day: string): string => clinicToUtc(day).toISOString();

export const addDays = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

/** 0 = domingo … 6 = sábado, para un día 'YYYY-MM-DD'. */
export const weekdayOf = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export const isSameClinicDay = (a: Date | string, b: Date | string): boolean => clinicDayOf(a) === clinicDayOf(b);

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { timeZone: CLINIC_TZ, ...opts });

const F = {
  time: fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  dateShort: fmt({ day: 'numeric', month: 'short' }),
  dateMedium: fmt({ weekday: 'short', day: 'numeric', month: 'short' }),
  dateLong: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
  dateFull: fmt({ day: 'numeric', month: 'long', year: 'numeric' }),
  dateNumeric: fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }),
  weekday: fmt({ weekday: 'short' }),
  monthYear: fmt({ month: 'long', year: 'numeric' }),
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const toDate = (v: Date | string) => (typeof v === 'string' ? new Date(v) : v);

export const formatTime = (v: Date | string) => F.time.format(toDate(v));
export const formatDateShort = (v: Date | string) => F.dateShort.format(toDate(v)).replace('.', '');
export const formatDateMedium = (v: Date | string) => cap(F.dateMedium.format(toDate(v)).replace(/\./g, ''));
export const formatDateLong = (v: Date | string) => cap(F.dateLong.format(toDate(v)));
export const formatDateFull = (v: Date | string) => F.dateFull.format(toDate(v));
export const formatDateNumeric = (v: Date | string) => F.dateNumeric.format(toDate(v));
export const formatWeekday = (v: Date | string) => cap(F.weekday.format(toDate(v)).replace('.', ''));
export const formatMonthYear = (v: Date | string) => cap(F.monthYear.format(toDate(v)));

/** "Jueves 19 sep · 11:42" */
export const formatDateTime = (v: Date | string) => `${formatDateMedium(v)} · ${formatTime(v)}`;

/** Fecha 'YYYY-MM-DD' de la clínica formateada (sin conversión de zona). */
export const formatDay = (day: string, style: 'short' | 'medium' | 'long' | 'full' = 'medium') => {
  const d = clinicToUtc(day, '12:00');
  return style === 'short' ? formatDateShort(d) : style === 'long' ? formatDateLong(d) : style === 'full' ? formatDateFull(d) : formatDateMedium(d);
};

/** "hace 14 min", "hace 2 h", "ayer", o fecha corta. */
export const relativeTime = (v: Date | string, now = new Date()): string => {
  const diffMs = now.getTime() - toDate(v).getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24 && isSameClinicDay(v, now)) return `hace ${h} h`;
  const days = Math.round(diffMs / 86_400_000);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return formatDateShort(v);
};

/** Minutos transcurridos (para tiempo de espera vivo). */
export const minutesSince = (v: Date | string, now = new Date()): number => Math.max(0, Math.floor((now.getTime() - toDate(v).getTime()) / 60_000));

export const greetingForNow = (now = new Date()): string => {
  const h = wallClock(now).hour;
  if (h < 12) return 'Buenos días.';
  if (h < 19) return 'Buenas tardes.';
  return 'Buenas noches.';
};

/** Convierte 'DD', 'MM', 'YYYY' de inputs a 'YYYY-MM-DD' válido o null. */
export const buildIsoDate = (day: string, month: string, year: string): string | null => {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!d || !m || !y || y < 1900 || y > new Date().getFullYear() || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};
