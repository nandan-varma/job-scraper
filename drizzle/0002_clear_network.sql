ALTER TABLE `jobs` ADD `is_us` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `jobs_region_idx` ON `jobs` (`is_us`) WHERE "jobs"."closed_at" is null;--> statement-breakpoint
CREATE INDEX `jobs_department_idx` ON `jobs` (`department`) WHERE "jobs"."closed_at" is null;