CREATE TABLE "message_recipients" (
	"message_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"delivered_at" bigint,
	"read_at" bigint,
	"archived_at" bigint,
	"deleted_at" bigint,
	CONSTRAINT "message_recipients_message_id_recipient_user_id_pk" PRIMARY KEY("message_id","recipient_user_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"sender_type" text NOT NULL,
	"sender_id" text,
	"sender_display" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"body_format" text DEFAULT 'plain' NOT NULL,
	"source_plugin_id" text,
	"source_ref_type" text,
	"source_ref_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "body_format" text DEFAULT 'plain' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "action_url" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "metadata" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "expires_at" bigint;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "delivery_state" text;--> statement-breakpoint
CREATE INDEX "message_recipients_inbox" ON "message_recipients" USING btree ("tenant_id","recipient_user_id","deleted_at","archived_at");--> statement-breakpoint
CREATE INDEX "message_recipients_unread" ON "message_recipients" USING btree ("tenant_id","recipient_user_id","read_at");--> statement-breakpoint
CREATE INDEX "messages_tenant_feed" ON "messages" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_dedupe" ON "notifications" USING btree ("tenant_id","source","dedupe_key");