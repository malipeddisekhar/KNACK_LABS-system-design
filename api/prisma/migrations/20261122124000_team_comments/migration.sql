CREATE TABLE "team_comments" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "team_comments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "team_comments_team_id_created_at_idx" ON "team_comments"("team_id", "created_at");
