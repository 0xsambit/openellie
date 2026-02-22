/**
 * Linear connector types — Phase 2 stubs.
 *
 * These types are placeholders for the Phase 2 Linear connector implementation.
 * The connector itself throws NotImplementedError until Phase 2.
 */

export interface LinearCredentials {
  /** Linear personal API key or OAuth token */
  apiKey: string;
}

export interface LinearConfig {
  /** Linear team IDs to sync */
  teamIds: string[];
  /** Optional: only sync issues with these label names */
  labels?: string[];
}
