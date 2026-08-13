CREATE TABLE "webhook_replays" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"plugin_id" text NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"received_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_replays_plugin_provider_event_idx" ON "webhook_replays" USING btree ("plugin_id","provider","event_id");