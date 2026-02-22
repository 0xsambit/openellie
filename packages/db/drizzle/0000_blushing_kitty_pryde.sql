CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slack_team_id" text NOT NULL,
	"slack_team_name" text NOT NULL,
	"slack_bot_token" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"sync_frequency_hours" text DEFAULT '4' NOT NULL,
	"data_retention_days" text DEFAULT '90' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slack_team_id_unique" UNIQUE("slack_team_id")
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"config" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"model_name" text NOT NULL,
	"embedding_model" text DEFAULT 'text-embedding-3-small' NOT NULL,
	"base_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_commits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sha" text NOT NULL,
	"message" text NOT NULL,
	"author_name" text NOT NULL,
	"author_email" text NOT NULL,
	"repo_name" text NOT NULL,
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"committed_at" timestamp with time zone NOT NULL,
	"embedding" vector(1536),
	CONSTRAINT "github_commits_sha_unique" UNIQUE("sha")
);
--> statement-breakpoint
CREATE TABLE "github_pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"github_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"state" text NOT NULL,
	"author" text NOT NULL,
	"assignees" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"reviewers" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"labels" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"base_branch" text NOT NULL,
	"head_branch" text NOT NULL,
	"repo_name" text NOT NULL,
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"draft" boolean DEFAULT false NOT NULL,
	"merged_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"embedding" vector(1536),
	"search_vector" text,
	CONSTRAINT "github_pull_requests_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "github_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"github_id" text NOT NULL,
	"tag_name" text NOT NULL,
	"name" text,
	"body" text,
	"repo_name" text NOT NULL,
	"target_commitish" text NOT NULL,
	"draft" boolean DEFAULT false NOT NULL,
	"prerelease" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_releases_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "github_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pr_id" uuid NOT NULL,
	"reviewer" text NOT NULL,
	"state" text NOT NULL,
	"body" text,
	"submitted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"goal" text,
	"state" text,
	"start_date" date,
	"end_date" date,
	"completed_points" real,
	"total_points" real
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text,
	"status" text,
	"priority" text,
	"assignee" text,
	"reporter" text,
	"labels" text[],
	"sprint_id" text,
	"sprint_name" text,
	"story_points" real,
	"epic_name" text,
	"project_name" text,
	"due_date" date,
	"resolved_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"embedding" vector(1536)
);
--> statement-breakpoint
CREATE TABLE "sentry_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sentry_id" text NOT NULL,
	"title" text NOT NULL,
	"culprit" text,
	"level" text NOT NULL,
	"status" text NOT NULL,
	"times_seen" integer DEFAULT 0 NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"project_name" text NOT NULL,
	"tags" jsonb,
	"embedding" vector(1536),
	CONSTRAINT "sentry_issues_sentry_id_unique" UNIQUE("sentry_id")
);
--> statement-breakpoint
CREATE TABLE "posthog_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"distinct_id" text,
	"project_id" text NOT NULL,
	"properties" jsonb,
	"count" integer DEFAULT 1 NOT NULL,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "query_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slack_user_id" text NOT NULL,
	"slack_channel_id" text NOT NULL,
	"raw_query" text NOT NULL,
	"resolved_query" text,
	"sources_used" text[],
	"response_text" text,
	"latency_ms" integer,
	"token_count" integer,
	"was_helpful" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sync_type" text DEFAULT 'incremental' NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"processed_items" integer DEFAULT 0 NOT NULL,
	"failed_items" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_releases" ADD CONSTRAINT "github_releases_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_releases" ADD CONSTRAINT "github_releases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_reviews" ADD CONSTRAINT "github_reviews_pr_id_github_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."github_pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentry_issues" ADD CONSTRAINT "sentry_issues_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentry_issues" ADD CONSTRAINT "sentry_issues_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posthog_events" ADD CONSTRAINT "posthog_events_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posthog_events" ADD CONSTRAINT "posthog_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_logs" ADD CONSTRAINT "query_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connections_workspace_id_idx" ON "connections" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "connections_type_idx" ON "connections" USING btree ("type");--> statement-breakpoint
