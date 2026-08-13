CREATE TABLE `webhook_replays` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`provider` text NOT NULL,
	`event_id` text NOT NULL,
	`received_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_replays_plugin_provider_event_idx` ON `webhook_replays` (`plugin_id`,`provider`,`event_id`);