CREATE TABLE "backup_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"scope" text NOT NULL,
	"requested_by_user_id" text,
	"status" text NOT NULL,
	"options_json" text,
	"archive_path" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"error_message" text,
	"created_at" bigint NOT NULL,
	"started_at" bigint,
	"completed_at" bigint,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "backup_jobs_status_idx" ON "backup_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "backup_jobs_tenant_scope_idx" ON "backup_jobs" USING btree ("tenant_id","scope");