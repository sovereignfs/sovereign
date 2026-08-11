CREATE TABLE "field_reseal_checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"plugin_id" text NOT NULL,
	"table_name" text NOT NULL,
	"last_pk" text NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_table_registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"plugin_id" text NOT NULL,
	"table_name" text NOT NULL,
	"metadata" text NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "field_encryption_keys" ADD COLUMN "wrapped_hmac_key_previous" text;--> statement-breakpoint
ALTER TABLE "field_encryption_keys" ADD COLUMN "hmac_rotation_started_at" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "field_reseal_checkpoints_job_table_idx" ON "field_reseal_checkpoints" USING btree ("job","plugin_id","table_name");--> statement-breakpoint
CREATE UNIQUE INDEX "field_table_registrations_plugin_table_idx" ON "field_table_registrations" USING btree ("plugin_id","table_name");