FROM oven/bun:1.0.30 as builder
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install
COPY . .
RUN bun build ./index.ts --target=bun --outfile=dist/index.js

# Production image
FROM oven/bun:1.0.30-slim

# Install necessary dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder /app/dist/index.js ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 bunjs \
    && chown -R bunjs:nodejs /app

# Switch to non-root user
USER bunjs

# Expose the port
EXPOSE 3000

# Start the application
CMD ["bun", "index.js"]
