CREATE TABLE `tenant_branding` (
	`tenant_id` text NOT NULL PRIMARY KEY,
	`brand_name` text,
	`brand_logo` text,
	`brand_logo_dark` text,
	`brand_favicon` text,
	`brand_primary` text,
	`email_from_name` text,
	`email_logo` text,
	`updated_at` integer NOT NULL
);
