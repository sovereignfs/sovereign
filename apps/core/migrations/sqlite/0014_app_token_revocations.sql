CREATE TABLE `app_token_revocations` (
	`client_id` text PRIMARY KEY NOT NULL,
	`revoked_before` integer NOT NULL
);
