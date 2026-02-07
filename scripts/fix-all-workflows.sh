#!/bin/bash
set -euo pipefail

echo "🔧 Professional Workflow Repair Script"
echo "====================================="
echo ""

# Configuration
ORG="Ghenghis"
REPO="Super-Goose"
WORKFLOWS_DIR=".github/workflows"

# Backup
echo "📦 Creating backup..."
cp -r "${WORKFLOWS_DIR}" ".github/workflows-backup-$(date +%Y%m%d-%H%M%S)"
echo "✓ Backup created"
echo ""

# Fix 1: Repository checks
echo "🔄 Fixing repository checks..."
find "${WORKFLOWS_DIR}" -type f \( -name "*.yml" -o -name "*.yaml" \) -exec \
  sed -i "s/github\.repository == 'block\/goose'/github.repository == '${ORG}\/${REPO}'/g" {} \;
echo "✓ Repository checks updated"
echo ""

# Fix 2: Container images
echo "🐳 Fixing container image references..."
find "${WORKFLOWS_DIR}" -type f \( -name "*.yml" -o -name "*.yaml" \) -exec \
  sed -i "s|ghcr\.io/block/goose|ghcr.io/${ORG,,}/super-goose|g" {} \;
echo "✓ Container images updated"
echo ""

# Fix 3: Disable signing temporarily
echo "🔐 Disabling code signing (no secrets configured yet)..."
for wf in "canary.yml" "nightly.yml"; do
  if [ -f "${WORKFLOWS_DIR}/${wf}" ]; then
    sed -i 's/signing: true/signing: false/g' "${WORKFLOWS_DIR}/${wf}"
    echo "✓ Signing disabled in ${wf}"
  fi
done
echo ""

# Verification
echo "✅ Verification"
echo "==============="
REMAINING=$(grep -r "block/goose" "${WORKFLOWS_DIR}" 2>/dev/null | wc -l)
if [ "$REMAINING" -gt 0 ]; then
  echo "⚠ Found ${REMAINING} remaining 'block/goose' references"
else
  echo "✓ No 'block/goose' references found"
fi

echo ""
echo "✓ Workflow fixes complete!"
