CREATE TABLE `logout_notices` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`sub` text NOT NULL,
	`sid` text NOT NULL,
	`created_at` integer NOT NULL,
	`state` text NOT NULL,
	`attempts` integer NOT NULL,
	`next_attempt_at` integer,
	`lease_until` integer,
	`last_failure` text,
	`done_at` integer
);
--> statement-breakpoint
CREATE INDEX `logout_notices_due_idx` ON `logout_notices` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `logout_notices_client_sid_idx` ON `logout_notices` (`client_id`,`sid`);