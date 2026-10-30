CREATE TABLE "app_mail_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"idem_key" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_mail_settings" (
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"enabled" integer NOT NULL,
	CONSTRAINT "app_mail_settings_user_id_client_id_pk" PRIMARY KEY("user_id","client_id")
);
--> statement-breakpoint
ALTER TABLE "app_mail_keys" ADD CONSTRAINT "app_mail_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_mail_settings" ADD CONSTRAINT "app_mail_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_mail_keys_idx" ON "app_mail_keys" USING btree ("client_id","user_id","idem_key");