CREATE TABLE "plugin_handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"source_plugin_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"name" text NOT NULL,
	"mode" text NOT NULL,
	"actor_user_id" text,
	"payload" text NOT NULL,
	"return_url" text,
	"single_use" boolean NOT NULL,
	"consumed_at" bigint,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
