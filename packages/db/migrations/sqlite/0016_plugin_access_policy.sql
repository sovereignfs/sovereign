CREATE TABLE `plugin_access_groups` (
	`tenant_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`group_id` text NOT NULL,
	`granted_by_user_id` text NOT NULL,
	`granted_at` integer NOT NULL,
	PRIMARY KEY(`plugin_id`, `group_id`)
);
--> statement-breakpoint
CREATE TABLE `plugin_access_users` (
	`tenant_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`user_id` text NOT NULL,
	`granted_by_user_id` text NOT NULL,
	`granted_at` integer NOT NULL,
	PRIMARY KEY(`plugin_id`, `user_id`)
);
--> statement-breakpoint
ALTER TABLE `plugin_status` ADD `access_policy` text DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE `plugin_status` ADD `self_service` integer DEFAULT false NOT NULL;