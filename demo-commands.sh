#!/bin/bash
# demo-commands.sh — Run these in a terminal recorder (asciinema, ttyrec, etc.)
# Prereqs: limps installed, a project with plans initialized

set -e
PROJECT="demo-project"

echo "=== limps Demo ==="
echo ""

echo "## 1. List Plans"
limps list-plans --project $PROJECT
echo ""
sleep 1

echo "## 2. Plan Status"
limps status 1 --project $PROJECT
echo ""
sleep 1

echo "## 3. Next Task (with scoring)"
limps next-task 1 --project $PROJECT
echo ""
sleep 1

echo "## 4. Knowledge Graph - Reindex"
limps graph reindex --project $PROJECT
echo ""
sleep 1

echo "## 5. Knowledge Graph - Health"
limps graph health --project $PROJECT
echo ""
sleep 1

echo "## 6. Knowledge Graph - Search"
limps graph search "auth" --project $PROJECT
echo ""
sleep 1

echo "## 7. Knowledge Graph - Trace"
limps graph trace plan:0001 --project $PROJECT --direction down
echo ""
sleep 1

echo "## 8. Health Check"
limps health check --project $PROJECT
echo ""
sleep 1

echo "## 9. Proposals"
limps proposals list --project $PROJECT
echo ""
sleep 1

echo "## 10. Repair Plans"
limps repair-plans --check --project $PROJECT
echo ""
sleep 1

echo "## 11. Sync MCP Config"
limps config sync-mcp --client cursor --print
echo ""

echo "=== Demo Complete ==="
