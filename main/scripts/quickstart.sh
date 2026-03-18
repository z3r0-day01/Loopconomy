#!/bin/bash
# quickstart.sh – Start the bot (with optional auto-restart)

if ! command -v node &> /dev/null; then
    echo "Node.js not found. Please install Node.js."
    exit 1
fi

# Check if nodemon is installed globally, otherwise use node
if command -v nodemon &> /dev/null; then
    echo "Starting with nodemon (auto-restart on changes)..."
    nodemon main.js
else
    echo "Starting with node..."
    node main.js
fi