CREATE TABLE "key_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"suite" integer NOT NULL,
	"unlock_salt" text NOT NULL,
	"signing_public" text NOT NULL,
	"signing_private" text NOT NULL,
	"kit_confirmed" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_apps" (
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"app_key" text NOT NULL,
	"identity" text NOT NULL,
	"signature" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "key_apps_user_id_client_id_pk" PRIMARY KEY("user_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "key_session_secrets" (
	"session_id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_wraps" (
	"user_id" text NOT NULL,
	"way" text NOT NULL,
	"wrap_id" text NOT NULL,
	"record" text NOT NULL,
	"prf_salt" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "key_wraps_user_id_way_wrap_id_pk" PRIMARY KEY("user_id","way","wrap_id")
);
--> statement-breakpoint
ALTER TABLE "key_accounts" ADD CONSTRAINT "key_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_apps" ADD CONSTRAINT "key_apps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_session_secrets" ADD CONSTRAINT "key_session_secrets_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_wraps" ADD CONSTRAINT "key_wraps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;