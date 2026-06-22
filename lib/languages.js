export const LANGUAGES = {
  EN: "en",
  FR: "fr",
};

export const LANGUAGE_LABELS = {
  en: "English",
  fr: "French",
};

export function normalizeLanguage(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "fr" || normalized === "french" || normalized === "francais" || normalized === "français") {
    return LANGUAGES.FR;
  }

  return LANGUAGES.EN;
}

export function parseLanguage(value) {
  if (value === LANGUAGES.FR || value === LANGUAGES.EN) return value;
  return null;
}
