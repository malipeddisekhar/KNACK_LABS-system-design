# ==============================================================================
# Multi-Stage Production Dockerfile for URL Shortener API & Background Worker
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Production Dependencies
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS dependencies

WORKDIR /usr/src/app

# Install OpenSSL and CA certificates for Prisma TLS engine support
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests for reproducible dependency installation
COPY package*.json ./

# Install production dependencies only using the locked package-lock.json
RUN npm ci --omit=dev

# Install prisma CLI and dotenv in the dependencies layer so migrations can run
# as a standalone one-off job without devDependencies (e.g. jest, typescript)
RUN npm install --no-save prisma@7.10.1 dotenv@18.0.9

# ------------------------------------------------------------------------------
# Stage 2: Build Application & Generate Prisma Client
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package*.json ./

# Install all dependencies (including devDependencies needed for compilation)
RUN npm ci

# Copy Prisma schema and Prisma 7 configuration
COPY prisma7.config.ts ./
COPY prisma ./prisma/

# Generate the Prisma 7 client into src/generated/prisma
RUN npx prisma generate

# Copy application source code and TypeScript build configs
COPY tsconfig*.json nest-cli.json ./
COPY src ./src/

# Compile NestJS application into dist/ (including dist/generated/prisma)
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 3: Production Runtime
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Runtime environment settings
ENV NODE_ENV=production
ENV PORT=3000

# Put node_modules bin on PATH so `prisma` CLI can be executed directly
ENV PATH="/usr/src/app/node_modules/.bin:$PATH"

# Copy production node_modules from dependencies stage
COPY --chown=node:node --from=dependencies /usr/src/app/node_modules ./node_modules

# Copy package.json to enable `npm run start:prod` and `npm run worker`
COPY --chown=node:node package.json ./

# Copy compiled JavaScript output from builder stage
COPY --chown=node:node --from=builder /usr/src/app/dist ./dist

# Copy Prisma configuration and migrations for the one-off migration job
COPY --chown=node:node prisma7.config.ts ./
COPY --chown=node:node prisma ./prisma/

# Run as non-root user
USER node

# Expose default HTTP port
EXPOSE 3000

# Default command: run the API service
# To run worker: override command with ["npm", "run", "worker"]
# To run migrations: override command with ["prisma", "migrate", "deploy"]
CMD ["npm", "run", "start:prod"]
