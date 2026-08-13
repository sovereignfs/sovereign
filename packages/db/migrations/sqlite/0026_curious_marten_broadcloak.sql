CREATE TABLE `plugin_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`payload` text,
	`run_at` integer NOT NULL,
	`cron` text,
	`timezone` text,
	`dedupe_key` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`last_error` text,
	`progress` integer,
	`progress_message` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`cancelled_at` integer
);
--> statement-breakpoint
CREATE INDEX `plugin_jobs_status_run_at_idx` ON `plugin_jobs` (`status`,`run_at`);--> statement-breakpoint
CREATE INDEX `plugin_jobs_plugin_dedupe_idx` ON `plugin_jobs` (`plugin_id`,`dedupe_key`);