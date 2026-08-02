CREATE TABLE "device_consent_grants" (
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"plugin_id" text NOT NULL,
	"capability" text NOT NULL,
	"granted_at" bigint NOT NULL,
	CONSTRAINT "device_consent_grants_user_id_plugin_id_capability_pk" PRIMARY KEY("user_id","plugin_id","capability")
);
