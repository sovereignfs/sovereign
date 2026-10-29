CREATE TABLE "token_revocations" (
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"revoked_before" bigint NOT NULL,
	CONSTRAINT "token_revocations_user_id_client_id_pk" PRIMARY KEY("user_id","client_id")
);
--> statement-breakpoint
ALTER TABLE "token_revocations" ADD CONSTRAINT "token_revocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;