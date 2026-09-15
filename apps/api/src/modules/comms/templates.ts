import type { NOTIFICATION_EVENTS } from '@sgee/shared';

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/**
 * Default templates (es-CO). Messages never include clinical details — only a
 * minimal summary plus a link to the authenticated portal (PLAN §10).
 */
export const DEFAULT_TEMPLATES: Record<NotificationEvent, { subject: string; body: string; urgent?: boolean }> = {
  PASS_CREATED: { subject: 'Nuevo pase a enfermería', body: '{{studentName}} ({{group}}) viene en camino a enfermería. Urgencia: {{urgency}}.' },
  NURSING_ARRIVAL: { subject: 'Ingreso a enfermería', body: '{{studentName}} ingresó a la enfermería a las {{time}}. Le informaremos cualquier novedad.' },
  ENCOUNTER_CLOSED: { subject: 'Atención en enfermería', body: '{{studentName}} fue atendido(a) en enfermería. Conducta: {{disposition}}. Consulte el resumen en el portal.' },
  EXIT_AUTHORIZATION: {
    subject: 'Se requiere recoger a su hijo(a)',
    body: 'Enfermería solicita que recojan a {{studentName}}. Confirme quién lo(a) recogerá en el enlace seguro.',
    urgent: true,
  },
  EXIT_COMPLETED: { subject: 'Salida registrada', body: '{{studentName}} salió del colegio a las {{time}} acompañado(a) por {{pickupName}}.' },
  TRANSFER_IPS: { subject: 'Traslado a centro de salud', body: '{{studentName}} está siendo trasladado(a) a {{destination}}. Comuníquese con enfermería.', urgent: true },
  DOSE_GIVEN: { subject: 'Dosis administrada', body: 'Se administró la dosis de las {{scheduled}} a {{studentName}}. Detalle en el portal.' },
  DOSE_OMITTED: { subject: 'Dosis no administrada', body: 'La dosis de las {{scheduled}} para {{studentName}} no fue administrada. Detalle en el portal.' },
  MEDICATION_REQUEST_REVIEWED: { subject: 'Solicitud de medicamento revisada', body: 'Su solicitud de administración de medicamento para {{studentName}} fue {{decision}}.' },
  MEDICATION_EXPIRING: { subject: 'Medicamento próximo a vencer', body: 'Un medicamento en custodia de {{studentName}} vence el {{date}}. Por favor programe su reposición.' },
  PROFILE_UPDATE_REMINDER: { subject: 'Actualice la ficha de salud', body: 'La ficha de salud de {{studentName}} está {{completeness}}% completa. Actualícela en el portal.' },
  VACCINATION_PENDING: { subject: 'Vacunación pendiente', body: 'Revise el carné de vacunación de {{studentName}} en el portal.' },
  OUTBREAK_ALERT: { subject: 'Alerta de salud pública', body: 'Se detectó un aumento de casos ({{syndrome}}) en {{scope}}. Revise las recomendaciones en el portal.' },
  CONSENT_OTP: { subject: 'Código de firma', body: 'Su código para firmar el consentimiento es {{otp}}. Vence en 10 minutos. No lo comparta.', urgent: true },
  CONSENT_PENDING: { subject: 'Consentimiento pendiente', body: 'Tiene consentimientos pendientes de firma para {{studentName}}.' },
  MESSAGE_RECEIVED: { subject: 'Nuevo mensaje', body: 'Tiene un nuevo mensaje sobre {{studentName}} en el portal.' },
  CIRCULAR: { subject: '{{title}}', body: 'Nueva circular de salud: {{title}}. Léala en el portal.' },
  PASS_TRANSIT_ALERT: { subject: 'Estudiante no ha llegado a enfermería', body: '{{studentName}} no ha llegado a enfermería después de {{minutes}} minutos.', urgent: true },
  OBSERVATION_RECHECK: { subject: 'Reevaluación pendiente', body: 'La observación de {{studentName}} requiere reevaluación.', urgent: true },
  LOW_STOCK: { subject: 'Inventario bajo', body: '{{item}} está por debajo del stock mínimo ({{quantity}} {{unit}}).' },
  FRIDGE_OUT_OF_RANGE: { subject: 'Cadena de frío', body: 'La nevera {{location}} registró {{temperature}} °C, fuera del rango permitido.', urgent: true },
  FREQUENT_VISITOR: { subject: 'Consultas frecuentes', body: '{{studentName}} registra {{count}} visitas a enfermería en {{period}}. Se sugiere seguimiento por orientación.' },
};

export function render(template: string, data: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(data[k] ?? ''));
}
