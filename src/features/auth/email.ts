export const SAGEN_EMAIL_DOMAIN = "@sagen-groupe.com";

/**
 * Accepts either a Sagen email prefix (for example, `admin`) or a complete
 * email address and returns the value sent to Supabase Auth.
 */
export function normalizeLoginEmail(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (!normalized || normalized.includes("@")) {
    return normalized;
  }

  return `${normalized}${SAGEN_EMAIL_DOMAIN}`;
}
