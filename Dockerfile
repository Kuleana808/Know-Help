FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --production

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY knowledge.config.json ./

# Build TypeScript
RUN npm run build

# Create data directory for persistent storage
RUN mkdir -p /data

# Environment variables
ENV PORT=3000
ENV DATA_DIR=/data
ENV ALLOWED_ORIGINS=https://know.help,http://localhost:3000,http://localhost:8080

EXPOSE 3000

# Run waitlist server
CMD ["node", "dist/waitlist/server.js"]
