import { actorRole } from '../../config/roles';
import type { Actor } from '../../data/visits.repo';
import type { Session } from '../../services/session';

export const actorOf = (session: Session | null): Actor & { fullName?: string } => ({
  role: actorRole(session),
  username: session?.username,
  fullName: session?.fullName,
});
