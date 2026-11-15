-- Rename the existing ownership column without changing stored link data.
ALTER TABLE "links" RENAME COLUMN "created_by" TO "principal_id";
ALTER INDEX "links_created_by_idx" RENAME TO "links_principal_id_idx";
