CREATE TABLE `account_deletion_notices` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`sub` text NOT NULL,
	`deleted_at` integer NOT NULL,
	`state` text NOT NULL,
	`attempts` integer NOT NULL,
	`next_attempt_at` integer,
	`lease_until` integer,
	`last_failure` text,
	`done_at` integer
);
--> statement-breakpoint
CREATE INDEX `account_deletion_notices_due_idx` ON `account_deletion_notices` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `account_deletion_notices_client_idx` ON `account_deletion_notices` (`client_id`,`sub`);