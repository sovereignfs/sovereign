CREATE TABLE "user_capability_grants" (
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"capability" text NOT NULL,
	"granted_by_user_id" text NOT NULL,
	"granted_at" bigint NOT NULL,
	CONSTRAINT "user_capability_grants_user_id_capability_pk" PRIMARY KEY("user_id","capability")
);
