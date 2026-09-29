#!/bin/sh
# Starts the site. Tailscale is optional: it's only used to reach the Ollama box for the
# chat assistant. The web server starts right away either way, so Railway's health check
# never waits on (or fails because of) Tailscale.

if [ -n "$TAILSCALE_AUTHKEY" ]; then
  if ! command -v tailscaled >/dev/null 2>&1; then
    echo "[start] tailscaled isn't installed in this image; is Railway building from the Dockerfile?"
  else
    STATE_DIR="${DATA_DIR:-${RAILWAY_VOLUME_MOUNT_PATH:-/data}}/tailscale"
    mkdir -p "$STATE_DIR" 2>/dev/null || STATE_DIR=/tmp/tailscale
    mkdir -p "$STATE_DIR"
    tailscaled --tun=userspace-networking --state="$STATE_DIR/tailscaled.state" --socks5-server=localhost:1055 &
    (
      # Wait for the daemon to accept commands (up to ~20s) before logging in.
      i=0
      until tailscale status >/dev/null 2>&1 || [ "$(tailscale status 2>&1 | grep -c 'Logged out\|NeedsLogin')" -gt 0 ] || [ $i -ge 40 ]; do
        i=$((i + 1)); sleep 0.5
      done
      if tailscale up --authkey="$TAILSCALE_AUTHKEY" --hostname="${TAILSCALE_HOSTNAME:-universium}" --accept-routes; then
        echo "[start] tailscale connected as $(tailscale ip -4 2>/dev/null)"
      else
        echo "[start] tailscale up failed; the chat assistant will be offline (check TAILSCALE_AUTHKEY)"
      fi
    ) &
  fi
else
  echo "[start] TAILSCALE_AUTHKEY not set; the chat assistant will be offline"
fi

exec node server.js
