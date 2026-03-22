# Buccaneer Wallet — Monorepo

## Overview

Real mainnet Bitcoin Lightning wallet iOS app with a pirate/nautical theme. Uses Breez SDK Spark (`@breeztech/breez-sdk-spark`), Expo React Native, Express.js API server with PostgreSQL, and NWC (Nostr Wallet Connect / NIP-47) for AI agent access.

**Lightning address:** `buccaneeradiciw@breez.tips`

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Mobile**: Expo SDK 54 + React Native (Expo Router), bundle ID: `com.buccaneer.wallet`
- **Audio**: `expo-audio` v1.1.1 (migrated from deprecated expo-av)
- **Secure Storage**: `expo-secure-store` (iOS Keychain backup for wallet seed)
- **Fonts**: Chewy (display/headings/balance), Nunito (body/UI text — 400, 500, 600, 700, 800)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Lightning**: Breez SDK Spark (`@breeztech/breez-sdk-spark`)
- **NWC**: nostr-tools, @noble/secp256k1, ws (Nostr Wallet Connect relay)

## Structure

```text
/
├── artifacts/
│   ├── api-server/          # Express API (port from $PORT env, default 8080)
│   │   └── src/
│   │       ├── lib/breez.ts # Breez SDK integration (lazy-init, parse, send, receive)
│   │       ├── lib/nwc.ts   # NWC relay service (NIP-47 over wss://relay.damus.io)
│   │       └── routes/      # wallet, settings, agentKeys, health
│   └── mobile/              # Expo React Native app
│       ├── app/             # Expo Router file-based routes
│       │   ├── _layout.tsx  # Root Stack (fonts, providers)
│       │   ├── (tabs)/index.tsx  # Home screen (balance, txs, send/receive)
│       │   ├── onboarding.tsx    # Welcome + restore flow + "Setting Sail" loading
│       │   ├── send.tsx          # Send: single-screen flow (QR scan → paste → inline amount/fee → send)
│       │   ├── receive.tsx       # Receive (Lightning address QR + keypad)
│       │   ├── settings.tsx      # Captain's Quarters (full settings)
│       │   ├── backup.tsx        # Seed phrase backup flow (choose/seed/verify/done)
│       │   └── agent-keys.tsx    # NWC/API agent key management with logs
│       ├── contexts/
│       │   ├── WalletContext.tsx  # balance, txs, send/receive, parse, memo via API
│       │   └── SettingsContext.tsx # AsyncStorage + server sync
│       └── constants/colors.ts   # MIDNIGHT/DAYLIGHT themes (matched to original web app)
├── lib/
│   ├── api-spec/            # OpenAPI 3.1 spec + Orval config
│   ├── api-client-react/    # Generated React Query hooks
│   ├── api-zod/             # Generated Zod schemas from OpenAPI
│   └── db/                  # Drizzle ORM schema + DB connection
│       └── src/schema/index.ts
│           # settingsTable, agentKeysTable (w/ daily limits, connection type),
│           # transactionCacheTable, transactionMemosTable, agentLogsTable
└── scripts/                 # Utility scripts
```

## Key Design Decisions

### Theme
- **Colors**: MIDNIGHT dark theme (Navy `#0B1426`, Gold `#c9a24d`, Teal `#2A9D8F`, Coral `#E76F51`)
- **Fonts**: Chewy_400Regular (headings/display), Inter family (body)
- **Pirate vocabulary**: "Transaction Log", "Captain's Quarters", "Protect Your Treasure", "Loading plunder...", "Sail the Lightning seas"

### Navigation
- Root Stack in `_layout.tsx` (no tab bar visible)
- `(tabs)/index.tsx` = home (redirects to `/onboarding` if `settings.onboardingDone` is false)
- Send/Receive presented as modals

