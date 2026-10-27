#!/bin/bash
# ============================================================
# DESA HIDUP — runner VPS dengan AUTO-UPDATE
#
# Jalankan di VPS:
#   chmod +x run.sh
#   nohup ./run.sh > desa.log 2>&1 &
#
# Yang dia kerjakan, selamanya:
#   1. Pull update terbaru dari GitHub (kalau ada) → npm install → build
#   2. Nyalakan server persisten
#   3. Tiap CHECK_INTERVAL detik cek GitHub:
#      ada commit baru? → matikan server dengan SIGTERM
#      (desa OTOMATIS di-autosave dulu) → ulangi dari langkah 1
#   4. Server crash? → langsung dinyalakan lagi (desa bangun dari save)
#
# ENV (opsional):
#   PORT=3000            port server
#   CHECK_INTERVAL=300   detik antar cek update (default 5 menit)
# ============================================================
set -u
cd "$(dirname "$0")"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
INTERVAL="${CHECK_INTERVAL:-300}"

log() { echo "[run.sh $(date '+%H:%M:%S')] $*"; }

update_if_needed() {
  git fetch origin "$BRANCH" --quiet 2>/dev/null || { log "⚠️ fetch gagal (offline?), lanjut pakai versi lokal"; return 1; }
  local LOCAL REMOTE
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse "origin/$BRANCH")
  if [ "$LOCAL" != "$REMOTE" ]; then
    log "⬇️ Update baru terdeteksi ($(git rev-parse --short HEAD) → $(git rev-parse --short "origin/$BRANCH"))"
    git pull --ff-only origin "$BRANCH" || { log "⚠️ pull gagal, pakai versi lokal"; return 1; }
    npm install --no-audit --no-fund
    npm run build
    log "✅ Update terpasang: $(git log --oneline -1)"
    return 0
  fi
  return 1
}

# build pertama kalau dist/ belum ada
update_if_needed
[ -d dist ] || { npm install --no-audit --no-fund && npm run build; }

while true; do
  log "🏰 Menyalakan server (branch $BRANCH, commit $(git rev-parse --short HEAD))"
  node server/server.js &
  SERVER_PID=$!

  # pantau: server mati sendiri (cek tiap 5 dtk) ATAU ada update (tiap INTERVAL)
  ELAPSED=0
  while kill -0 "$SERVER_PID" 2>/dev/null; do
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    if [ "$ELAPSED" -ge "$INTERVAL" ]; then
      ELAPSED=0
      if update_if_needed; then
        log "🔄 Restart untuk update — desa di-autosave dulu..."
        kill -TERM "$SERVER_PID" 2>/dev/null
        break
      fi
    fi
  done

  wait "$SERVER_PID" 2>/dev/null
  log "💤 Server berhenti — nyala lagi dalam 2 detik"
  sleep 2
done
