# Buccaneer Wallet — Monorepo

## Overview

Real mainnet Bitcoin Lightning wallet iOS app with a pirate/nautical theme. Uses Breez SDK Spark on-device (`@breeztech/breez-sdk-spark-react-native`) for self-custody per-user wallets, Expo React Native, Express.js API server with PostgreSQL (for agent key access), and NWC (Nostr Wallet Connect / NIP-47) for AI agent access.

**Lightning address:** `buccaneeradiciw@breez.tips`

## Architecture

### On-Device Wallet (iOS)
- Each user runs Breez SDK Spark directly on their iPhone
- Seed phrase generated on-device via `bip39`, stored in iOS Keychain via `expo-secure-store`
- All wallet operations (balance, send, receive, parse, decode) happen locally — no server calls
- BTC price fetched directly from Coinbase/CoinGecko APIs
- Memos stored locally via SecureStore
- Requires EAS custom build (native Breez SDK module — cannot run in Expo Go)

### API Server (Agent Access Only)
- Keeps its own Breez SDK instance for NWC relay and REST agent API
- Agent keys, NWC relay, and `/v1` REST API remain server-side
- Database stores agent keys, logs, settings sync (optional)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Mobile**: Expo SDK 54 + React Native (Expo Router), bundle ID: `com.buccaneer.wallet`
- **On-device SDK**: `@breeztech/breez-sdk-spark-react-native` v0.12.2
- **Audio**: `expo-audio` v1.1.1 (migrated from deprecated expo-av)
- **Secure Storage**: `expo-secure-store` (iOS Keychain for seed phrase + wallet backup)
- **Biometrics**: `expo-local-authentication` (Face ID / Touch ID lock)
- **Seed Generation**: `bip39` (BIP39 mnemonic generation/validation on-device), Breez SDK `Passkey` class with PRF-based deterministic derivation
- **Passkey**: `react-native-passkey` v3.3+ (WebAuthn PRF extension, iOS 18+)
- **Fonts**: Chewy (display/headings/balance), Nunito (body/UI text — 400, 500, 600, 700, 800)
- **Database**: PostgreSQL + Drizzle ORM (server-side only)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **Lightning**: Breez SDK Spark (on-device for mobile, Node.js for server agent access)
- **NWC**: nostr-tools, @noble/secp256k1, ws (Nostr Wallet Connect relay)
- **EAS**: Expo Application Services for iOS builds (eas.json configured)

## Structure

```text
/
├── artifacts/
│   ├── api-server/          # Express API (agent access only)
│   │   └── src/
│   │       ├── lib/breez.ts # Server-side Breez SDK (for agent payments)
│   │       ├── lib/nwc.ts   # NWC relay service (NIP-47 over wss://relay.damus.io)
│   │       └── routes/      # wallet (agent), settings, agentKeys, health
│   └── mobile/              # Expo React Native app
│       ├── app/             # Expo Router file-based routes
│       │   ├── _layout.tsx  # Root Stack (fonts, providers, BiometricLock)
│       │   ├── (tabs)/index.tsx  # Home screen (balance, txs, send/receive)
│       │   ├── onboarding.tsx    # Welcome + seed generation + restore flow
│       │   ├── send.tsx          # Send: single-screen flow (QR scan → paste → amount/fee → send)
│       │   ├── receive.tsx       # Receive (Lightning address QR + keypad)
│       │   ├── settings.tsx      # Captain's Quarters (full settings)
│       │   ├── backup.tsx        # Seed phrase backup flow (choose/seed/verify/done)
│       │   └── agent-keys.tsx    # NWC/API agent key management with logs
│       ├── components/
│       │   └── BiometricLock.tsx  # Face ID / Touch ID lock screen
│       ├── contexts/
│       │   ├── WalletContext.tsx  # On-device SDK calls (balance, txs, send, receive)
│       │   └── SettingsContext.tsx # AsyncStorage + optional server sync
│       ├── utils/
│       │   ├── breezService.ts   # On-device Breez SDK wrapper (init, send, receive, parse, etc.)
│       │   ├── passkeyService.ts # Passkey PRF provider + wallet create/restore via Breez Passkey class
│       │   └── icloudBackup.ts   # iOS Keychain backup/restore for seed phrase
│       ├── constants/colors.ts   # MIDNIGHT/DAYLIGHT themes
│       └── eas.json              # EAS build config (development, preview, production)
├── lib/
│   ├── api-spec/            # OpenAPI 3.1 spec + Orval config
│   ├── api-client-react/    # Generated React Query hooks
│   ├── api-zod/             # Generated Zod schemas from OpenAPI
│   └── db/                  # Drizzle ORM schema + DB connection
│       └── src/schema/index.ts
│           # settingsTable, agentKeysTable, transactionCacheTable, transactionMemosTable, agentLogsTable
└── scripts/                 # Utility scripts
```

## Key Design Decisions

