CREATE TABLE `push_device_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`platform` text NOT NULL,
	`device_token` text NOT NULL,
	`public_key` text NOT NULL,
	`relay_url` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_device_tokens_device_token_unique` ON `push_device_tokens` (`device_token`);