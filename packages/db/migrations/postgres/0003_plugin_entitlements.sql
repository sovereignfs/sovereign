CREATE TABLE "entitlements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"plugin_id" text NOT NULL,
	"tier_id" text,
	"status" text NOT NULL DEFAULT 'active',
	"source" text NOT NULL DEFAULT 'manual',
	"license_token" text NOT NULL,
	"issued_at" bigint NOT NULL,
	"expires_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "entitlements_user_plugin_idx" ON "entitlements" ("user_id", "plugin_id");