### API Routes (all under `/api`)
- `GET /healthz` — health check
- `GET /wallet/balance` — Breez getInfo()
- `GET /wallet/transactions` — Breez listPayments() with memos, cached fees, agent attribution
- `PATCH /wallet/transactions/:id/memo` — update transaction memo
- `POST /wallet/send` — Breez sendPayment() (supports amountSats for variable invoices)
- `POST /wallet/receive` — Breez prepareReceivePayment + receivePayment
- `POST /wallet/decode-invoice` — Breez parseInvoice()
- `POST /wallet/parse` — parse any input (bolt11, lnurl, lightning address, bitcoin URI)
- `GET /wallet/btc-price?currency=USD` — CoinGecko price
- `GET /wallet/lightning-address` — returns dynamic address from Breez SDK
- `GET /wallet/btc-address` — generate on-chain Bitcoin address
- `GET /wallet/unclaimed-deposits` — list unclaimed on-chain deposits
- `GET /wallet/seed-phrase` — returns WALLET_MNEMONIC words
- `GET /wallet/node-info` — node pubkey, block height, balance
- `GET /wallet/status` — SDK initialization status
- `GET /wallet/new-payments` — check for new incoming payments
- `POST /wallet/sync` — force wallet sync
- `GET/PUT /settings` — PostgreSQL settings
- `GET/POST/PATCH/DELETE /agent-keys` — NWC/API key management (with daily limits)
- `GET /agent-keys/:id/logs` — per-key activity logs

### Agent REST API (all under `/api/v1`, requires `Authorization: Bearer bwk_...`)
- `GET /v1/balance` — check wallet balance
- `POST /v1/send` — pay a Lightning invoice (`{ bolt11, amountSats? }`)
- `POST /v1/receive` — create a payment request (`{ amountSats, description? }`)
- `GET /v1/transactions` — list payment history (`?limit=50&offset=0`)
- `POST /v1/decode-invoice` — decode a BOLT11 invoice (`{ bolt11 }`)
- Auth middleware validates API keys, enforces per-tx and daily spending limits, logs all actions
- Keys are `bwk_`-prefixed tokens stored in `secretKey` column for API-type agent keys

### NWC Relay Service (nwc.ts)
- Connects to `wss://relay.damus.io` as a NIP-47 service provider
- Subscribes to all active NWC agent keys
- Handles: `get_info`, `get_balance`, `pay_invoice`, `make_invoice`, `list_transactions`, `lookup_invoice`
- Enforces per-transaction and daily spending limits
- Verifies Nostr event signatures before processing
- Auto-reconnects on disconnect, refreshes subscriptions on key create/update/delete
- Uses NIP-04 encryption for all request/response pairs

### DB Schema
- `settings`: fiatCurrency, primaryDisplay, soundEffects, backupCompleted, lightningAddress
- `agent_keys`: name, nwcUri, secretKey, spendingLimitSats, maxDailySats, spentToday, spentDate, connectionType (nwc/api), isActive
- `transaction_cache`: txId, type, amountSats, feeSats, description, status
- `transaction_memos`: txId (PK), memo, updatedAt
- `agent_logs`: keyId, action, amount, status, detail, createdAt

### Secrets Required
- `BREEZ_API_KEY` — Breez SDK API key
- `WALLET_MNEMONIC` — 12-word BIP39 mnemonic (real mainnet wallet)

### Mobile Env
- `EXPO_PUBLIC_DOMAIN` — set to `https://$REPLIT_DEV_DOMAIN` for API access from Expo web

### Breez SDK Init
Lazy: first API call triggers `initBreezSdk()`. Uses `SdkBuilder.new(config, seed).withDefaultStorage(storageDir).build()` pattern. SDK connects to mainnet. Requires `better-sqlite3` native module for local storage (rebuild with `npx prebuild-install` in the `better-sqlite3` package dir if missing). Receive screen is a bottom sheet modal on the home screen (like original web app's Drawer).

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. Always typecheck from the root:
```sh
pnpm run typecheck
```

## Development

```sh
# API server
pnpm --filter @workspace/api-server run dev

# Mobile (Expo)
pnpm --filter @workspace/mobile run dev

# DB push
pnpm --filter @workspace/db run push

# API codegen
pnpm --filter @workspace/api-spec run codegen
```
