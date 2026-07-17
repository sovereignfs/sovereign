CREATE TABLE `user_group_members` (
	`tenant_id` text NOT NULL,
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`added_by_user_id` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `user_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
