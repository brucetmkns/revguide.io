#!/bin/bash

# RevGuide Extension Packaging Script
# Creates a versioned zip file for Chrome Web Store upload

set -e

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Read version from manifest.json
VERSION=$(grep '"version"' "$ROOT_DIR/manifest.json" | sed 's/.*"version": *"\([^"]*\)".*/\1/')

if [ -z "$VERSION" ]; then
    echo "Error: Could not read version from manifest.json"
    exit 1
fi

ZIP_NAME="revguide-extension-v${VERSION}.zip"
DIST_DIR="$ROOT_DIR/dist"

echo ""
echo "📦 Packaging RevGuide Extension v${VERSION}"
echo ""

# Check if dist directory exists
if [ ! -d "$DIST_DIR" ]; then
    echo "Error: dist/ directory not found. Run 'npm run build' first."
    exit 1
fi

# Remove any existing nested zip from dist
rm -f "$DIST_DIR/revguide-extension.zip"

# Create the versioned zip in project root
cd "$DIST_DIR"
zip -r "$ROOT_DIR/$ZIP_NAME" . -x "*.DS_Store" -x "*.zip"

echo ""
echo "✅ Created: $ZIP_NAME"
echo "   Location: $ROOT_DIR/$ZIP_NAME"
echo ""
echo "📋 Next steps:"
echo "   1. Upload to Chrome Web Store Developer Dashboard"
echo "   2. Update CLAUDE.md version history after successful upload"
echo "   3. Commit the versioned zip: git add $ZIP_NAME"
echo ""
