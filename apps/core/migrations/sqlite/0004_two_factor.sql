CREATE TABLE `two_factors` (
	`id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`backup_codes` text NOT NULL,
	`user_id` text NOT NULL,
	`verified` integer DEFAULT true NOT NULL,
	`failed_verification_count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `two_factors_user_id_idx` ON `two_factors` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `two_factor_enabled` integer DEFAULT false NOT NULL;