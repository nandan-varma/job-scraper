ALTER TABLE `jobs` ADD `department_category` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `employment_type_category` text;--> statement-breakpoint
CREATE INDEX `jobs_dept_category_idx` ON `jobs` (`department_category`) WHERE "jobs"."closed_at" is null;--> statement-breakpoint
CREATE INDEX `jobs_emp_type_category_idx` ON `jobs` (`employment_type_category`) WHERE "jobs"."closed_at" is null;