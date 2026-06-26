/** Cities where clients may enroll in the maintenance program. */
export const ELIGIBLE_CITIES = [
  "Saint-Lazare",
  "Hudson",
  "Vaudreuil-Dorion",
  "Vaudreuil",
  "Dorion",
  "Vaudreuil-sur-le-Lac",
  "L'Île-Cadieux",
  "Pincourt",
  "L'Île-Perrot",
  "Notre-Dame-de-l'Île-Perrot",
  "Rigaud",
  "Sainte-Marthe",
  "Saint-Clet",
  "Saint-Polycarpe",
  "Sainte-Justine-de-Newton",
  "Très-Saint-Rédempteur",
  "Pont-Château",
  "Les Cèdres",
  "Pointe-des-Cascades",
  "Coteau-du-Lac",
  "Pointe-Calumet",
  "Salaberry-de-Valleyfield",
  "Valleyfield",
  "Beauharnois",
  "Senneville",
  "Pierrefonds",
  "Pierrefonds-Roxboro",
  "Kirkland",
  "Beaconsfield",
  "Baie-D'Urfé",
];

const REGION_SUFFIX_PATTERN = /\s*,?\s*(qc|quebec|on|ontario|canada)\s*$/i;

/**
 * Normalize one word/segment: St, St., Ste, Saint, Sainte, etc. → saint / sainte.
 * Applied to every segment of any city name (not only Saint-Lazare).
 */
function normalizeSaintSegment(segment) {
  if (!segment) return "";

  const part = segment.trim().toLowerCase();
  if (!part) return "";

  if (part === "ste" || part === "sainte") return "sainte";
  if (part === "st" || part === "saint") return "saint";

  const saintePrefix = part.match(/^sainte(?:[.\s-]+(.+))?$/);
  if (saintePrefix) {
    const tail = saintePrefix[1] ? normalizeSaintSegment(saintePrefix[1]) : "";
    return tail ? `sainte ${tail}` : "sainte";
  }

  const stePrefix = part.match(/^ste(?:[.\s-]+(.+))?$/);
  if (stePrefix) {
    const tail = stePrefix[1] ? normalizeSaintSegment(stePrefix[1]) : "";
    return tail ? `sainte ${tail}` : "sainte";
  }

  const steGlued = part.match(/^ste([a-z].+)$/);
  if (steGlued) {
    const tail = normalizeSaintSegment(steGlued[1]);
    return tail ? `sainte ${tail}` : "sainte";
  }

  const saintPrefix = part.match(/^saint(?:[.\s-]+(.+))?$/);
  if (saintPrefix) {
    const tail = saintPrefix[1] ? normalizeSaintSegment(saintPrefix[1]) : "";
    return tail ? `saint ${tail}` : "saint";
  }

  const saintGlued = part.match(/^saint([a-z].+)$/);
  if (saintGlued) {
    const tail = normalizeSaintSegment(saintGlued[1]);
    return tail ? `saint ${tail}` : "saint";
  }

  const stPrefix = part.match(/^st(?:[.\s-]+(.+))?$/);
  if (stPrefix) {
    const tail = stPrefix[1] ? normalizeSaintSegment(stPrefix[1]) : "";
    return tail ? `saint ${tail}` : "saint";
  }

  const stGlued = part.match(/^st([a-z].+)$/);
  if (stGlued) {
    const tail = normalizeSaintSegment(stGlued[1]);
    return tail ? `saint ${tail}` : "saint";
  }

  return part;
}

/**
 * Normalize a city name for comparison (case, accents, apostrophes, Saint/St on every part).
 */
export function normalizeCityKey(value) {
  if (!value?.trim()) {
    return "";
  }

  const normalized = value
    .trim()
    .replace(REGION_SUFFIX_PATTERN, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[.,]+/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  return normalized
    .split(" ")
    .filter(Boolean)
    .map(normalizeSaintSegment)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const ELIGIBLE_CITY_KEYS = new Set(ELIGIBLE_CITIES.map(normalizeCityKey));

export function isEligibleCity(city) {
  const key = normalizeCityKey(city);
  if (!key) {
    return false;
  }
  return ELIGIBLE_CITY_KEYS.has(key);
}

export function getEligibleCityLabels() {
  return [...ELIGIBLE_CITIES];
}
