CREATE TABLE `warden_user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`default_model_key` text,
	`created_at` integer NOT NULL
);
