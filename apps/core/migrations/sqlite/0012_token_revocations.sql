CREATE TABLE `token_revocations` (
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`revoked_before` integer NOT NULL,
	PRIMARY KEY(`user_id`, `client_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
