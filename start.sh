#!/bin/sh
# Starts the site. Tailscale is optional: it's only used to reach the Ollama box for the
# chat assistant. The web server starts right away either way, so Railway's health check
# never waits on (or fails because of) Tailscale.

if [ -n "$TAILSCALE_AUTHKEY" ]; then
  STATE_DIR=/data/tailscale
  mkdir -p "$STATE_DIR" 2>/dev/null || STATE_DIR=/tmp/tailscale
  mkdir -p "$STATE_DIR"
  tailscaled --tun=userspace-networking --state="$STATE_DIR/tailscaled.state" --socks5-server=localhost:1055 &
  (
    sleep 2
    tailscale up --authkey="$TAILSCALE_AUTHKEY" --accept-routes --hostname="${TAILSCALE_HOSTNAME:-universium}" \
      && echo "[start] tailscale connected" \
      || echo "[start] tailscale up failed; the chat assistant will be offline"
  ) &
else
  echo "[start] TAILSCALE_AUTHKEY not set; the chat assistant will be offline"
fi

exec node server.js
