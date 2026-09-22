import type { ActorRole } from '../domain/types';
import type { Session } from '../services/session';

export type Action =
  | 'waiting_room.view'
  | 'waiting_room.clinical'
  | 'patient.register'
  | 'visit.checkin'
  | 'visit.attend'
  | 'visit.cancel'
  | 'consultation.write'
  | 'agenda.view'
  | 'agenda.manage'
  | 'patients.view'
  | 'files.upload'
  | 'research.use'
  | 'ai.retry'
  | 'admin.doctors';

export const PERMISSIONS: Record<Exclude<ActorRole, 'patient' | 'system'>, Action[]> = {
  reception: ['waiting_room.view', 'patient.register', 'visit.checkin', 'visit.cancel', 'agenda.view', 'agenda.manage', 'files.upload', 'ai.retry'],
  doctor: [
    'waiting_room.view',
    'waiting_room.clinical',
    'patient.register',
    'visit.checkin',
    'visit.attend',
    'visit.cancel',
    'consultation.write',
    'agenda.view',
    'agenda.manage',
    'patients.view',
    'files.upload',
    'research.use',
    'ai.retry',
  ],
  admin: [
    'waiting_room.view',
    'waiting_room.clinical',
    'patient.register',
    'visit.checkin',
    'visit.attend',
    'visit.cancel',
    'consultation.write',
    'agenda.view',
    'agenda.manage',
    'patients.view',
    'files.upload',
    'research.use',
    'ai.retry',
    'admin.doctors',
  ],
};

export const actorRole = (session: Session | null): ActorRole => {
  if (!session) return 'patient';
  if (session.role === 'doctor') return session.isAdmin ? 'admin' : 'doctor';
  return 'reception';
};

export const can = (session: Session | null, action: Action): boolean => {
  const role = actorRole(session);
  if (role === 'patient' || role === 'system') return false;
  return PERMISSIONS[role].includes(action);
};
