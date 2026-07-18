CREATE TABLE "plugin_access_groups" (
	"tenant_id" text NOT NULL,
	"plugin_id" text NOT NULL,
	"group_id" text NOT NULL,
	"granted_by_user_id" text NOT NULL,
	"granted_at" bigint NOT NULL,
	CONSTRAINT "plugin_access_groups_plugin_id_group_id_pk" PRIMARY KEY("plugin_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "plugin_access_users" (
	"tenant_id" text NOT NULL,
	"plugin_id" text NOT NULL,
	"user_id" text NOT NULL,
	"granted_by_user_id" text NOT NULL,
	"granted_at" bigint NOT NULL,
	CONSTRAINT "plugin_access_users_plugin_id_user_id_pk" PRIMARY KEY("plugin_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "plugin_status" ADD COLUMN "access_policy" text DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "plugin_status" ADD COLUMN "self_service" boolean DEFAULT false NOT NULL;