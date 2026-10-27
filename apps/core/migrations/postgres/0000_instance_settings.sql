CREATE TABLE "instance_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"encrypted" integer DEFAULT 0 NOT NULL,
	"updated_at" bigint NOT NULL,
	"updated_by" text
);
