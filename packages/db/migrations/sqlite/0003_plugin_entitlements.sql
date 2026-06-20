CREATE TABLE `entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`tier_id` text,
	`status` text NOT NULL DEFAULT 'active',
	`source` text NOT NULL DEFAULT 'manual',
	`license_token` text NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entitlements_user_plugin_idx` ON `entitlements` (`user_id`, `plugin_id`);
