import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workspaces } from "./workspaces.js";
import { connections } from "./connections.js";
import { vector } from "./embeddings.js";
import { EMBEDDING } from "@openellie/shared/constants";

/**
 * GitHub Pull Requests — synced from GitHub REST API.
 * Embedding is generated from: title + body + labels + head_branch.
 */
export const githubPullRequests = pgTable(
  "github_pull_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    connectionId: uuid("connection_id")
      .references(() => connections.id, { onDelete: "cascade" })
      .notNull(),

    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),

    /** GitHub internal PR ID — unique across all repos. */
    githubId: text("github_id").unique().notNull(),

    /** PR number within the repository. */
    number: integer("number").notNull(),

    title: text("title").notNull(),

    /** PR body/description. May be null if empty. */
    body: text("body"),

    /** PR state: 'open' | 'closed' | 'merged' */
    state: text("state").notNull(),

    /** GitHub login of the PR author. */
    author: text("author").notNull(),

    /** Array of GitHub logins assigned to this PR. */
    assignees: text("assignees").array().default(sql`ARRAY[]::text[]`).notNull(),

    /** Array of GitHub logins requested as reviewers. */
    reviewers: text("reviewers").array().default(sql`ARRAY[]::text[]`).notNull(),

    /** Array of label names applied to this PR. */
    labels: text("labels").array().default(sql`ARRAY[]::text[]`).notNull(),

    /** Base branch name (merge target). */
    baseBranch: text("base_branch").notNull(),

    /** Head branch name (source). */
    headBranch: text("head_branch").notNull(),

    /** Full repository name: owner/repo. */
    repoName: text("repo_name").notNull(),

    /** Lines added in this PR. */
    additions: integer("additions").default(0).notNull(),

    /** Lines deleted in this PR. */
    deletions: integer("deletions").default(0).notNull(),

    /** Whether this PR is a draft. */
    draft: boolean("draft").default(false).notNull(),

    mergedAt: timestamp("merged_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),

    /** PR creation time on GitHub. */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),

    /** PR last update time on GitHub. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),

    /**
     * Semantic embedding for hybrid search.
     * Generated from: title + body + labels + head_branch.
     * 1536 dimensions (text-embedding-3-small or voyage-3-large).
     */
    embedding: vector("embedding", { dimensions: EMBEDDING.DIMENSIONS }),

    /**
     * Full-text search vector (auto-maintained via trigger or updated on sync).
     * Generated from title + body.
     */
    searchVector: text("search_vector"),
  },
  (t) => [
    index("github_prs_workspace_id_idx").on(t.workspaceId),
    index("github_prs_connection_id_idx").on(t.connectionId),
    index("github_prs_state_idx").on(t.state),
    index("github_prs_author_idx").on(t.author),
    index("github_prs_repo_idx").on(t.repoName),
    index("github_prs_updated_at_idx").on(t.updatedAt),
    // GIN index for full-text search — created via raw SQL in migration
  ],
);

/**
 * GitHub Commits — synced from GitHub REST API.
 * Embedding is generated from: message + repo_name (first 500 chars).
 */
export const githubCommits = pgTable(
  "github_commits",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    connectionId: uuid("connection_id")
      .references(() => connections.id, { onDelete: "cascade" })
      .notNull(),

    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),

    /** Git commit SHA — unique identifier. */
    sha: text("sha").unique().notNull(),

    /** Full commit message. */
    message: text("message").notNull(),

    /** Committer display name. */
    authorName: text("author_name").notNull(),

    /** Committer email address. */
    authorEmail: text("author_email").notNull(),

    /** Full repository name: owner/repo. */
    repoName: text("repo_name").notNull(),

    additions: integer("additions").default(0).notNull(),
    deletions: integer("deletions").default(0).notNull(),

    /** Commit timestamp. */
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull(),

    /** Semantic embedding: message + repo_name (first 500 chars). */
    embedding: vector("embedding", { dimensions: EMBEDDING.DIMENSIONS }),
  },
  (t) => [
    index("github_commits_workspace_id_idx").on(t.workspaceId),
    index("github_commits_connection_id_idx").on(t.connectionId),
    index("github_commits_repo_idx").on(t.repoName),
    index("github_commits_committed_at_idx").on(t.committedAt),
    index("github_commits_author_email_idx").on(t.authorEmail),
  ],
);

/**
 * GitHub PR Reviews — synced alongside pull requests.
 */
export const githubReviews = pgTable(
  "github_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    prId: uuid("pr_id")
      .references(() => githubPullRequests.id, { onDelete: "cascade" })
      .notNull(),

    /** GitHub login of the reviewer. */
    reviewer: text("reviewer").notNull(),

    /** Review state: 'approved' | 'changes_requested' | 'commented' | 'dismissed' */
    state: text("state").notNull(),

    /** Review comment body. May be empty for approvals. */
    body: text("body"),

    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("github_reviews_pr_id_idx").on(t.prId),
    index("github_reviews_reviewer_idx").on(t.reviewer),
  ],
);

/**
 * GitHub Releases — used as a proxy for deployment events.
 * Enables queries like "commits deployed before the Sentry spike at 3pm yesterday".
 */
export const githubReleases = pgTable(
  "github_releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    connectionId: uuid("connection_id")
      .references(() => connections.id, { onDelete: "cascade" })
      .notNull(),

    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),

    /** GitHub release ID — unique. */
    githubId: text("github_id").unique().notNull(),

    /** Release tag name. e.g. 'v1.2.3' */
    tagName: text("tag_name").notNull(),

    /** Release title. */
    name: text("name"),

    /** Release body/notes. */
    body: text("body"),

    /** Full repository name: owner/repo. */
    repoName: text("repo_name").notNull(),

    /** The commit SHA this release points to. */
    targetCommitish: text("target_commitish").notNull(),

    /** Whether this is a prerelease / draft. */
    draft: boolean("draft").default(false).notNull(),
    prerelease: boolean("prerelease").default(false).notNull(),

    /** Release publish time — used as the deployment time. */
    publishedAt: timestamp("published_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("github_releases_workspace_id_idx").on(t.workspaceId),
    index("github_releases_repo_idx").on(t.repoName),
    index("github_releases_published_at_idx").on(t.publishedAt),
  ],
);

export type GithubPullRequest = typeof githubPullRequests.$inferSelect;
export type NewGithubPullRequest = typeof githubPullRequests.$inferInsert;

export type GithubCommit = typeof githubCommits.$inferSelect;
export type NewGithubCommit = typeof githubCommits.$inferInsert;

export type GithubReview = typeof githubReviews.$inferSelect;
export type NewGithubReview = typeof githubReviews.$inferInsert;

export type GithubRelease = typeof githubReleases.$inferSelect;
export type NewGithubRelease = typeof githubReleases.$inferInsert;
