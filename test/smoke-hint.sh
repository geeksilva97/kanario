#!/usr/bin/env bash
# Smoke test for --hint precedence — verify that creative direction overrides default scene logic.
# Run manually after changing system.md or the creative direction section.
#
# Usage: ./test/smoke-hint.sh

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BASE_DIR="output/smoke-hint-${TIMESTAMP}"

# Each entry: post_id|slug|hint|title
POSTS=(
  "12195|tailwind|a tornado destroying a small shop|How AI Wiped Out 80% of Tailwind's Revenue"
  "12147|hamilton|a rocket launch with dramatic lighting|Women in Tech: Margaret Hamilton"
  "12262|activejob|factory conveyor belt with boxes|Everything you should know about Background Jobs with ActiveJob"
)

echo "=== Hint smoke test: ${#POSTS[@]} posts → ${BASE_DIR} ==="
echo ""

PIDS=()
for entry in "${POSTS[@]}"; do
  IFS='|' read -r id slug hint title <<< "$entry"
  dir="${BASE_DIR}/${slug}"
  echo "Starting: ${title}"
  echo "    Hint: \"${hint}\" → ${dir}"
  ./kanario "$id" -o "$dir" --hint "$hint" &
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
  IFS='|' read -r id slug hint title <<< "$entry"
  dir="${BASE_DIR}/${slug}"
  if [ -f "${dir}/prompts.json" ]; then
    echo "  ${title} (hint: \"${hint}\"):"
    node -e "
      const p = JSON.parse(require('fs').readFileSync('${dir}/prompts.json','utf8')).prompts;
      p.forEach((x,i) => console.log('    ' + (i+1) + '. [' + x.mascot + '] ' + x.scene));
    "
  else
    echo "  ${title}: FAILED"
  fi
done

echo ""
echo "Opening output folders ..."
for entry in "${POSTS[@]}"; do
  IFS='|' read -r id slug hint title <<< "$entry"
  open "${BASE_DIR}/${slug}" 2>/dev/null || true
done

echo ""
echo "Done! Review images in ${BASE_DIR}/"
