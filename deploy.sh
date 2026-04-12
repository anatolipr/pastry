#!/bin/bash
set -e

BUMP=${1:-minor}

if [[ "$BUMP" != "major" && "$BUMP" != "minor" && "$BUMP" != "patch" ]]; then
  echo "Usage: $0 [major|minor|patch]"
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
