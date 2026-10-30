CREATE TABLE `managed_clients` (
	`key` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `managed_clients_client_id_unique` ON `managed_clients` (`client_id`);