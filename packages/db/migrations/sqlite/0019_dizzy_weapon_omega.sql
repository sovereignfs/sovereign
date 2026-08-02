CREATE TABLE `device_consent_grants` (
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`capability` text NOT NULL,
	`granted_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `plugin_id`, `capability`)
);
