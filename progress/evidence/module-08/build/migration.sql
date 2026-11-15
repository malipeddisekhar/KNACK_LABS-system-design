-- CreateIndex
CREATE INDEX "links_long_url_search_gin_idx" ON "links" USING GIN (to_tsvector('simple', "long_url"));
