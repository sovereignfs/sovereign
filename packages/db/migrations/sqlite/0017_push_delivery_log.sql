CREATE TABLE `push_delivery_log` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`push_service` text,
	`status` text NOT NULL,
	`error_code` text,
	`category` text,
	`source` text
);
