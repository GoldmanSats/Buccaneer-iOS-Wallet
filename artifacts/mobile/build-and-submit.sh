#!/bin/bash
set -e

echo "============================================"
echo "  Buccaneer Wallet - Build & Submit to App Store"
echo "============================================"
echo ""

cd "$(dirname "$0")"

echo "Step 1: Logging into Expo..."
eas login

echo ""
echo "Step 2: Building iOS app (this takes ~15-30 minutes)..."
eas build --platform ios --profile production --non-interactive

echo ""
echo "Step 3: Submitting to App Store Connect..."
echo "(You'll be asked for your Apple ID credentials)"
eas submit --platform ios --latest

echo ""
echo "============================================"
echo "  Done! Check App Store Connect for your build."
echo "  It should appear under TestFlight within a few minutes."
echo "============================================"
