FROM node:20-slim

# Tailscale (optional, for the chat assistant). Copy the static binaries from Tailscale's
# official image, the method their docs recommend for hosts like Railway. The version check
# makes the build fail loudly if they're ever missing, instead of failing silently at runtime.
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscaled /usr/local/bin/tailscaled
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscale /usr/local/bin/tailscale
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /var/run/tailscale /var/lib/tailscale \
 && tailscale version

WORKDIR /app

# Install dependencies first so code changes don't bust the npm layer.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .
# Windows checkouts can turn start.sh into CRLF, which breaks it; normalise it here too.
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["./start.sh"]
