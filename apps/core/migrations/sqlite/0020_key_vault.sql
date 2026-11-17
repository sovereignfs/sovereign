CREATE TABLE `key_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`suite` integer NOT NULL,
	`unlock_salt` text NOT NULL,
	`signing_public` text NOT NULL,
	`signing_private` text NOT NULL,
	`kit_confirmed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `key_apps` (
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`app_key` text NOT NULL,
	`identity` text NOT NULL,
	`signature` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `client_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `key_session_secrets` (
	`session_id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `key_wraps` (
	`user_id` text NOT NULL,
	`way` text NOT NULL,
	`wrap_id` text NOT NULL,
	`record` text NOT NULL,
	`prf_input` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `way`, `wrap_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
