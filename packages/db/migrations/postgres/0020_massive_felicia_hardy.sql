CREATE TABLE "push_device_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"device_token" text NOT NULL,
	"public_key" text NOT NULL,
	"relay_url" text NOT NULL,
	"created_at" bigint NOT NULL,
	"last_used_at" bigint,
	CONSTRAINT "push_device_tokens_device_token_unique" UNIQUE("device_token")
);
