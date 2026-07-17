CREATE TABLE `user_capability_grants` (
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`capability` text NOT NULL,
	`granted_by_user_id` text NOT NULL,
	`granted_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `capability`)
);
