FROM node:20-slim

# Tailscale (optional, for the chat assistant). curl + certs are needed to install it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL https://tailscale.com/install.sh | sh \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first so code changes don't bust the npm layer.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .
RUN chmod +x start.sh

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["./start.sh"]
