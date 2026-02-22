#!/usr/bin/env bash
# Smoke test — generate thumbnails for a fixed set of posts and open the output.
# Run manually to evaluate prompt quality after changing system.md or generators.
#
# Usage: ./test/smoke.sh

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BASE_DIR="output/smoke-${TIMESTAMP}"

POSTS=(
  # hands-on technical
  "12391|docker|How To Sandbox Your AI Agent Using Docker"
  # biographical / historical
  "12147|hamilton|Women in Tech: Margaret Hamilton"
  # business / disruption narrative
  "12195|tailwind|How AI Wiped Out 80% of Tailwind's Revenue"
  # conceptual / opinion
  "12518|agentic|Agentic Engineering Is Just Good Engineering (With a Better Driver)"
  # hands-on Ruby
  "12262|activejob|Everything you should know about Background Jobs with ActiveJob"
)

echo "=== Smoke test: ${#POSTS[@]} posts → ${BASE_DIR} ==="
echo ""

PIDS=()
for entry in "${POSTS[@]}"; do
  IFS='|' read -r id slug title <<< "$entry"
  dir="${BASE_DIR}/${slug}"
  echo "Starting: ${title} → ${dir}"
  ./kanario "$id" -o "$dir" &
  PIDS+=($!)
done

echo ""
echo "Waiting for ${#PIDS[@]} jobs ..."

FAILED=0
for pid in "${PIDS[@]}"; do
  if ! wait "$pid"; then
    FAILED=$((FAILED + 1))
  fi
done

echo ""
if [ "$FAILED" -gt 0 ]; then
  echo "WARNING: ${FAILED} job(s) failed"
else
  echo "All ${#POSTS[@]} posts generated successfully"
fi

echo ""
echo "Results:"
for entry in "${POSTS[@]}"; do
  IFS='|' read -r id slug title <<< "$entry"
  dir="${BASE_DIR}/${slug}"
  if [ -f "${dir}/prompts.json" ]; then
    count=$(node -e "console.log(JSON.parse(require('fs').readFileSync('${dir}/prompts.json','utf8')).prompts.length)")
    mascots=$(node -e "
      const p = JSON.parse(require('fs').readFileSync('${dir}/prompts.json','utf8')).prompts;
      const m = p.filter(x => x.mascot !== 'none').length;
      const n = p.length - m;
      console.log(m + ' mascot, ' + n + ' none');
    ")
    echo "  ${title}: ${count} prompts (${mascots})"
  else
    echo "  ${title}: FAILED"
  fi
done

echo ""
echo "Opening output folders ..."
for entry in "${POSTS[@]}"; do
  IFS='|' read -r id slug title <<< "$entry"
  open "${BASE_DIR}/${slug}" 2>/dev/null || true
done

echo ""
echo "Done! Review images in ${BASE_DIR}/"
