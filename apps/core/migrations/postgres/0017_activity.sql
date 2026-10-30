CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"summary" text NOT NULL,
	"link" text,
	"at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"idem_key" text
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_user_idx" ON "activity" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "activity_idem_idx" ON "activity" USING btree ("client_id","user_id","idem_key");