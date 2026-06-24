import { formatDetailDate, formatDetailDateFr } from "./dates.js";
import { formatServiceLabel, formatServiceLabelFr } from "./service-labels.js";

export const MESSAGE_VARIABLES_EN = [
  "{first_name}",
  "{name}",
  "{service}",
  "{last_detail_date}",
  "{days_since}",
  "{review_url}",
  "{booking_url}",
  "{booking_url_maintenance}",
  "{booking_url_general}",
  "{booking_url_after_maintenance}",
];

export const MESSAGE_VARIABLES_FR = [
  "{prenom}",
  "{nom}",
  "{detail}",
  "{date_dernier_detail}",
  "{jours_depuis}",
  "{lien_avis}",
  "{lien_reservation}",
  "{lien_entretien}",
  "{lien_general}",
  "{lien_apres_entretien}",
];

/** @deprecated use MESSAGE_VARIABLES_EN */
export const MESSAGE_VARIABLES = MESSAGE_VARIABLES_EN;

export function buildMessageVariableMap({
  name,
  firstName,
  serviceType,
  lastDetailDate,
  daysSince,
  reviewUrl,
  bookingUrl,
  bookingUrls,
}) {
  const serviceEn = formatServiceLabel(serviceType);
  const serviceFr = formatServiceLabelFr(serviceType);
  const dateEn = formatDetailDate(lastDetailDate);
  const dateFr = formatDetailDateFr(lastDetailDate);
  const days = String(daysSince ?? "");

  const maintenanceUrl = bookingUrls?.maintenance ?? bookingUrl ?? "";
  const generalUrl = bookingUrls?.general ?? "";
  const afterMaintenanceUrl = bookingUrls?.after_maintenance ?? "";
  const primaryUrl = bookingUrl ?? maintenanceUrl;
  const reviewLink = reviewUrl ?? "";

  return {
    name,
    first_name: firstName,
    service: serviceEn,
    last_detail_date: dateEn,
    days_since: days,
    review_url: reviewLink,
    booking_url: primaryUrl,
    booking_url_maintenance: maintenanceUrl,
    booking_url_general: generalUrl,
    booking_url_after_maintenance: afterMaintenanceUrl,

    nom: name,
    prenom: firstName,
    detail: serviceFr,
    service_fr: serviceFr,
    date_dernier_detail: dateFr,
    date_detail: dateFr,
    jours_depuis: days,
    nombre_jours: days,
    lien_avis: reviewLink,
    lien_reservation: primaryUrl,
    lien_entretien: maintenanceUrl,
    lien_general: generalUrl,
    lien_apres_entretien: afterMaintenanceUrl,
    url_reservation: primaryUrl,
  };
}
