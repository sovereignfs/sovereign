CREATE TABLE "launcher_shortcuts" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"icon_symbol" text,
	"icon_type" text,
	"icon_bytes" "bytea",
	"icon_size" integer,
	"icon_version" text,
	"created_at" bigint NOT NULL,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "launcher_shortcuts" ADD CONSTRAINT "launcher_shortcuts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "launcher_shortcuts_owner_idx" ON "launcher_shortcuts" USING btree ("owner_id");