CREATE INDEX "api_keys_workspace_id_idx" ON "api_keys" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "api_keys_active_idx" ON "api_keys" USING btree ("workspace_id","is_active");--> statement-breakpoint
CREATE INDEX "github_commits_workspace_id_idx" ON "github_commits" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "github_commits_connection_id_idx" ON "github_commits" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "github_commits_repo_idx" ON "github_commits" USING btree ("repo_name");--> statement-breakpoint
CREATE INDEX "github_commits_committed_at_idx" ON "github_commits" USING btree ("committed_at");--> statement-breakpoint
CREATE INDEX "github_commits_author_email_idx" ON "github_commits" USING btree ("author_email");--> statement-breakpoint
CREATE INDEX "github_prs_workspace_id_idx" ON "github_pull_requests" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "github_prs_connection_id_idx" ON "github_pull_requests" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "github_prs_state_idx" ON "github_pull_requests" USING btree ("state");--> statement-breakpoint
CREATE INDEX "github_prs_author_idx" ON "github_pull_requests" USING btree ("author");--> statement-breakpoint
CREATE INDEX "github_prs_repo_idx" ON "github_pull_requests" USING btree ("repo_name");--> statement-breakpoint
CREATE INDEX "github_prs_updated_at_idx" ON "github_pull_requests" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "github_releases_workspace_id_idx" ON "github_releases" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "github_releases_repo_idx" ON "github_releases" USING btree ("repo_name");--> statement-breakpoint
CREATE INDEX "github_releases_published_at_idx" ON "github_releases" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "github_reviews_pr_id_idx" ON "github_reviews" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "github_reviews_reviewer_idx" ON "github_reviews" USING btree ("reviewer");--> statement-breakpoint
CREATE INDEX "sprints_workspace_id_idx" ON "sprints" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sprints_connection_id_idx" ON "sprints" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "sprints_external_id_source_idx" ON "sprints" USING btree ("external_id","source");--> statement-breakpoint
CREATE INDEX "sprints_state_idx" ON "sprints" USING btree ("state");--> statement-breakpoint
CREATE INDEX "tickets_workspace_id_idx" ON "tickets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "tickets_connection_id_idx" ON "tickets" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "tickets_source_idx" ON "tickets" USING btree ("source");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tickets_assignee_idx" ON "tickets" USING btree ("assignee");--> statement-breakpoint
CREATE INDEX "tickets_sprint_id_idx" ON "tickets" USING btree ("sprint_id");--> statement-breakpoint
CREATE INDEX "tickets_external_id_source_idx" ON "tickets" USING btree ("external_id","source");--> statement-breakpoint
CREATE INDEX "tickets_updated_at_idx" ON "tickets" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "sentry_issues_workspace_id_idx" ON "sentry_issues" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sentry_issues_connection_id_idx" ON "sentry_issues" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "sentry_issues_level_idx" ON "sentry_issues" USING btree ("level");--> statement-breakpoint
CREATE INDEX "sentry_issues_status_idx" ON "sentry_issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sentry_issues_last_seen_idx" ON "sentry_issues" USING btree ("last_seen");--> statement-breakpoint
CREATE INDEX "sentry_issues_project_idx" ON "sentry_issues" USING btree ("project_name");--> statement-breakpoint
CREATE INDEX "posthog_events_workspace_id_idx" ON "posthog_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "posthog_events_event_name_idx" ON "posthog_events" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "posthog_events_timestamp_idx" ON "posthog_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "posthog_events_project_idx" ON "posthog_events" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "query_logs_workspace_id_idx" ON "query_logs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "query_logs_slack_user_id_idx" ON "query_logs" USING btree ("slack_user_id");--> statement-breakpoint
CREATE INDEX "query_logs_created_at_idx" ON "query_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sync_jobs_workspace_id_idx" ON "sync_jobs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sync_jobs_connection_id_idx" ON "sync_jobs" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "sync_jobs_status_idx" ON "sync_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sync_jobs_created_at_idx" ON "sync_jobs" USING btree ("created_at");