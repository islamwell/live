FROM node:18-alpine

# Install build dependencies for mediasoup
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    gcc \
    linux-headers

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose ports
# 4000: HTTP/WebSocket API
# 40000-49999: MediaSoup RTC ports
EXPOSE 4000
EXPOSE 40000-49999/udp
EXPOSE 40000-49999/tcp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "src/server.js"]
