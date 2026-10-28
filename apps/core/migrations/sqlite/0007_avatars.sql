CREATE TABLE `avatars` (
	`user_id` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`bytes` blob NOT NULL,
	`size` integer NOT NULL,
	`version` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
