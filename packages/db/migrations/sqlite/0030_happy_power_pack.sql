CREATE TABLE `message_recipients` (
	`message_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`recipient_user_id` text NOT NULL,
	`delivered_at` integer,
	`read_at` integer,
	`archived_at` integer,
	`deleted_at` integer,
	PRIMARY KEY(`message_id`, `recipient_user_id`)
);
--> statement-breakpoint
CREATE INDEX `message_recipients_inbox` ON `message_recipients` (`tenant_id`,`recipient_user_id`,`deleted_at`,`archived_at`);--> statement-breakpoint
CREATE INDEX `message_recipients_unread` ON `message_recipients` (`tenant_id`,`recipient_user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`sender_type` text NOT NULL,
	`sender_id` text,
	`sender_display` text,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`body_format` text DEFAULT 'plain' NOT NULL,
	`source_plugin_id` text,
	`source_ref_type` text,
	`source_ref_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_tenant_feed` ON `messages` (`tenant_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `notifications` ADD `summary` text;--> statement-breakpoint
ALTER TABLE `notifications` ADD `body_format` text DEFAULT 'plain' NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` ADD `action_url` text;--> statement-breakpoint
ALTER TABLE `notifications` ADD `metadata` text;--> statement-breakpoint
ALTER TABLE `notifications` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `notifications` ADD `dedupe_key` text;--> statement-breakpoint
ALTER TABLE `notifications` ADD `priority` text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` ADD `delivery_state` text;--> statement-breakpoint
CREATE INDEX `notifications_dedupe` ON `notifications` (`tenant_id`,`source`,`dedupe_key`);