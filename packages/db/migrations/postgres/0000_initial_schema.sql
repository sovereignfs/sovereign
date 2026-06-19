-- Platform schema — Postgres dialect.
-- Applied once on a fresh install; idempotent (IF NOT EXISTS) so running
-- against an instance that was bootstrapped before migrations were introduced
-- is safe. users/sessions are intentionally omitted — those tables belong to
-- the auth server (better-auth) in its own auth database.
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_status" (
	"plugin_id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_settings" (
	"key" text NOT NULL,
	"tenant_id" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "platform_settings_key_tenant_id_pk" PRIMARY KEY("key","tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_prefs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consent_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"consumer_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"contract" text NOT NULL,
	"version" integer NOT NULL,
	"granted_at" bigint NOT NULL,
	"revoked_at" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_access_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"consumer_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"contract" text NOT NULL,
	"version" integer NOT NULL,
	"accessed_at" bigint NOT NULL,
	"row_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"actor_id" text,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"subject_user_id" text,
	"target_type" text,
	"target_id" text,
	"plugin_id" text,
	"visibility" text NOT NULL,
	"summary" text,
	"metadata" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_tenant_created" ON "activity_log" ("tenant_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_actor" ON "activity_log" ("actor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_subject" ON "activity_log" ("subject_user_id");
