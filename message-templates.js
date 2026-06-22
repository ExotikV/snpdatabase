export {
  DEFAULT_REMINDER_MESSAGE_BODY,
  REMINDER_MESSAGE_VARIABLES,
  REMINDER_MESSAGE_SAMPLE,
  buildMaintenanceReminderBookingUrl,
  buildMaintenanceReminderMessage,
  buildReminderMessageVariables,
  formatDetailDate,
  getDefaultMessageBodyForStep,
  getFirstName,
  previewReminderMessage,
  renderReminderMessage,
} from "./reminder-message.js";

// Backward-compatible alias used by older docs/imports.
export { buildMaintenanceReminderMessage as buildMaintenanceReminderMessageFromTemplate } from "./reminder-message.js";
