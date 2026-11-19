CREATE TABLE "device_locks" (
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"idle_seconds" integer NOT NULL,
	"on_leave" boolean NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lock_challenges" (
	"session_id" text PRIMARY KEY NOT NULL,
	"challenge" text NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_locks" (
	"session_id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"last_active_at" bigint NOT NULL,
	"locked_at" bigint,
	"left_at" bigint
);
--> statement-breakpoint
ALTER TABLE "device_locks" ADD CONSTRAINT "device_locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lock_challenges" ADD CONSTRAINT "lock_challenges_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_locks" ADD CONSTRAINT "session_locks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_locks_user_device_idx" ON "device_locks" USING btree ("user_id","device_id");