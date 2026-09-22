import { getAppointment, transitionAppointment } from '../data/appointments.repo';
import { canTransitionAppointment, TransitionRejected } from '../domain/status';
import { createVisit, findOpenVisitByPhone, linkAppointment, listVisitsByPhone } from '../data/visits.repo';
import type { Actor } from '../data/visits.repo';
import type { Appointment, PersonalData, Visit } from '../domain/types';
import { formatDateLong, formatTime } from '../lib/dates';
import { CLINIC } from '../config/clinic';

/**
 * Check-in "Llegó": crea (o reutiliza) la visita de hoy a partir de la cita y
 * marca la cita como `checked_in`. Idempotente: un segundo tap no duplica.
 */
export const checkInAppointment = async (appointmentId: string, by: Actor): Promise<{ appointment: Appointment; visit: Visit; reused: boolean }> => {
  const appointment = await getAppointment(appointmentId);
  if (!appointment) throw new Error('La cita ya no existe.');
  if (appointment.status !== 'checked_in' && !canTransitionAppointment(appointment.status, 'checked_in', by.role)) {
    throw new TransitionRejected(appointment.status, 'checked_in');
  }

  const open = await findOpenVisitByPhone(appointment.patientPhone);
  if (open) {
    const a = appointment.status === 'checked_in' ? appointment : await transitionAppointment(appointmentId, 'checked_in', by.role, { visitId: open.id });
    // La visita nació en el kiosko: se liga a la cita para que cerrar la consulta la complete.
    const visit = open.meta.appointmentId ? open : await linkAppointment(open.id, appointmentId).catch(() => open);
    return { appointment: a, visit, reused: true };
  }

  const previous = await listVisitsByPhone(appointment.patientPhone);
  const last = previous.find((v) => v.status === 'completed') ?? previous[0];
  const personal: PersonalData = last
    ? { ...last.personal, fullName: appointment.patientName || last.personal.fullName }
    : {
        fullName: appointment.patientName,
        phone: appointment.patientPhone,
        age: appointment.patient?.age ?? 0,
        gender: appointment.patient?.gender ?? 'Masculino',
        email: appointment.patient?.email,
        birthDate: appointment.patient?.birthDate,
        isFirstTime: true,
      };

  const visit = await createVisit({
    personal: { ...personal, isFirstTime: !last },
    status: 'arrived',
    kind: last ? 'followup' : 'first',
    source: 'checkin',
    by,
    prevVisitId: last?.id,
    appointmentId,
    preferredDoctor: appointment.doctorUsername,
    doctorUsername: appointment.doctorUsername,
    withKioskCode: true,
  });
  const a = await transitionAppointment(appointmentId, 'checked_in', by.role, { visitId: visit.id });
  return { appointment: a, visit, reused: false };
};

export const confirmationMessage = (a: Appointment): string =>
  `Hola ${a.patientName.split(' ')[0]}, le confirmamos su cita en ${CLINIC.name} con ${a.doctorName} el ${formatDateLong(a.startsAt)} a las ${formatTime(a.startsAt)}. Le pedimos llegar 10 minutos antes para llenar un breve cuestionario en tablet. Si necesita cambiarla, responda a este mensaje.`;
