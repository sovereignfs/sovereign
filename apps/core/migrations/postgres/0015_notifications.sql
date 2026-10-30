CREATE TABLE "notification_settings" (
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"enabled" integer NOT NULL,
	CONSTRAINT "notification_settings_user_id_client_id_pk" PRIMARY KEY("user_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"url" text,
	"category" text NOT NULL,
	"created_at" bigint NOT NULL,
	"read_at" bigint,
	"dismissed_at" bigint,
	"expires_at" bigint NOT NULL,
	"idem_key" text
);
--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","client_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_idem_idx" ON "notifications" USING btree ("client_id","user_id","idem_key");