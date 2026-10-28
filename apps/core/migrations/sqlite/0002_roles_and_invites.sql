CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`invited_by` text,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`accepted_at` integer,
	`cancelled_at` integer,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `invites_email_idx` ON `invites` (`email`);--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'platform:user' NOT NULL;--> statement-breakpoint
-- Accounts made before roles existed: the first one became the owner, as it would have now.
UPDATE users SET role = 'platform:owner' WHERE id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1);--> statement-breakpoint
CREATE UNIQUE INDEX `users_single_owner_idx` ON `users` (`role`) WHERE role = 'platform:owner';