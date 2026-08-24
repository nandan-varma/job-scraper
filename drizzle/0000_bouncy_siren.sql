CREATE TABLE "jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site_slug" text NOT NULL,
	"company" text NOT NULL,
	"platform" text NOT NULL,
	"source_id" text NOT NULL,
	"title" text NOT NULL,
	"department" text,
	"department_path" text,
	"location" text,
	"secondary_locations" jsonb,
	"work_mode" text,
	"work_mode_source" text DEFAULT 'inferred' NOT NULL,
	"employment_type" text,
	"requisition_id" text,
	"posted_date" date,
	"updated_at_source" date,
	"application_deadline" date,
	"url" text,
	"apply_url" text,
	"description" text,
	"raw_html" text,
	"compensation_text" text,
	"salary_min" numeric,
	"salary_max" numeric,
	"salary_currency" text,
	"raw_json" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"site_slug" text NOT NULL,
	"platform" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"status" text NOT NULL,
	"http_status" integer,
	"jobs_found" integer,
	"jobs_upserted" integer,
	"jobs_closed" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"site_slug" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"tier" smallint DEFAULT 2 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"consecutive_failures" smallint DEFAULT 0 NOT NULL,
	"last_open_count" integer,
	"next_due_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_site_source_unique" ON "jobs" USING btree ("site_slug","source_id");--> statement-breakpoint
CREATE INDEX "jobs_open_idx" ON "jobs" USING btree ("site_slug") WHERE "jobs"."closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "jobs_posted_idx" ON "jobs" USING btree ("posted_date") WHERE "jobs"."closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "jobs_platform_idx" ON "jobs" USING btree ("platform") WHERE "jobs"."closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "jobs_search_idx" ON "jobs" USING gin (to_tsvector('english', "title" || ' ' || "company" || ' ' || coalesce("department", '')));--> statement-breakpoint
CREATE INDEX "sync_log_run_idx" ON "sync_log" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "sync_log_site_idx" ON "sync_log" USING btree ("site_slug","started_at");