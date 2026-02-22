import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import {
  githubPullRequests,
  githubCommits,
  githubReviews,
  githubReleases,
  type GithubPullRequest,
  type NewGithubPullRequest,
  type GithubCommit,
  type NewGithubCommit,
  type NewGithubReview,
  type NewGithubRelease,
} from "@openellie/db/schema";
import { getDatabase } from "../client.js";
import { DatabaseError } from "../../errors.js";

/**
 * Upserts a batch of GitHub pull requests by their GitHub ID.
 * Updates all fields on conflict.
 *
 * @param prs - Array of PR records to upsert.
 * @returns Number of rows affected.
 */
export async function upsertPullRequests(
  prs: NewGithubPullRequest[],
): Promise<number> {
  if (prs.length === 0) return 0;
  const db = getDatabase();

  try {
    const result = await db
      .insert(githubPullRequests)
      .values(prs)
      .onConflictDoUpdate({
        target: githubPullRequests.githubId,
        set: {
          title: sql`excluded.title`,
          body: sql`excluded.body`,
          state: sql`excluded.state`,
          assignees: sql`excluded.assignees`,
          reviewers: sql`excluded.reviewers`,
          labels: sql`excluded.labels`,
          additions: sql`excluded.additions`,
          deletions: sql`excluded.deletions`,
          draft: sql`excluded.draft`,
          mergedAt: sql`excluded.merged_at`,
          closedAt: sql`excluded.closed_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    return result.length;
  } catch (error) {
    throw new DatabaseError("Failed to upsert pull requests", error);
  }
}

/**
 * Upserts a batch of GitHub commits by their SHA.
 *
 * @param commits - Array of commit records to upsert.
 * @returns Number of rows affected.
 */
export async function upsertCommits(
  commits: NewGithubCommit[],
): Promise<number> {
  if (commits.length === 0) return 0;
  const db = getDatabase();

  try {
    const result = await db
      .insert(githubCommits)
      .values(commits)
      .onConflictDoUpdate({
        target: githubCommits.sha,
        set: {
          message: sql`excluded.message`,
          authorName: sql`excluded.author_name`,
          authorEmail: sql`excluded.author_email`,
          additions: sql`excluded.additions`,
          deletions: sql`excluded.deletions`,
        },
      });

    return result.length;
  } catch (error) {
    throw new DatabaseError("Failed to upsert commits", error);
  }
}

/**
 * Upserts GitHub reviews for a given PR.
 * Deletes existing reviews for the PR and re-inserts to handle state changes.
 *
 * @param prId - Internal UUID of the pull request.
 * @param reviews - Array of review records to upsert.
 */
export async function upsertReviews(
  _prId: string,
  reviews: NewGithubReview[],
): Promise<void> {
  if (reviews.length === 0) return;
  const db = getDatabase();

  try {
    await db.insert(githubReviews).values(reviews).onConflictDoNothing();
  } catch (error) {
    throw new DatabaseError("Failed to upsert reviews", error);
  }
}

/**
 * Upserts GitHub releases by their GitHub ID.
 *
 * @param releases - Array of release records to upsert.
 * @returns Number of rows affected.
 */
export async function upsertReleases(
  releases: NewGithubRelease[],
): Promise<number> {
  if (releases.length === 0) return 0;
  const db = getDatabase();

  try {
    const result = await db
      .insert(githubReleases)
      .values(releases)
      .onConflictDoUpdate({
        target: githubReleases.githubId,
        set: {
          name: sql`excluded.name`,
          body: sql`excluded.body`,
          tagName: sql`excluded.tag_name`,
          draft: sql`excluded.draft`,
          prerelease: sql`excluded.prerelease`,
          publishedAt: sql`excluded.published_at`,
        },
      });

    return result.length;
  } catch (error) {
    throw new DatabaseError("Failed to upsert releases", error);
  }
}

/**
 * Fetches pull requests by workspace, optionally filtered by state or time range.
 *
 * @param workspaceId - Workspace UUID.
 * @param options - Optional filters.
 */
export async function getPullRequests(
  workspaceId: string,
  options: {
    state?: string;
    author?: string;
    repoName?: string;
    since?: Date;
    until?: Date;
    limit?: number;
  } = {},
): Promise<GithubPullRequest[]> {
  const db = getDatabase();

  try {
    const conditions = [eq(githubPullRequests.workspaceId, workspaceId)];

    if (options.state) {
      conditions.push(eq(githubPullRequests.state, options.state));
    }
    if (options.author) {
      conditions.push(eq(githubPullRequests.author, options.author));
    }
    if (options.repoName) {
      conditions.push(eq(githubPullRequests.repoName, options.repoName));
    }
    if (options.since) {
      conditions.push(gte(githubPullRequests.updatedAt, options.since));
    }
    if (options.until) {
      conditions.push(lte(githubPullRequests.updatedAt, options.until));
    }

    return db
      .select()
      .from(githubPullRequests)
      .where(and(...conditions))
      .orderBy(desc(githubPullRequests.updatedAt))
      .limit(options.limit ?? 50);
  } catch (error) {
    throw new DatabaseError("Failed to fetch pull requests", error);
  }
}

/**
 * Fetches PRs that need embeddings generated (embedding IS NULL).
 *
 * @param workspaceId - Workspace UUID.
 * @param limit - Maximum number of rows to return.
 */
export async function getPrsNeedingEmbedding(
  workspaceId: string,
  limit = 100,
): Promise<Pick<GithubPullRequest, "id" | "title" | "body" | "labels" | "headBranch">[]> {
  const db = getDatabase();

  try {
    return db
      .select({
        id: githubPullRequests.id,
        title: githubPullRequests.title,
        body: githubPullRequests.body,
        labels: githubPullRequests.labels,
        headBranch: githubPullRequests.headBranch,
      })
      .from(githubPullRequests)
      .where(
        and(
          eq(githubPullRequests.workspaceId, workspaceId),
          sql`${githubPullRequests.embedding} IS NULL`,
        ),
      )
      .limit(limit);
  } catch (error) {
    throw new DatabaseError("Failed to fetch PRs needing embedding", error);
  }
}

/**
 * Updates the embedding vector for a pull request.
 *
 * @param id - PR UUID.
 * @param embedding - 1536-dimensional float array.
 */
export async function updatePrEmbedding(
  id: string,
  embedding: number[],
): Promise<void> {
  const db = getDatabase();

  try {
    await db
      .update(githubPullRequests)
      .set({ embedding })
      .where(eq(githubPullRequests.id, id));
  } catch (error) {
    throw new DatabaseError("Failed to update PR embedding", error);
  }
}

/**
 * Updates the embedding vector for a commit.
 *
 * @param id - Commit UUID.
 * @param embedding - 1536-dimensional float array.
 */
export async function updateCommitEmbedding(
  id: string,
  embedding: number[],
): Promise<void> {
  const db = getDatabase();

  try {
    await db
      .update(githubCommits)
      .set({ embedding })
      .where(eq(githubCommits.id, id));
  } catch (error) {
    throw new DatabaseError("Failed to update commit embedding", error);
  }
}

/**
 * Fetches commits that need embeddings generated.
 *
 * @param workspaceId - Workspace UUID.
 * @param limit - Maximum number of rows to return.
 */
export async function getCommitsNeedingEmbedding(
  workspaceId: string,
  limit = 100,
): Promise<Pick<GithubCommit, "id" | "message" | "repoName">[]> {
  const db = getDatabase();

  try {
    return db
      .select({
        id: githubCommits.id,
        message: githubCommits.message,
        repoName: githubCommits.repoName,
      })
      .from(githubCommits)
      .where(
        and(
          eq(githubCommits.workspaceId, workspaceId),
          sql`${githubCommits.embedding} IS NULL`,
        ),
      )
      .limit(limit);
  } catch (error) {
    throw new DatabaseError("Failed to fetch commits needing embedding", error);
  }
}

/**
 * Wipes all embeddings for a workspace (called when AI provider changes).
 *
 * @param workspaceId - Workspace UUID.
 */
export async function wipeGithubEmbeddings(workspaceId: string): Promise<void> {
  const db = getDatabase();

  try {
    await db
      .update(githubPullRequests)
      .set({ embedding: null })
      .where(eq(githubPullRequests.workspaceId, workspaceId));

    await db
      .update(githubCommits)
      .set({ embedding: null })
      .where(eq(githubCommits.workspaceId, workspaceId));
  } catch (error) {
    throw new DatabaseError("Failed to wipe GitHub embeddings", error);
  }
}
