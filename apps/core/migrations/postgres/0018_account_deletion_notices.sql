CREATE TABLE "account_deletion_notices" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"sub" text NOT NULL,
	"deleted_at" bigint NOT NULL,
	"state" text NOT NULL,
	"attempts" integer NOT NULL,
	"next_attempt_at" bigint,
	"lease_until" bigint,
	"last_failure" text,
	"done_at" bigint
);
--> statement-breakpoint
CREATE INDEX "account_deletion_notices_due_idx" ON "account_deletion_notices" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE INDEX "account_deletion_notices_client_idx" ON "account_deletion_notices" USING btree ("client_id","sub");