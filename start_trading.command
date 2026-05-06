#!/bin/bash

# ============================================================
#  Fidelity Speed Loader — Startup Script
# ============================================================

# Get the directory where the script is located
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$PROJECT_DIR"

echo "------------------------------------------------------------"
echo "🚀 Starting Fidelity Speed Loader Server..."
echo "------------------------------------------------------------"

# 1. Kill any existing server on port 3000
echo "🧹 Cleaning up port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null

# 2. Start the Node Server (Visible Logs)
echo "📡 Starting Ticket Server on http://localhost:3000..."
echo "Press [Ctrl+C] to stop the server."
echo "------------------------------------------------------------"

# Run node directly so we can see any errors (like missing modules)
node server.js
