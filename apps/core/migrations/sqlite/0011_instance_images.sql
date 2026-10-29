CREATE TABLE `instance_images` (
	`kind` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`bytes` blob NOT NULL,
	`size` integer NOT NULL,
	`version` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text
);
