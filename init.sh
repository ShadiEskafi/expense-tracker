#!/usr/bin/env bash
# Health Gate Initialization Script (Bash)
# Fails fast on any error to protect harness integrity.
set -e

echo "=== 1. Checking Dependencies ==="
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo "=== 2. Running Linter ==="
npm run lint

echo "=== 3. Running Automated Tests ==="
npm test

echo "=== 4. Verifying Production Build ==="
npm run build

echo ""
echo "=== Environment healthy ==="
