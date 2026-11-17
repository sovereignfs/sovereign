CREATE TABLE `launcher_shortcuts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`icon_symbol` text,
	`icon_type` text,
	`icon_bytes` blob,
	`icon_size` integer,
	`icon_version` text,
	`created_at` integer NOT NULL,
	`created_by` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `launcher_shortcuts_owner_idx` ON `launcher_shortcuts` (`owner_id`);