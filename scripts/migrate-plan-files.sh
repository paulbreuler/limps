#!/bin/bash
#
# migrate-plan-files.sh
#
# Migrates plan files from legacy format (plan.md) to new Obsidian-friendly
# naming format ({dirName}-plan.md).
#
# This improves Obsidian graph view by giving each plan a unique, descriptive
# node name instead of generic "plan" nodes.
#
# Usage:
#   ./scripts/migrate-plan-files.sh [plans-directory]
#
# Arguments:
#   plans-directory  Path to plans directory (default: ./plans)
#
# Examples:
#   ./scripts/migrate-plan-files.sh
#   ./scripts/migrate-plan-files.sh ~/projects/my-app/plans
#
# The script will:
#   - Find all plan.md files in plan directories (e.g., 0001-feature/plan.md)
#   - Rename them to {dirName}-plan.md (e.g., 0001-feature/0001-feature-plan.md)
#   - Skip directories that already use the new naming format
#   - Report all changes made
#

set -e

PLANS_DIR="${1:-./plans}"

if [ ! -d "$PLANS_DIR" ]; then
  echo "Error: Plans directory not found: $PLANS_DIR"
  echo "Usage: $0 [plans-directory]"
  exit 1
fi

echo "Migrating plan files in: $PLANS_DIR"
echo "----------------------------------------"

migrated=0
skipped=0
errors=0

for dir in "$PLANS_DIR"/*/; do
  # Skip if not a directory
  [ -d "$dir" ] || continue

  dirName=$(basename "$dir")

  # Skip hidden directories and non-plan directories
  [[ "$dirName" =~ ^[0-9]+-.*$ ]] || continue

  oldPath="${dir}plan.md"
  newPath="${dir}${dirName}-plan.md"

  # Skip if already migrated
  if [ -f "$newPath" ]; then
    echo "Skipped: $dirName (already migrated)"
    ((skipped++))
    continue
  fi

  # Skip if no plan.md exists
  if [ ! -f "$oldPath" ]; then
    echo "Skipped: $dirName (no plan.md found)"
    ((skipped++))
    continue
  fi

  # Perform migration
  if mv "$oldPath" "$newPath" 2>/dev/null; then
    echo "Migrated: $dirName"
    echo "  $oldPath -> $newPath"
    ((migrated++))
  else
    echo "Error: Failed to migrate $dirName"
    ((errors++))
  fi
done

echo "----------------------------------------"
echo "Migration complete:"
echo "  Migrated: $migrated"
echo "  Skipped:  $skipped"
echo "  Errors:   $errors"

if [ $errors -gt 0 ]; then
  exit 1
fi
