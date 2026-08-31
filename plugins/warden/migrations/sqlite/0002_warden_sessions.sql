DROP TABLE `warden_conversation`;
--> statement-breakpoint
DROP TABLE `warden_messages`;
--> statement-breakpoint
CREATE TABLE `warden_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text,
	`pinned_at` integer,
	`last_active_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `warden_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`provider_id` text,
	`model` text NOT NULL,
	`created_at` integer NOT NULL
);
