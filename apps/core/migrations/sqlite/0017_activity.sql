CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`summary` text NOT NULL,
	`link` text,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`idem_key` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_user_idx` ON `activity` (`user_id`,`at`);--> statement-breakpoint
CREATE INDEX `activity_idem_idx` ON `activity` (`client_id`,`user_id`,`idem_key`);