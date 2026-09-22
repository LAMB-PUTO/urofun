import { useCallback, useEffect, useRef, useState } from 'react';
import { useTableSubscription } from '../data/realtime';

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
}

/**
 * Consulta que se refresca sola con cambios de tabla (Realtime + sondeo).
 * `fetcher` debe ser estable (useCallback) o cambiar solo cuando cambien sus parámetros.
 */
export const useLiveQuery = <T>(fetcher: () => Promise<T>, tables: string[], pollMs = 20_000) => {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null, updatedAt: null });
  const seq = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async (opts: { silent?: boolean } = {}) => {
    const my = ++seq.current;
    if (!opts.silent) setState((s) => ({ ...s, loading: s.data === null }));
    try {
      const data = await fetcherRef.current();
      if (my !== seq.current) return;
      setState({ data, loading: false, error: null, updatedAt: new Date() });
    } catch (err) {
      if (my !== seq.current) return;
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Error al cargar' }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, fetcher]);

  useTableSubscription(tables, () => void refresh({ silent: true }), pollMs);

  return { ...state, refresh };
};
