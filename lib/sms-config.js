const DEFAULT_TEST_PHONE = "+15149841671";

/** When false, scheduled and manual reminder sends are blocked. Test SMS still works. */
export function isProductionSmsEnabled() {
  return process.env.SMS_PRODUCTION_SENDS_ENABLED === "true";
}

export function getTestPhoneNumber(override) {
  return override?.trim() || process.env.SMS_TEST_PHONE_NUMBER?.trim() || DEFAULT_TEST_PHONE;
}

export function getSmsSafetyStatus() {
  return {
    productionSendsEnabled: isProductionSmsEnabled(),
    testPhone: getTestPhoneNumber(),
  };
}
