CREATE TABLE IF NOT EXISTS `email_delivery_log` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `created_at` integer NOT NULL,
  `delivery_class` text NOT NULL,
  `template_id` text NOT NULL,
  `source` text NOT NULL,
  `recipient_user_id` text,
  `recipient_email_hash` text,
  `actor_user_id` text,
  `status` text NOT NULL,
  `provider_message_id` text,
  `error_code` text,
  `metadata` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_delivery_log_tenant_created` ON `email_delivery_log` (`tenant_id`, `created_at` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_delivery_log_status_created` ON `email_delivery_log` (`status`, `created_at` DESC);
