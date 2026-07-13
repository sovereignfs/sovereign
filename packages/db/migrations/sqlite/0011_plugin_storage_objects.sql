CREATE TABLE IF NOT EXISTS `plugin_storage_objects` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `plugin_id` text NOT NULL,
  `owner_user_id` text,
  `key` text NOT NULL,
  `content_type` text NOT NULL,
  `size` integer NOT NULL,
  `checksum` text NOT NULL,
  `metadata` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `plugin_storage_objects_key_idx` ON `plugin_storage_objects` (`tenant_id`, `plugin_id`, `key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `plugin_storage_objects_owner_idx` ON `plugin_storage_objects` (`tenant_id`, `plugin_id`, `owner_user_id`);
