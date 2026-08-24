CREATE TABLE `backup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`scope` text NOT NULL,
	`requested_by_user_id` text,
	`status` text NOT NULL,
	`options_json` text,
	`archive_path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `backup_jobs_status_idx` ON `backup_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `backup_jobs_tenant_scope_idx` ON `backup_jobs` (`tenant_id`,`scope`);