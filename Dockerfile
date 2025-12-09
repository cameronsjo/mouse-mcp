# syntax=docker/dockerfile:1

# Disney MCP Server Dockerfile
# Multi-stage build optimized for security and size

# =============================================================================
# Build Stage
# =============================================================================
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --ignore-scripts

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# =============================================================================
# Production Stage
# =============================================================================
FROM node:22-slim AS production

# OCI Labels for container metadata
LABEL org.opencontainers.image.title="Disney MCP Server" \
      org.opencontainers.image.description="MCP server providing Disney parks data through semantic search" \
      org.opencontainers.image.source="https://github.com/cameronsjo/mouse-mcp" \
      org.opencontainers.image.licenses="MIT"

# Security: Set environment variables early
ENV NODE_ENV=production \
    # Disable npm update checks
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    # Disable color output for cleaner logs
    NO_COLOR=1 \
    # App configuration
    MOUSE_MCP_TRANSPORT=http \
    MOUSE_MCP_PORT=3000 \
    MOUSE_MCP_HOST=0.0.0.0 \
    MOUSE_MCP_DB_PATH=/app/.data/disney.db

WORKDIR /app

# Copy package files and install production deps in single layer
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    # Remove unnecessary files to reduce image size
    && rm -rf /root/.npm /tmp/*

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Security: Create data directory and set ownership
# Run as non-root user (node:node already exists in base image, uid:gid 1000:1000)
RUN mkdir -p /app/.data \
    && chown -R node:node /app

# Security: Drop to non-root user
USER node

# Health check using Node.js fetch API
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Document exposed port
EXPOSE 3000

# Run the server
CMD ["node", "dist/index.js"]
