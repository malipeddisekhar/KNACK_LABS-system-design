-- Step 1: Add the column as nullable so existing records are unaffected
ALTER TABLE "click_events" ADD COLUMN "event_id" TEXT;

-- Step 2: Backfill unique UUIDs for all existing click event records
UPDATE "click_events" SET "event_id" = gen_random_uuid()::TEXT WHERE "event_id" IS NULL;

-- Step 3: Enforce NOT NULL on event_id now that every row has a unique value
ALTER TABLE "click_events" ALTER COLUMN "event_id" SET NOT NULL;

-- Step 4: Add the UNIQUE constraint/index for database-enforced idempotency
CREATE UNIQUE INDEX "click_events_event_id_key" ON "click_events"("event_id");
