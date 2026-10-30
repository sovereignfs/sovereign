CREATE TABLE `app_mail_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`idem_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `app_mail_keys_idx` ON `app_mail_keys` (`client_id`,`user_id`,`idem_key`);--> statement-breakpoint
CREATE TABLE `app_mail_settings` (
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`enabled` integer NOT NULL,
	PRIMARY KEY(`user_id`, `client_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
