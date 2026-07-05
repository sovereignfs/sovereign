CREATE TABLE IF NOT EXISTS "plugin_secrets" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "plugin_id" text NOT NULL,
  "scope" text NOT NULL,
  "user_id" text,
  "label" text NOT NULL,
  "ciphertext" text NOT NULL,
  "metadata" text,
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL,
  "last_used_at" bigint,
  "deleted_at" bigint
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plugin_secrets_plugin_scope_idx" ON "plugin_secrets" ("tenant_id", "plugin_id", "scope", "deleted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plugin_secrets_user_idx" ON "plugin_secrets" ("tenant_id", "user_id", "deleted_at");
