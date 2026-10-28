CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"invited_by" text,
	"created_at" bigint NOT NULL,
	"expires_at" bigint,
	"accepted_at" bigint,
	"cancelled_at" bigint
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'platform:user' NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invites_email_idx" ON "invites" USING btree ("email");--> statement-breakpoint
-- Accounts made before roles existed: the first one became the owner, as it would have now.
UPDATE users SET role = 'platform:owner' WHERE id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1);--> statement-breakpoint
CREATE UNIQUE INDEX "users_single_owner_idx" ON "users" USING btree ("role") WHERE role = 'platform:owner';