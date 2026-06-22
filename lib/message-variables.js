import { formatDetailDate, formatDetailDateFr } from "./dates.js";
import { formatServiceLabel, formatServiceLabelFr } from "./service-labels.js";

export const MESSAGE_VARIABLES_EN = [
  "{first_name}",
  "{name}",
  "{service}",
  "{last_detail_date}",
  "{days_since}",
  "{booking_url}",
];

export const MESSAGE_VARIABLES_FR = [
  "{prenom}",
  "{nom}",
  "{detail}",
  "{date_dernier_detail}",
  "{jours_depuis}",
  "{lien_reservation}",
];

/** @deprecated use MESSAGE_VARIABLES_EN */
export const MESSAGE_VARIABLES = MESSAGE_VARIABLES_EN;

export function buildMessageVariableMap({
  name,
  firstName,
  serviceType,
  lastDetailDate,
  daysSince,
  bookingUrl,
}) {
  const serviceEn = formatServiceLabel(serviceType);
  const serviceFr = formatServiceLabelFr(serviceType);
  const dateEn = formatDetailDate(lastDetailDate);
  const dateFr = formatDetailDateFr(lastDetailDate);
  const days = String(daysSince ?? "");
  const url = bookingUrl ?? "";

  return {
    name,
    first_name: firstName,
    service: serviceEn,
    last_detail_date: dateEn,
    days_since: days,
    booking_url: url,

    nom: name,
    prenom: firstName,
    detail: serviceFr,
    service_fr: serviceFr,
    date_dernier_detail: dateFr,
    date_detail: dateFr,
    jours_depuis: days,
    nombre_jours: days,
    lien_reservation: url,
    url_reservation: url,
  };
}
