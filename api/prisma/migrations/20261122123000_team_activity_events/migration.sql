ALTER TABLE "teams" ADD COLUMN "activity_sequence" BIGINT NOT NULL DEFAULT 0;

CREATE TABLE "activity_events" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "sequence" BIGINT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "activity_events_team_id_sequence_key" UNIQUE ("team_id", "sequence"),
    CONSTRAINT "activity_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
