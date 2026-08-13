FROM node:20-slim

# Install C++ compiler & Python tools required to build mediasoup native bindings
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 4000
EXPOSE 10000-10100/udp
EXPOSE 10000-10100/tcp

CMD ["npm", "start"]
