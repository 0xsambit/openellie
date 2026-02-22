import type { Octokit } from "@octokit/rest";
import { BaseConnector } from "../base.js";
import {
  createGitHubClient,
  checkGitHubRateLimit,
  parseNextPage,
} from "./client.js";
import {
  upsertPullRequests,
  upsertCommits,
  upsertReviews,
  upsertReleases,
} from "../../lib/db/queries/github.js";
import {
  getConnectionById,
  updateConnectionLastSynced,
} from "../../lib/db/queries/connections.js";
import { updateSyncJob } from "../../lib/db/queries/sync-jobs.js";
import { decryptJSON } from "../../lib/crypto.js";
import { logger } from "../../lib/logger.js";
import { retry } from "@openellie/shared/utils";
import {
  ConnectorError,
  AuthenticationError,
  RateLimitError,
} from "../../lib/errors.js";
import { ConnectorType } from "@openellie/shared/types";
import type {
  GitHubCredentials,
  GitHubConfig,
  GitHubAPIPullRequest,
  GitHubAPICommit,
  GitHubAPIReview,
  GitHubAPIRelease,
} from "./types.js";
import type { SyncOptions, SyncResult, HealthStatus } from "../base.js";
import type { NewGithubPullRequest, NewGithubCommit, NewGithubReview, NewGithubRelease } from "@openellie/db/schema";

/**
 * GitHub connector — syncs pull requests, commits, reviews, and releases.
 *
 * Uses GitHub REST API via Octokit.js v4.
 * Respects rate limits (5000 req/hr) with X-RateLimit-Remaining header checks.
 * Supports incremental sync via `since` timestamp and conditional GET with ETags.
 */
export class GitHubConnector extends BaseConnector {
  readonly type = ConnectorType.GITHUB;

  private _client: Octokit | null = null;
  private _credentials: GitHubCredentials | null = null;

  /**
   * Validates GitHub PAT credentials by making a test API call.
   *
   * @param credentials - GitHubCredentials to validate.
   * @throws AuthenticationError if PAT is invalid.
   */
  async validate(credentials: unknown): Promise<void> {
    const creds = credentials as GitHubCredentials;
    const client = createGitHubClient(creds.pat);

    try {
      const { data } = await client.rest.users.getAuthenticated();
      logger.info({ githubLogin: data.login }, "GitHub credentials validated");
    } catch (error) {
      throw new AuthenticationError(
        "github",
        "Invalid GitHub PAT — authentication failed. " +
          "Check that the token has the required scopes: repo, read:user, read:org",
        error,
      );
    }
  }

  protected async performSync(
    connectionId: string,
    options: SyncOptions,
  ): Promise<SyncResult> {
    const { client, config } = await this.getClientAndConfig(connectionId);
    return this.syncRepos(client, config, connectionId, options, null);
  }

  protected async performIncrementalSync(
    connectionId: string,
    since: Date,
    options: SyncOptions,
  ): Promise<SyncResult> {
    const { client, config } = await this.getClientAndConfig(connectionId);
    return this.syncRepos(client, config, connectionId, options, since);
  }

