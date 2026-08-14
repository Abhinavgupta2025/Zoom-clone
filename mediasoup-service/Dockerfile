FROM node:20-slim

# Install ca-certificates, curl, tar so mediasoup can fetch prebuilt worker binary, plus build fallback tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    tar \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Restrict compilation jobs to 1 job for ninja/make in case fallback compilation occurs
ENV MEDIASOUP_BUILD_MAX_JOBS=1
ENV MAKEFLAGS="-j1"
ENV NINJAFLAGS="-j1"

RUN npm ci --omit=dev

COPY . .

EXPOSE 4000
EXPOSE 10000-10100/udp
EXPOSE 10000-10100/tcp

CMD ["npm", "start"]
