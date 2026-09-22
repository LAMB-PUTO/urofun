import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

/**
 * Suscripción a cambios de una tabla con respaldo por sondeo. Si Realtime no
 * está habilitado para la tabla en Supabase, el sondeo mantiene la UI viva.
 */
export const subscribeToTable = (table: string, onChange: () => void, pollMs = 20_000): (() => void) => {
  let disposed = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const channel = supabase
    .channel(`uf:${table}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      if (!disposed) onChange();
    })
    .subscribe();

  timer = setInterval(() => {
    if (!disposed && document.visibilityState === 'visible') onChange();
  }, pollMs);

  const onFocus = () => {
    if (!disposed) onChange();
  };
  window.addEventListener('focus', onFocus);

  return () => {
    disposed = true;
    if (timer) clearInterval(timer);
    window.removeEventListener('focus', onFocus);
    supabase.removeChannel(channel);
  };
};

export const useTableSubscription = (tables: string[], onChange: () => void, pollMs = 20_000) => {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = tables.join(',');
  useEffect(() => {
    const unsubs = key
      .split(',')
      .filter(Boolean)
      .map((t) => subscribeToTable(t, () => cb.current(), pollMs));
    return () => unsubs.forEach((u) => u());
  }, [key, pollMs]);
};
