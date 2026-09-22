import { ALARM_SYMPTOMS, SPHERES } from './catalog';
import type { SymptomSelection } from './catalog';

/**
 * Banderas rojas urológicas (AUA/EAU): hematuria macroscópica, retención aguda,
 * fiebre con dolor lumbar (pielonefritis obstructiva) y dolor escrotal agudo (torsión).
 * Se obtienen de la pantalla de alarma y de los síntomas marcados por esfera.
 */
export const extractRedFlags = (alarmKeys: string[], selection: SymptomSelection): string[] => {
  const flags = new Set<string>();
  for (const a of ALARM_SYMPTOMS) {
    if (alarmKeys.includes(a.key)) flags.add(a.flag);
  }
  for (const sphere of SPHERES) {
    const chosen = selection[sphere.key] ?? [];
    for (const s of sphere.symptoms) {
      if (s.redFlag && chosen.includes(s.key)) flags.add(s.redFlag);
    }
  }
  return Array.from(flags);
};
