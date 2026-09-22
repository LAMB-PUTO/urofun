import type { ReactNode } from 'react';
import type { AppointmentStatus, VisitStatus } from '../../domain/types';
import { APPOINTMENT_STATUS_LABEL, VISIT_STATUS_LABEL } from '../../domain/types';
import type { Severity } from '../../domain/questionnaires';
import { severityLabel } from '../../domain/questionnaires';

export type ChipTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'muted';

export const Chip = ({ tone = 'neutral', dot, children, className }: { tone?: ChipTone; dot?: boolean; children: ReactNode; className?: string }) => (
  <span className={['chip', `chip--${tone}`, className ?? ''].filter(Boolean).join(' ')}>
    {dot && <span className="chip__dot" aria-hidden="true" />}
    {children}
  </span>
);

export const Tag = ({ navy, children }: { navy?: boolean; children: ReactNode }) => <span className={['tag', navy ? 'tag--navy' : ''].filter(Boolean).join(' ')}>{children}</span>;

const VISIT_TONE: Record<VisitStatus, ChipTone> = {
  arrived: 'warning',
  waiting: 'info',
  in_consultation: 'neutral',
  completed: 'success',
  cancelled: 'muted',
};

export const VisitStatusChip = ({ status }: { status: VisitStatus }) => (
  <Chip tone={VISIT_TONE[status]} dot={status === 'in_consultation' || status === 'arrived'}>
    {VISIT_STATUS_LABEL[status]}
  </Chip>
);

const APPT_TONE: Record<AppointmentStatus, ChipTone> = {
  scheduled: 'info',
  confirmed: 'info',
  checked_in: 'warning',
  completed: 'success',
  cancelled: 'muted',
  no_show: 'danger',
};

export const AppointmentStatusChip = ({ status }: { status: AppointmentStatus }) => <Chip tone={APPT_TONE[status]}>{APPOINTMENT_STATUS_LABEL[status]}</Chip>;

const SEVERITY_TONE: Record<Severity, ChipTone> = {
  none: 'success',
  mild: 'success',
  moderate: 'warning',
  severe: 'danger',
  very_severe: 'danger',
  positive: 'danger',
  negative: 'success',
  info: 'neutral',
};

export const SeverityChip = ({ severity, label }: { severity: Severity; label?: string }) => <Chip tone={SEVERITY_TONE[severity]}>{label ?? severityLabel[severity]}</Chip>;
