/**
 * Map dashboard Netlify env names to backend script env names.
 */
export function applyBackendEnvFromDashboard() {
  if (!process.env.SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
  }
}
