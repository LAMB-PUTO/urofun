import { useCallback, useEffect, useRef } from 'react';
import { listOpenVisits, sweepAbandoned } from '../data/visits.repo';
import { TABLES } from '../data/supabase';
import { retryStaleSummaries } from '../services/ai/summaryJob';
import { getSession } from '../services/session';
import { actorRole } from '../config/roles';
import { useLiveQuery } from './useLiveQuery';

/**
 * Sala de espera en vivo: visitas abiertas en orden de llegada, barrido de
 * abandonadas al montar y watchdog del resumen IA.
 */
export const useOpenVisits = () => {
  const fetcher = useCallback(() => listOpenVisits(), []);
  const query = useLiveQuery(fetcher, [TABLES.visits], 20_000);
  const swept = useRef(false);

  useEffect(() => {
    if (swept.current) return;
    swept.current = true;
    const session = getSession();
    if (!session) return;
    sweepAbandoned({ role: actorRole(session), username: session.username })
      .then((n) => {
        if (n > 0) void query.refresh({ silent: true });
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!query.data) return;
    const session = getSession();
    if (!session) return;
    void retryStaleSummaries(query.data);
  }, [query.data]);

  return query;
};
