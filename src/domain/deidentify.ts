/**
 * Desidentificación antes de cualquier llamada a un proveedor de IA.
 * Nunca salen: nombre, teléfono, correo, fecha de nacimiento, nombre del médico que refiere.
 */

const PHONE_RE = /(\+?52\s?)?(\d[\s.-]?){10}/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const CURP_RE = /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/g;

/** Quita teléfonos, correos y CURP de texto libre. */
export const redactFreeText = (text: string | undefined | null): string | undefined => {
  if (!text) return undefined;
  const cleaned = text.replace(EMAIL_RE, '[correo]').replace(PHONE_RE, '[teléfono]').replace(CURP_RE, '[CURP]').trim();
  return cleaned || undefined;
};

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Quita el nombre del paciente si aparece en texto libre. */
export const redactName = (text: string | undefined, fullName: string): string | undefined => {
  if (!text) return undefined;
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2);
  let out = text;
  for (const p of parts) {
    // \b no reconoce letras acentuadas (José, Ángel): fronteras Unicode explícitas.
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(p)}(?![\\p{L}\\p{N}])`, 'giu'), '[nombre]');
  }
  return out;
};

const PII_KEYS = new Set(['fullName', 'nombre', 'phone', 'telefono', 'teléfono', 'email', 'correo', 'birthDate', 'fechaNacimiento', 'referredByDoctor', 'referidoPor', 'kioskCode']);

/** Recorre un objeto y elimina claves de PII conocidas (defensa en profundidad). */
export const stripPiiKeys = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(stripPiiKeys) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PII_KEYS.has(k)) continue;
      out[k] = stripPiiKeys(v);
    }
    return out as T;
  }
  return value;
};

/** Verifica que un texto no contenga los identificadores del paciente (para pruebas y guardas). */
export const containsPii = (text: string, personal: { fullName: string; phone: string; email?: string }): boolean => {
  const t = text.toLowerCase();
  const nameParts = personal.fullName.toLowerCase().split(/\s+/).filter((p) => p.length > 3);
  if (nameParts.some((p) => t.includes(p))) return true;
  const digits = personal.phone.replace(/\D/g, '');
  if (digits.length >= 7 && text.replace(/\D/g, '').includes(digits.slice(-7))) return true;
  if (personal.email && t.includes(personal.email.toLowerCase())) return true;
  return false;
};
