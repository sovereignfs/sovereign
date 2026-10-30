CREATE TABLE `notification_settings` (
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`enabled` integer NOT NULL,
	PRIMARY KEY(`user_id`, `client_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`url` text,
	`category` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	`dismissed_at` integer,
	`expires_at` integer NOT NULL,
	`idem_key` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`client_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_idem_idx` ON `notifications` (`client_id`,`user_id`,`idem_key`);