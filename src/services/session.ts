import { useSyncExternalStore } from 'react';
import { fetchWithRetry, hasProxy } from './ai/client';
import { ENV } from './env';

/**
 * Sesión del personal (recepción / doctor). Una sola llave en localStorage,
 * con expiración, y un store suscribible para que toda la UI reaccione.
 *
 * Limitación conocida: mientras la autenticación siga en la tabla `doctors`
 * (contraseña en texto plano) esto NO es seguridad real; ver docs/PLAN-LOGICA.md.
 */

export type Role = 'reception' | 'doctor';

export interface Session {
  role: Role;
  /** username del doctor (undefined para recepción). */
  username?: string;
  fullName: string;
  isAdmin: boolean;
  createdAt: string;
  expiresAt: string;
}

const KEY = 'uf.session.v1';
const LEGACY_KEYS = ['isAuthenticated', 'userRole', 'doctorUsername', 'doctorName'];
const SESSION_HOURS = 12;
const EVENT = 'uf:session';

let cached: Session | null | undefined;

const read = (): Session | null => {
  try {
    const rawValue = localStorage.getItem(KEY);
    if (!rawValue) return null;
    const s = JSON.parse(rawValue) as Session;
    if (!s || !s.role || !s.expiresAt) return null;
    if (new Date(s.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
};

const write = (s: Session | null) => {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* almacenamiento no disponible (modo privado) */
  }
  cached = s;
  window.dispatchEvent(new Event(EVENT));
};

export const getSession = (): Session | null => {
  if (cached === undefined) cached = read();
  if (cached && new Date(cached.expiresAt).getTime() < Date.now()) write(null);
  return cached;
};

const build = (partial: Omit<Session, 'createdAt' | 'expiresAt'>): Session => {
  const now = new Date();
  return {
    ...partial,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_HOURS * 3600 * 1000).toISOString(),
  };
};

/** Hay forma de validar el PIN: en el servidor (Edge Function) o, solo en desarrollo, contra VITE_RECEPTION_PIN. */
export const receptionLoginAvailable = (): boolean => hasProxy() || Boolean(ENV.receptionPin);

/**
 * Con VITE_AI_PROXY_URL el PIN se verifica en la Edge Function (secreto RECEPTION_PIN);
 * así el PIN nunca viaja en el bundle. Sin proxy (desarrollo) se compara localmente.
 */
export const loginReception = async (pin: string): Promise<boolean> => {
  const typed = pin.trim();
  if (!typed) return false;
  if (hasProxy()) {
    const res = await fetchWithRetry(
      `${ENV.aiProxyUrl}/reception-login`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ENV.supabaseAnonKey, Authorization: `Bearer ${ENV.supabaseAnonKey}` }, body: JSON.stringify({ pin: typed }) },
      { retries: 0, timeoutMs: 15_000 },
    ).catch((err: unknown) => {
      if (err && typeof err === 'object' && 'status' in err && (err as { status?: number }).status === 401) return null;
      throw err;
    });
    if (!res) return false;
    const data = (await res.json()) as { ok?: boolean };
    if (!data.ok) return false;
  } else {
    if (!ENV.receptionPin || typed !== ENV.receptionPin) return false;
  }
  write(build({ role: 'reception', fullName: 'Recepción', isAdmin: false }));
  return true;
};

export const loginDoctorSession = (doctor: { username: string; fullName: string }): Session => {
  const username = doctor.username.toLowerCase().trim();
  const s = build({
    role: 'doctor',
    username,
    fullName: doctor.fullName,
    isAdmin: ENV.adminUsernames.includes(username),
  });
  write(s);
  return s;
};

export const logout = () => write(null);

const subscribe = (cb: () => void) => {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) {
      cached = undefined;
      cb();
    }
  };
  // Revisión periódica: una pestaña abierta durante días también expira.
  const timer = setInterval(() => {
    if (cached && new Date(cached.expiresAt).getTime() < Date.now()) write(null);
  }, 60_000);
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    clearInterval(timer);
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
};

export const useSession = (): Session | null => useSyncExternalStore(subscribe, getSession, () => null);

export const roleLabel: Record<Role, string> = {
  reception: 'Recepción',
  doctor: 'Doctor',
};
