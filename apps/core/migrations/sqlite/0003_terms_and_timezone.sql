ALTER TABLE `users` ADD `timezone` text;--> statement-breakpoint
ALTER TABLE `users` ADD `agreed_to_terms` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `terms_accepted_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `terms_version` text;