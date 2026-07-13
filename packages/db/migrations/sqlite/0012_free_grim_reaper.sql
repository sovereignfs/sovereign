CREATE TABLE `e2ee_device_enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text NOT NULL,
	`device_label` text,
	`wrapped_cmk` text NOT NULL,
	`algorithm_version` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE TABLE `e2ee_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`cmk_algorithm` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `e2ee_recovery_wrappers` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`wrapped_cmk` text NOT NULL,
	`kdf_algorithm` text NOT NULL,
	`kdf_params` text NOT NULL,
	`kdf_salt` text NOT NULL,
	`algorithm_version` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
