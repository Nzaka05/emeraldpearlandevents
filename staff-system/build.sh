#!/bin/bash
set -e

echo "==> Installing staff-system dependencies..."
npm install

echo "==> Installing root project dependencies (shared modules)..."
cd .. && npm install --production

echo "==> Build complete."
