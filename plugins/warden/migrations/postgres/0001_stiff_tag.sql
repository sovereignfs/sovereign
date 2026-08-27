CREATE TABLE "warden_model_visibility_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"model_key" text NOT NULL,
	"created_at" bigint NOT NULL
);
