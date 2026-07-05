CREATE TABLE IF NOT EXISTS `plugin_provider_configs` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `plugin_id` text NOT NULL,
  `provider` text NOT NULL,
  `label` text NOT NULL,
  `public_config` text,
  `secret_ref` text,
  `callback_url` text,
  `scopes` text,
  `status` text NOT NULL,
  `last_checked_at` integer,
  `last_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `plugin_provider_configs_active_idx` ON `plugin_provider_configs` (`tenant_id`, `plugin_id`, `provider`, `deleted_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `plugin_provider_configs_plugin_idx` ON `plugin_provider_configs` (`tenant_id`, `plugin_id`, `deleted_at`);
