# =============================================================================
# AI Trading Platform - Production Dockerfile
# Supports Phase 2.4 Multi-Exchange Expansion
# =============================================================================

# Build stage
FROM node:18-alpine AS builder

# Set build arguments
ARG NODE_ENV=production
ARG BUILD_DATE
ARG VERSION
ARG GIT_COMMIT

# Set environment variables
ENV NODE_ENV=${NODE_ENV} \
    BUILD_DATE=${BUILD_DATE} \
    VERSION=${VERSION} \
    GIT_COMMIT=${GIT_COMMIT}

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Labels for metadata
LABEL maintainer="AI Trading Platform Team" \
      version="${VERSION}" \
      description="AI-powered cryptocurrency trading platform with multi-exchange support" \
      org.opencontainers.image.title="AI Trading Platform" \
      org.opencontainers.image.description="AI-powered cryptocurrency trading platform" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.source="https://github.com/your-org/ai-trading-platform"

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HEALTH_CHECK_PORT=3001 \
    TZ=Asia/Bangkok

# Install runtime dependencies
RUN apk add --no-cache \
    curl \
    tzdata \
    sqlite \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Set timezone
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Create non-root user for security
RUN addgroup -g 1001 -S trading && \
    adduser -S trading -u 1001 -G trading

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=trading:trading /app/dist ./dist
COPY --from=builder --chown=trading:trading /app/node_modules ./node_modules
COPY --from=builder --chown=trading:trading /app/package*.json ./

# Copy production launcher and other necessary files
COPY --chown=trading:trading start-production.mjs ./
COPY --chown=trading:trading .env.example ./.env.example

# Create necessary directories
RUN mkdir -p /app/data /app/logs /app/config /app/backups && \
    chown -R trading:trading /app

# Switch to non-root user
USER trading

# Expose ports
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/health/live || exit 1

# Set entrypoint
ENTRYPOINT ["dumb-init", "--"]

# Default command
CMD ["node", "start-production.mjs"]

# Add custom signals for graceful shutdown
STOPSIGNAL SIGTERM

# Security scanning recommendations
# RUN addgroup -S docker && addgroup trading docker