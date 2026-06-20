CREATE TABLE "notification_prefs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"muted_categories" text DEFAULT '[]' NOT NULL,
	"poll_interval_secs" integer DEFAULT 30 NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"source" text NOT NULL,
	"source_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"url" text,
	"category" text DEFAULT 'info' NOT NULL,
	"icon" text,
	"read_at" bigint,
	"dismissed_at" bigint,
	"created_at" bigint NOT NULL
);
