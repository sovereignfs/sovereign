CREATE TABLE `capability_overrides` (
	`role` text NOT NULL,
	`capability` text NOT NULL,
	`granted` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	PRIMARY KEY(`role`, `capability`)
);
