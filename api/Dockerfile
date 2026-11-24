# Build with the complete toolchain, then prune development dependencies.
FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build --if-present
RUN npm prune --omit=dev

# Runtime image contains only production dependencies and compiled output.
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update     && apt-get install -y --no-install-recommends curl ca-certificates openssl     && rm -rf /var/lib/apt/lists/*     && groupadd --system appgroup     && useradd --system --gid appgroup --create-home appuser

COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json

EXPOSE 3000
# The API currently registers GET /health (not /live).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

USER appuser
CMD ["node", "dist/main.js"]
