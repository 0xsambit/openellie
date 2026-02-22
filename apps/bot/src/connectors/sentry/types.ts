/**
 * Sentry connector types — Phase 2 stubs.
 *
 * These types are placeholders for the Phase 2 Sentry connector implementation.
 * The connector itself throws NotImplementedError until Phase 2.
 */

export interface SentryCredentials {
  /** Sentry auth token (Settings → API → Auth Tokens) */
  authToken: string;
  /** Sentry organization slug */
  organizationSlug: string;
}

export interface SentryConfig {
  /** Sentry project slugs to sync */
  projectSlugs: string[];
  /** Optional: only sync issues with these tags */
  environments?: string[];
}
