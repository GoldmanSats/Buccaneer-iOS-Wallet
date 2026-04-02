#!/bin/bash
set -e

echo "🏴‍☠️ Buccaneer Wallet - Build & Submit to App Store"
echo "=================================================="
echo ""

cd "$(dirname "$0")"

echo "Step 1: Building iOS app..."
EAS_NO_VCS=1 EAS_BUILD_NO_EXPO_GO_WARNING=true npx eas-cli build \
  --platform ios \
  --profile production \
  --non-interactive \
  --wait

echo ""
echo "Step 2: Submitting to App Store Connect..."
EAS_NO_VCS=1 npx eas-cli submit \
  --platform ios \
  --profile production \
  --latest \
  --non-interactive

echo ""
echo "=================================================="
echo "Done! Your build has been submitted to App Store Connect."
echo "Go to https://appstoreconnect.apple.com to manage your release."
echo "=================================================="
