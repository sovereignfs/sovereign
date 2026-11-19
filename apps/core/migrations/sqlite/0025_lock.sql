CREATE TABLE `device_locks` (
	`user_id` text NOT NULL,
	`device_id` text NOT NULL,
	`idle_seconds` integer NOT NULL,
	`on_leave` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_locks_user_device_idx` ON `device_locks` (`user_id`,`device_id`);--> statement-breakpoint
CREATE TABLE `lock_challenges` (
	`session_id` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session_locks` (
	`session_id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`last_active_at` integer NOT NULL,
	`locked_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
