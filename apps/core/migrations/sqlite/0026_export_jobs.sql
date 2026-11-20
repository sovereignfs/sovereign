CREATE TABLE `export_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`sub` text,
	`session_id` text NOT NULL,
	`state` text NOT NULL,
	`archive` text NOT NULL,
	`file` text,
	`size` integer,
	`requested_at` integer NOT NULL,
	`finished_at` integer,
	`lease_until` integer,
	`failure` text
);
--> statement-breakpoint
CREATE INDEX `export_jobs_state_idx` ON `export_jobs` (`state`);--> statement-breakpoint
CREATE INDEX `export_jobs_sub_idx` ON `export_jobs` (`sub`);