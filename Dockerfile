# Build stage
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and configs
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:22-slim AS production

# Security: Run as non-root user
RUN groupadd --gid 1000 nodejs \
    && useradd --uid 1000 --gid nodejs --shell /bin/bash --create-home nodejs

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create data directory with correct permissions
RUN mkdir -p /app/.data && chown -R nodejs:nodejs /app/.data

# Switch to non-root user
USER nodejs

# Set environment variables
ENV NODE_ENV=production \
    MOUSE_MCP_TRANSPORT=http \
    MOUSE_MCP_PORT=3000 \
    MOUSE_MCP_HOST=0.0.0.0 \
    MOUSE_MCP_DB_PATH=/app/.data/disney.db

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Expose port
EXPOSE 3000

# Run the server
CMD ["node", "dist/index.js"]
