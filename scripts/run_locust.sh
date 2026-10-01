#!/usr/bin/env bash
# ==============================================================================
# 🌾 PantryPool — Locust Load & Production API Testing Runner
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Detect Locust executable
if [ -n "${VIRTUAL_ENV:-}" ] && [ -x "${VIRTUAL_ENV}/bin/locust" ]; then
  LOCUST_BIN="${VIRTUAL_ENV}/bin/locust"
  PYTHON_BIN="${VIRTUAL_ENV}/bin/python"
elif [ -x "./venv/bin/locust" ]; then
  LOCUST_BIN="./venv/bin/locust"
  PYTHON_BIN="./venv/bin/python"
elif command -v locust >/dev/null 2>&1; then
  LOCUST_BIN="$(command -v locust)"
  PYTHON_BIN="$(command -v python3)"
else
  echo "❌ Error: locust not found. Please run: pip install locust"
  exit 1
fi

TARGET_HOST="${TARGET_URL:-https://pantrypool.com}"
USERS="${USERS:-100}"
SPAWN_RATE="${SPAWN_RATE:-10}"
RUN_TIME="${RUN_TIME:-1m}"
HTML_REPORT="${HTML_REPORT:-locust_report.html}"
CSV_PREFIX="${CSV_PREFIX:-locust_stats}"
HEADLESS=false
PRESEED=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --headless|-H)
      HEADLESS=true
      shift
      ;;
    --preseed|-p)
      PRESEED=true
      shift
      ;;
    --host)
      TARGET_HOST="$2"
      shift 2
      ;;
    -u|--users)
      USERS="$2"
      shift 2
      ;;
    -r|--spawn-rate)
      SPAWN_RATE="$2"
      shift 2
      ;;
    -t|--run-time)
      RUN_TIME="$2"
      shift 2
      ;;
    --html)
      HTML_REPORT="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --headless, -H        Run in headless mode without web UI"
      echo "  --preseed, -p         Pre-generate 100 users before load test"
      echo "  --host <url>          Target host base URL (default: https://pantrypool.com)"
      echo "  -u, --users <N>       Number of concurrent users (default: 100)"
      echo "  -r, --spawn-rate <N>  Users spawned per second (default: 10)"
      echo "  -t, --run-time <time> Duration of test in headless mode, e.g. 1m, 30s (default: 1m)"
      echo "  --html <path>         HTML report destination (default: locust_report.html)"
      echo "  -h, --help            Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

cd "${PROJECT_ROOT}"

echo "======================================================================="
echo " 🌾 PantryPool — Locust Production API Load Testing Runner"
echo "======================================================================="
echo "🌐 Target Host   : ${TARGET_HOST}"
echo "👥 Target Users  : ${USERS}"
echo "⚡ Spawn Rate    : ${SPAWN_RATE} users/sec"
echo "⚙️ Mode          : $([ "$HEADLESS" = true ] && echo "Headless Automation (${RUN_TIME})" || echo "Interactive Web UI (http://localhost:8089)")"
echo "======================================================================="

# Optional pre-seeding step
if [ "$PRESEED" = true ]; then
  echo ""
  echo "⏳ Pre-generating ${USERS} random users on ${TARGET_HOST}..."
  "${PYTHON_BIN}" scripts/create_locust_users.py --host "${TARGET_HOST}" --count "${USERS}" --output locust_users.json
fi

if [ "$HEADLESS" = true ]; then
  echo ""
  echo "🚀 Launching headless Locust load run against ${TARGET_HOST}..."
  "${LOCUST_BIN}" \
    -f locustfile.py \
    --headless \
    --host "${TARGET_HOST}" \
    -u "${USERS}" \
    -r "${SPAWN_RATE}" \
    --run-time "${RUN_TIME}" \
    --html "${HTML_REPORT}" \
    --csv "${CSV_PREFIX}" \
    --only-summary
  
  echo ""
  echo "======================================================================="
  echo "✅ Locust load run complete!"
  echo "📊 HTML Performance Report: ${PROJECT_ROOT}/${HTML_REPORT}"
  echo "📈 CSV Metrics Export     : ${PROJECT_ROOT}/${CSV_PREFIX}_*.csv"
  echo "======================================================================="
else
  echo ""
  echo "🚀 Launching Locust Web Dashboard..."
  echo "🌐 Open your browser at: http://localhost:8089"
  echo "   (Set host to ${TARGET_HOST}, users to ${USERS}, spawn rate to ${SPAWN_RATE})"
  echo "======================================================================="
  exec "${LOCUST_BIN}" -f locustfile.py --host "${TARGET_HOST}"
fi