### On-Device Wallet Architecture
- `breezService.ts` is the on-device SDK wrapper — mirrors server-side `breez.ts` but for React Native
- `WalletContext.tsx` detects platform: `Platform.OS !== "web"` → uses on-device SDK; web → falls back to API server
- Seed phrase stored in `expo-secure-store` with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` accessibility
- SDK storage directory: `DocumentDirectoryPath/breez-data`
- API key embedded in build via `EXPO_PUBLIC_BREEZ_API_KEY` env var (set in eas.json)

### Passkey Wallet (PRF-based)
- Onboarding defaults to passkey-based wallet creation (Face ID prompt) on iOS 18+
- Falls back to legacy seed phrase creation if passkey not supported
- `passkeyService.ts` implements `PasskeyPrfProvider` interface using `react-native-passkey`
- Uses Breez SDK `Passkey` class to derive deterministic BIP39 mnemonic from passkey PRF output
- Labels stored/retrieved via Nostr relays (Breez spec v0.9.1)
- RP ID: `keys.breez.technology` (Breez-managed associated domain)
- Backup badge removed from main screen; seed phrase export remains in Settings (backup.tsx)
- Restore options: "Restore with Passkey" (PRF re-derivation) or "Restore with Seed Phrase" (manual input)

### Theme
- **Colors**: MIDNIGHT dark theme (Navy `#0B1426`, Gold `#c9a24d`, Teal `#2A9D8F`, Coral `#E76F51`)
- **Daylight mode**: Light theme with warm beige/cream tones
- **Fonts**: Chewy_400Regular (headings/display), Nunito family (body)
- **Pirate vocabulary**: "Transaction Log", "Captain's Quarters", "Protect Your Treasure"

### Navigation
- Root Stack in `_layout.tsx` (no tab bar visible)
- `(tabs)/index.tsx` = home (redirects to `/onboarding` if `settings.onboardingDone` is false)
- Send/Receive presented as modals

### Agent REST API (all under `/api/v1`, requires `Authorization: Bearer bwk_...`)
- `GET /v1/balance` — check wallet balance
- `POST /v1/send` — pay a Lightning invoice (`{ bolt11, amountSats? }`)
- `POST /v1/receive` — create a payment request (`{ amountSats, description? }`)
- `GET /v1/transactions` — list payment history (`?limit=50&offset=0`)
- `POST /v1/decode-invoice` — decode a BOLT11 invoice (`{ bolt11 }`)
- Auth middleware validates API keys, enforces per-tx and daily spending limits, logs all actions

### NWC Relay Service (nwc.ts)
- Connects to `wss://relay.damus.io` as a NIP-47 service provider
- Subscribes to all active NWC agent keys
- Handles: `get_info`, `get_balance`, `pay_invoice`, `make_invoice`, `list_transactions`, `lookup_invoice`
- Enforces per-transaction and daily spending limits

### DB Schema (server-side)
- `settings`: fiatCurrency, primaryDisplay, soundEffects, backupCompleted, lightningAddress
- `agent_keys`: name, nwcUri, secretKey, spendingLimitSats, maxDailySats, spentToday, spentDate, connectionType (nwc/api), isActive
- `transaction_cache`: txId, type, amountSats, feeSats, description, status
- `transaction_memos`: txId (PK), memo, updatedAt
- `agent_logs`: keyId, action, amount, status, detail, createdAt

### Security
- `/api/wallet/seed-phrase` requires `X-Wallet-Owner` header matching `WALLET_OWNER_TOKEN` env var (403 without it)
- Agent REST API (`/api/v1/*`) requires `Authorization: Bearer bwk_...` header
- Mobile app reads seed from local SecureStore only — never calls the seed-phrase API
- NWC agent keys stored in PostgreSQL with spending limits enforced per-tx and daily

### Secrets Required
- `BREEZ_API_KEY` — Breez SDK API key (embedded in iOS build via EAS)
- `WALLET_MNEMONIC` — Server-side only (for agent wallet); mobile users generate their own on-device
- `WALLET_OWNER_TOKEN` — Required to access `/api/wallet/seed-phrase` endpoint (auto-generated)

### EAS Build
- `eas.json` configured with development, preview, and production profiles
- `BREEZ_API_KEY` passed as build env var: `EXPO_PUBLIC_BREEZ_API_KEY`
- Requires Apple Developer account for TestFlight submission
- `app.json` has Face ID permission, expo-secure-store plugin, expo-local-authentication plugin, `@breeztech/breez-sdk-spark-react-native` plugin (with `enablePasskey: true` for `webcredentials:keys.breez.technology` associated domain)

### Critical Dependencies
- `@noble/secp256k1` MUST stay at `"2.1.0"` in api-server/package.json
- Breez SDK Spark fee field: `fees` (not `fee`, `feeSat`, `feesSat`)

## Development

```sh
# API server (agent access)
pnpm --filter @workspace/api-server run dev

# Mobile (Expo — web preview only, no native SDK on web)
pnpm --filter @workspace/mobile run dev

# EAS Build (requires eas-cli + Apple Developer account)
cd artifacts/mobile && eas build --platform ios --profile development

# DB push
pnpm --filter @workspace/db run push
```
