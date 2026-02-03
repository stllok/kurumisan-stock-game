# Multi-stage build for optimal image size
# Stage 1: Build the application
FROM oven-sh/bun:latest AS builder

WORKDIR /app

# Copy dependency files
COPY package.json bun.lockb ./

# Install all dependencies (including dev dependencies for build)
RUN bun install

# Copy source code
COPY . .

# Build the application
RUN bun build ./src/index.ts --outdir ./build --target bun --minify

# Stage 2: Production runtime
FROM oven-sh/bun:latest AS runtime

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install only production dependencies
RUN bun install --production

# Copy built artifacts from builder stage
COPY --from=builder /app/build ./build

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun --version || exit 1

# Run the built application
CMD ["bun", "run", "build/index.js"]
