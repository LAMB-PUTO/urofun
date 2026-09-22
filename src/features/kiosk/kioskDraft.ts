import type { WizardMode, WizardState } from '../../domain/intake/formModel';

const KEY = 'uf.kiosk.draft.v1';
const PREFILL_KEY = 'uf.kiosk.prefillPhone';
const MAX_AGE_MS = 2 * 3600 * 1000;

export interface KioskDraft {
  visitId?: string;
  prevVisitId?: string;
  mode: WizardMode;
  state: WizardState;
  stepIndex: number;
  /** Clave del paso actual; al reanudar se busca por clave y el índice es respaldo. */
  stepKey?: string;
  savedAt: string;
}

export const readDraft = (): KioskDraft | null => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as KioskDraft;
    if (!d.state || Date.now() - new Date(d.savedAt).getTime() > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return d;
  } catch {
    return null;
  }
};

export const writeDraft = (d: Omit<KioskDraft, 'savedAt'>) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...d, savedAt: new Date().toISOString() }));
  } catch {
    /* sin almacenamiento */
  }
};

export const clearDraft = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento */
  }
};

export const setPrefillPhone = (phone: string) => {
  try {
    sessionStorage.setItem(PREFILL_KEY, phone);
  } catch {
    /* sin almacenamiento */
  }
};

export const takePrefillPhone = (): string => {
  try {
    const v = sessionStorage.getItem(PREFILL_KEY) ?? '';
    sessionStorage.removeItem(PREFILL_KEY);
    return v;
  } catch {
    return '';
  }
};
