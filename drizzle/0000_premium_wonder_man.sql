CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_slug` text NOT NULL,
	`company` text NOT NULL,
	`platform` text NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`department` text,
	`department_path` text,
	`location` text,
	`secondary_locations` text,
	`work_mode` text,
	`work_mode_source` text DEFAULT 'inferred' NOT NULL,
	`employment_type` text,
	`requisition_id` text,
	`posted_date` text,
	`updated_at_source` text,
	`application_deadline` text,
	`url` text,
	`apply_url` text,
	`description` text,
	`compensation_text` text,
	`salary_min` real,
	`salary_max` real,
	`salary_currency` text,
	`content_hash` text NOT NULL,
	`first_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`closed_at` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_site_source_unique` ON `jobs` (`site_slug`,`source_id`);--> statement-breakpoint
CREATE INDEX `jobs_open_idx` ON `jobs` (`site_slug`) WHERE "jobs"."closed_at" is null;--> statement-breakpoint
CREATE INDEX `jobs_posted_idx` ON `jobs` (`posted_date`) WHERE "jobs"."closed_at" is null;--> statement-breakpoint
CREATE INDEX `jobs_platform_idx` ON `jobs` (`platform`) WHERE "jobs"."closed_at" is null;--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`site_slug` text NOT NULL,
	`platform` text NOT NULL,
	`started_at` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`jobs_found` integer,
	`jobs_upserted` integer,
	`jobs_closed` integer,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `sync_log_run_idx` ON `sync_log` (`run_id`);--> statement-breakpoint
CREATE INDEX `sync_log_site_idx` ON `sync_log` (`site_slug`,`started_at`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`site_slug` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`tier` integer DEFAULT 2 NOT NULL,
	`last_attempt_at` integer,
	`last_success_at` integer,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`last_open_count` integer,
	`next_due_at` integer DEFAULT (unixepoch()) NOT NULL
);
