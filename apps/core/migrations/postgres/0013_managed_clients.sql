CREATE TABLE "managed_clients" (
	"key" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "managed_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
ALTER TABLE "managed_clients" ADD CONSTRAINT "managed_clients_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;