FROM node:20-slim

ARG CACHEBUST=1

RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://tailscale.com/install.sh | sh && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ENV PORT=8080
CMD tailscaled --tun=userspace-networking --state=/data/tailscale/tailscaled.state & sleep 2 && \
    tailscale up --authkey=${TAILSCALE_AUTHKEY} --accept-routes && \
    node server.js
