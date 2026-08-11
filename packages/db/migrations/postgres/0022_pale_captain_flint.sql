CREATE TABLE "field_encryption_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"plugin_id" text NOT NULL,
	"class" text NOT NULL,
	"wrapped_dek" text NOT NULL,
	"wrapped_hmac_key" text NOT NULL,
	"kek_fingerprint" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "field_encryption_keys_plugin_class_idx" ON "field_encryption_keys" USING btree ("plugin_id","class");