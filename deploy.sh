#!/bin/bash
set -e

usage() {
  echo "Usage: $0 <major|minor|patch>"
  echo ""
  echo "Bump the version tag and trigger a GitHub Actions release build."
  echo ""
  echo "Arguments:"
  echo "  major   Increment major version (x.0.0)"
  echo "  minor   Increment minor version (0.x.0)"
  echo "  patch   Increment patch version (0.0.x)"
  echo ""
  echo "Examples:"
  echo "  $0 patch   # v1.2.3 → v1.2.4"
  echo "  $0 minor   # v1.2.3 → v1.3.0"
  echo "  $0 major   # v1.2.3 → v2.0.0"
}

if [[ -z "$1" ]]; then
  usage
  exit 1
fi

BUMP=$1

if [[ "$BUMP" == "--help" || "$BUMP" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "$BUMP" != "major" && "$BUMP" != "minor" && "$BUMP" != "patch" ]]; then
  echo "Error: invalid argument '$BUMP'"
  echo ""
  usage
  exit 1
fi

# Get latest tag, strip the 'v' prefix
LATEST=$(git tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
if [[ -z "$LATEST" ]]; then
  echo "No existing semver tag found. Creating v0.1.0"
  NEW_TAG="v0.1.0"
else
  VERSION="${LATEST#v}"
  MAJOR=$(echo "$VERSION" | cut -d. -f1)
  MINOR=$(echo "$VERSION" | cut -d. -f2)
  PATCH=$(echo "$VERSION" | cut -d. -f3)

  case "$BUMP" in
    major) NEW_TAG="v$((MAJOR + 1)).0.0" ;;
    minor) NEW_TAG="v${MAJOR}.$((MINOR + 1)).0" ;;
    patch) NEW_TAG="v${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
  esac
fi

echo "Current: ${LATEST:-none}  →  New: $NEW_TAG"
read -p "Push tag $NEW_TAG? [y/N] " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

git tag "$NEW_TAG"
git push origin "$NEW_TAG"
echo "Pushed $NEW_TAG — GitHub Actions release build is now running."
