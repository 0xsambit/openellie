# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./

# Copy package manifests for all workspace packages (for efficient layer caching)
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY apps/bot/package.json ./apps/bot/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy all source files
COPY packages/ ./packages/
COPY apps/bot/ ./apps/bot/

# Build packages in dependency order
RUN pnpm --filter @openellie/tsconfig build 2>/dev/null || true
RUN pnpm --filter @openellie/shared build
RUN pnpm --filter @openellie/db build
RUN pnpm --filter @openellie/bot build

# ─── Stage 2: Runner ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

# Install pnpm (needed for workspace resolution at runtime)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user for security
RUN addgroup --system --gid 1001 openellie && \
  adduser --system --uid 1001 openellie

WORKDIR /app

# Copy workspace config
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Copy built artifacts and package manifests
COPY --from=builder /app/packages/tsconfig/ ./packages/tsconfig/
COPY --from=builder /app/packages/shared/dist/ ./packages/shared/dist/
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/db/dist/ ./packages/db/dist/
COPY --from=builder /app/packages/db/drizzle/ ./packages/db/drizzle/
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/apps/bot/dist/ ./apps/bot/dist/
COPY --from=builder /app/apps/bot/package.json ./apps/bot/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Switch to non-root user
USER openellie

WORKDIR /app/apps/bot

# Health check via Hono HTTP server
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:${BOT_PORT:-3000}/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

EXPOSE ${BOT_PORT:-3000}

CMD ["node", "dist/index.js"]
