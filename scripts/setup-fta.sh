#!/usr/bin/env bash
set -e

# Update the repository
git pull

# Install dependencies
npm ci

# Validate that everything works as expected
npm run validate

# Install the CLI globally
cd packages/cli
npm i -g

# Get back to the root
cd ../..

echo -e "\n\n✅ All set up\n\nRun 'fta' to see available commands."
