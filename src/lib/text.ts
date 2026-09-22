/** Minúsculas sin acentos, para comparar nombres escritos a mano. */
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Primer nombre normalizado ("María José Pérez" -> "maria"). */
export const firstName = (s: string): string => fold(s).split(/\s+/)[0] ?? '';
