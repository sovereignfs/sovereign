CREATE TABLE "capability_overrides" (
	"role" text NOT NULL,
	"capability" text NOT NULL,
	"granted" integer NOT NULL,
	"updated_at" bigint NOT NULL,
	"updated_by" text,
	CONSTRAINT "capability_overrides_role_capability_pk" PRIMARY KEY("role","capability")
);
