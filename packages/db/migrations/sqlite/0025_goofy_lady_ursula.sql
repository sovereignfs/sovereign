CREATE TABLE `plugin_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`source_plugin_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`name` text NOT NULL,
	`mode` text NOT NULL,
	`actor_user_id` text,
	`payload` text NOT NULL,
	`return_url` text,
	`single_use` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
