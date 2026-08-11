CREATE TABLE `example_encrypted_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`label` text,
	`label_bidx` text,
	`body` text,
	`created_at` integer NOT NULL
);
