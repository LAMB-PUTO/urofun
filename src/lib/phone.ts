/** Teléfonos mexicanos de 10 dígitos. */

export const digitsOnly = (v: string): string => (v || '').replace(/\D/g, '');

/** Últimos 10 dígitos (quita 52/521/+52). */
export const normalizeMx = (v: string): string => {
  const d = digitsOnly(v);
  return d.length > 10 ? d.slice(-10) : d;
};

export const isValidMx = (v: string): boolean => normalizeMx(v).length === 10;

/** "667 123 4567" */
export const formatMx = (v: string): string => {
  const d = normalizeMx(v);
  if (d.length !== 10) return v.trim();
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
};

/** Formato en vivo mientras se escribe. */
export const formatMxPartial = (v: string): string => {
  const d = digitsOnly(v).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
};

/** "··· 4567" para respuestas enmascaradas. */
export const maskMx = (v: string): string => {
  const d = normalizeMx(v);
  return d.length >= 4 ? `··· ${d.slice(-4)}` : '···';
};

/** "Juan P." para búsquedas enmascaradas. */
export const maskName = (fullName: string): string => {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]?.toUpperCase() ?? ''}.`;
};

export const whatsappLink = (phone: string, text?: string): string => {
  const d = normalizeMx(phone);
  const base = `https://wa.me/52${d}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
};
