-- CreateEnum
CREATE TYPE "TeamInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "team_invitations" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "invited_email" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "TeamInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_token_hash_key" ON "team_invitations"("token_hash");
CREATE UNIQUE INDEX "team_invitations_one_pending_per_team_email_key" ON "team_invitations"("team_id", "invited_email") WHERE "status" = 'PENDING';
CREATE INDEX "team_invitations_team_id_invited_email_status_idx" ON "team_invitations"("team_id", "invited_email", "status");
CREATE INDEX "team_invitations_expires_at_idx" ON "team_invitations"("expires_at");

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
