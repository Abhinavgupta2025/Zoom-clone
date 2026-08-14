FROM node:20-slim AS builder

# Install minimal build tools required to compile mediasoup worker binary
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# CRITICAL FOR RENDER: Restrict C++ compilation to 1 job to prevent >8GB memory spike and OOM crash
ENV MEDIASOUP_BUILD_MAX_JOBS=1
ENV MAKEFLAGS="-j1"

RUN npm ci --omit=dev

COPY . .

# Final minimal runtime image
FROM node:20-slim AS runner
WORKDIR /app

COPY --from=builder /app ./

EXPOSE 4000
EXPOSE 10000-10100/udp
EXPOSE 10000-10100/tcp

CMD ["npm", "start"]
