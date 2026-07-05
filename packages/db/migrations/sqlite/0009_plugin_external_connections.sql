CREATE TABLE IF NOT EXISTS `plugin_connections` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `plugin_id` text NOT NULL,
  `scope` text NOT NULL,
  `user_id` text,
  `provider` text NOT NULL,
  `label` text NOT NULL,
  `status` text NOT NULL,
  `secret_ref` text,
  `metadata` text,
  `last_checked_at` integer,
  `last_used_at` integer,
  `last_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `disconnected_at` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `plugin_connections_plugin_provider_idx` ON `plugin_connections` (`tenant_id`, `plugin_id`, `provider`, `status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `plugin_connections_user_idx` ON `plugin_connections` (`tenant_id`, `user_id`, `status`);
