CREATE TABLE `field_encryption_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`class` text NOT NULL,
	`wrapped_dek` text NOT NULL,
	`wrapped_hmac_key` text NOT NULL,
	`kek_fingerprint` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `field_encryption_keys_plugin_class_idx` ON `field_encryption_keys` (`plugin_id`,`class`);