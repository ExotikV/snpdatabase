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

const ELIGIBLE_CITY_KEYS = new Set(ELIGIBLE_CITIES.map(normalizeCityKey));

/**
 * Normalize a city name for comparison (case, accents, apostrophes, Saint/St).
 */
export function normalizeCityKey(value) {
  if (!value?.trim()) {
    return "";
  }

  return value
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/^st[-\s]/, "saint ")
    .replace(/^ste[-\s]/, "sainte ")
    .replace(/\bst\b/g, "saint")
    .replace(/\bste\b/g, "sainte")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