  /**
   * Returns health status by checking GitHub API connectivity.
   */
  async getHealthStatus(): Promise<HealthStatus> {
    try {
      if (!this._client || !this._credentials) {
        return {
          healthy: false,
          message: "Client not initialized",
          checkedAt: new Date(),
        };
      }

      const start = Date.now();
      await this._client.rest.meta.get();
      const latencyMs = Date.now() - start;

      return { healthy: true, latencyMs, checkedAt: new Date() };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  /**
   * Loads and decrypts credentials, initializes the Octokit client.
   */
  private async getClientAndConfig(
    connectionId: string,
  ): Promise<{ client: Octokit; config: GitHubConfig }> {
    const connection = await getConnectionById(connectionId);
    if (!connection) {
      throw new ConnectorError(
        `Connection ${connectionId} not found`,
        "github",
      );
    }

    const credentials = decryptJSON<GitHubCredentials>(
      connection.encryptedCredentials,
      this.workspaceId,
    );

    const config = (connection.config ?? { repos: [] }) as GitHubConfig;

    this._credentials = credentials;
    this._client = createGitHubClient(credentials.pat);

    return { client: this._client, config };
  }

  /**
   * Syncs all configured repositories.
   *
   * @param client - Authenticated Octokit client.
   * @param config - GitHub connector configuration.
   * @param connectionId - Database connection UUID.
   * @param options - Sync options.
   * @param since - Optional incremental sync cutoff timestamp.
   */
  private async syncRepos(
    client: Octokit,
    config: GitHubConfig,
    connectionId: string,
    options: SyncOptions,
    since: Date | null,
  ): Promise<SyncResult> {
    const repos = config.repos;

    if (repos.length === 0) {
      logger.warn({ connectionId }, "No repos configured for GitHub connector");
      return {
        itemsSynced: 0,
        itemsFailed: 0,
        errors: ["No repositories configured. Add repos to GITHUB_REPOS env var."],
        lastSyncedAt: new Date(),
      };
    }

    let totalSynced = 0;
    let totalFailed = 0;
    const errors: string[] = [];

    for (const repo of repos) {
      const [owner, repoName] = repo.split("/");
      if (!owner || !repoName) {
        errors.push(`Invalid repo format: ${repo} (expected owner/repo)`);
        continue;
      }

      logger.info({ repo, connectionId, since }, "Syncing GitHub repo");

      try {
        const result = await this.syncSingleRepo(
          client,
          owner,
          repoName,
          connectionId,
          options,
          since,
        );
        totalSynced += result.itemsSynced;
        totalFailed += result.itemsFailed;
        errors.push(...result.errors);
      } catch (error) {
        const msg = `Failed to sync ${repo}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(msg);
        logger.error({ err: error, repo }, "Repo sync failed");
      }

      // Update progress
      await updateSyncJob(options.jobId, {
        processedItems: totalSynced,
        failedItems: totalFailed,
      });
    }

    // Update last synced timestamp on connection
    await updateConnectionLastSynced(connectionId, new Date());

    return {
      itemsSynced: totalSynced,
      itemsFailed: totalFailed,
      errors,
      lastSyncedAt: new Date(),
    };
  }

  /**
   * Syncs a single GitHub repository: PRs, commits, releases.
   */
  private async syncSingleRepo(
    client: Octokit,
    owner: string,
    repo: string,
    connectionId: string,
    _options: SyncOptions,
    since: Date | null,
  ): Promise<SyncResult> {
    let itemsSynced = 0;
    let itemsFailed = 0;
    const errors: string[] = [];

    // Sync PRs
    try {
      const prCount = await this.syncPullRequests(
        client,
        owner,
        repo,
        connectionId,
        since,
      );
      itemsSynced += prCount;
      logger.debug({ owner, repo, prCount }, "PRs synced");
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      const msg = `PR sync failed for ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(msg);
      itemsFailed++;
    }

    // Sync commits (default branch)
    try {
      const commitCount = await this.syncCommits(
        client,
        owner,
        repo,
        connectionId,
        since,
      );
      itemsSynced += commitCount;
      logger.debug({ owner, repo, commitCount }, "Commits synced");
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      const msg = `Commit sync failed for ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(msg);
      itemsFailed++;
    }

    // Sync releases (used as deployment proxy)
    try {
      const releaseCount = await this.syncReleases(
        client,
        owner,
        repo,
        connectionId,
        since,
      );
      itemsSynced += releaseCount;
      logger.debug({ owner, repo, releaseCount }, "Releases synced");
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      const msg = `Release sync failed for ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(msg);
      itemsFailed++;
    }

    return { itemsSynced, itemsFailed, errors, lastSyncedAt: new Date() };
  }

  /**
   * Fetches and upserts all pull requests for a repository.
   *
   * @returns Number of PRs synced.
   */
  private async syncPullRequests(
    client: Octokit,
    owner: string,
    repo: string,
    connectionId: string,
    since: Date | null,
  ): Promise<number> {
    let totalSynced = 0;
    let page = 1;

    while (true) {
      const params: Parameters<typeof client.rest.pulls.list>[0] = {
        owner,
        repo,
        state: "all",
        sort: "updated",
        direction: "desc",
        per_page: 100,
        page,
      };

      const response = await retry(
        () => client.rest.pulls.list(params),
        {
          maxAttempts: 3,
          initialDelayMs: 1000,
          onRetry: (attempt, err) =>
            logger.warn({ attempt, err }, "Retrying PR list request"),
        },
      );

      // Check rate limit
      checkGitHubRateLimit(
        connectionId,
        response.headers["x-ratelimit-remaining"],
        response.headers["x-ratelimit-reset"],
      );

      const prs = response.data as unknown as GitHubAPIPullRequest[];

      if (prs.length === 0) break;

      // Stop pagination if all remaining PRs are older than `since`
      if (since && prs.every((pr) => new Date(pr.updated_at) < since)) {
        break;
      }

      // Filter to only items updated since the cutoff
      const filteredPrs = since
        ? prs.filter((pr) => new Date(pr.updated_at) >= since)
        : prs;

      // Transform to DB format
      const prRecords: NewGithubPullRequest[] = filteredPrs.map((pr) => ({
        connectionId,
        workspaceId: this.workspaceId,
        githubId: String(pr.id),
        number: pr.number,
        title: pr.title,
        body: pr.body ?? null,
        state: pr.state,
        author: pr.user?.login ?? "unknown",
        assignees: pr.assignees.map((a) => a.login),
        reviewers: pr.requested_reviewers.map((r) => r.login),
        labels: pr.labels.map((l) => l.name),
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        repoName: pr.head.repo?.full_name ?? `${owner}/${repo}`,
        additions: pr.additions,
        deletions: pr.deletions,
        draft: pr.draft,
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
        createdAt: new Date(pr.created_at),
        updatedAt: new Date(pr.updated_at),
      }));

      await upsertPullRequests(prRecords);
      totalSynced += prRecords.length;

      // Sync reviews for open/recently updated PRs
      for (const pr of filteredPrs.filter((p) => p.state === "open").slice(0, 20)) {
        await this.syncPRReviews(client, owner, repo, pr.number, connectionId);
      }

      // Stop if last page or no next page
      const nextPage = parseNextPage(response.headers["link"]);
      if (!nextPage) break;
      page = nextPage;
    }

    return totalSynced;
  }

  /**
   * Fetches and upserts reviews for a specific PR.
   */
  private async syncPRReviews(
    client: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    _connectionId: string,
  ): Promise<void> {
    try {
      const response = await retry(
        () =>
          client.rest.pulls.listReviews({
            owner,
            repo,
            pull_number: prNumber,
            per_page: 100,
          }),
        { maxAttempts: 2 },
      );

      const reviews = response.data as GitHubAPIReview[];
      if (reviews.length === 0) return;

      // Find the PR UUID from our DB to create reviews with the right FK
      const db = (await import("../../lib/db/client.js")).getDatabase();
      const prRows = await db.query.githubPullRequests.findMany({
        where: (t, { eq, and }) =>
          and(
            eq(t.number, prNumber),
            eq(t.repoName, `${owner}/${repo}`),
          ),
        columns: { id: true },
        limit: 1,
      });

      const prId = prRows[0]?.id;
      if (!prId) return;

      const reviewRecords: NewGithubReview[] = reviews.map((review) => ({
        prId,
        reviewer: review.user?.login ?? "unknown",
        state: review.state.toLowerCase(),
        body: review.body || null,
        submittedAt: new Date(review.submitted_at),
      }));

      await upsertReviews(prId, reviewRecords);
    } catch (error) {
      // Non-critical — continue if review fetch fails
      logger.debug(
        { err: error, prNumber, owner, repo },
        "Failed to sync PR reviews (non-critical)",
      );
    }
  }

  /**
   * Fetches and upserts commits for the default branch.
   *
   * @returns Number of commits synced.
   */
  private async syncCommits(
    client: Octokit,
    owner: string,
    repo: string,
    connectionId: string,
    since: Date | null,
  ): Promise<number> {
    let totalSynced = 0;
    let page = 1;

    while (true) {
      const params: Parameters<typeof client.rest.repos.listCommits>[0] = {
        owner,
        repo,
        per_page: 100,
        page,
        ...(since ? { since: since.toISOString() } : {}),
      };

      const response = await retry(
        () => client.rest.repos.listCommits(params),
        {
          maxAttempts: 3,
          initialDelayMs: 1000,
        },
      );

      checkGitHubRateLimit(
        connectionId,
        response.headers["x-ratelimit-remaining"],
        response.headers["x-ratelimit-reset"],
      );

      const commits = response.data as GitHubAPICommit[];
      if (commits.length === 0) break;

      const commitRecords: NewGithubCommit[] = commits
        .filter((c) => c.commit.author?.date)
        .map((c) => ({
          connectionId,
          workspaceId: this.workspaceId,
          sha: c.sha,
          message: c.commit.message,
          authorName: c.commit.author?.name ?? "unknown",
          authorEmail: c.commit.author?.email ?? "",
          repoName: `${owner}/${repo}`,
          additions: c.stats?.additions ?? 0,
          deletions: c.stats?.deletions ?? 0,
          committedAt: new Date(c.commit.author?.date ?? new Date()),
        }));

      await upsertCommits(commitRecords);
      totalSynced += commitRecords.length;

      const nextPage = parseNextPage(response.headers["link"]);
      if (!nextPage) break;
      page = nextPage;
    }

    return totalSynced;
  }

  /**
   * Fetches and upserts GitHub releases.
   * Releases are used as deployment proxies for cross-source queries.
   *
   * @returns Number of releases synced.
   */
  private async syncReleases(
    client: Octokit,
    owner: string,
    repo: string,
    connectionId: string,
    since: Date | null,
  ): Promise<number> {
    let totalSynced = 0;
    let page = 1;

    while (true) {
      const response = await retry(
        () =>
          client.rest.repos.listReleases({
            owner,
            repo,
            per_page: 100,
            page,
          }),
        { maxAttempts: 3 },
      );

      checkGitHubRateLimit(
        connectionId,
        response.headers["x-ratelimit-remaining"],
        response.headers["x-ratelimit-reset"],
      );

      const releases = response.data as GitHubAPIRelease[];
      if (releases.length === 0) break;

      // Stop if releases are older than since
      if (since && releases.every((r) => new Date(r.created_at) < since)) {
        break;
      }

      const filteredReleases = since
        ? releases.filter((r) => new Date(r.created_at) >= since)
        : releases;

      const releaseRecords: NewGithubRelease[] = filteredReleases.map((r) => ({
        connectionId,
        workspaceId: this.workspaceId,
        githubId: String(r.id),
        tagName: r.tag_name,
        name: r.name,
        body: r.body,
        repoName: `${owner}/${repo}`,
        targetCommitish: r.target_commitish,
        draft: r.draft,
        prerelease: r.prerelease,
        publishedAt: r.published_at ? new Date(r.published_at) : null,
        createdAt: new Date(r.created_at),
      }));

      await upsertReleases(releaseRecords);
      totalSynced += releaseRecords.length;

      const nextPage = parseNextPage(response.headers["link"]);
      if (!nextPage) break;
      page = nextPage;
    }

    return totalSynced;
  }
}
