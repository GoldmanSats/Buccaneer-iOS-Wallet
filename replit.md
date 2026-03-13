# Buccaneer Wallet — Monorepo

## Overview

Real mainnet Bitcoin Lightning wallet iOS app with a pirate/nautical theme. Uses Breez SDK Liquid (nodeless backend), Expo React Native, Express.js API server with PostgreSQL, and NWC (Nostr Wallet Connect / NIP-47) for AI agent access.

**Lightning address:** `buccaneeradiciw@breez.tips`

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Mobile**: Expo SDK 54 + React Native (Expo Router)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Lightning**: Breez SDK Liquid (`@breeztech/breez-sdk-liquid`)
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
│       │   ├── send.tsx          # Send: QR scan, paste, image picker, BIP21/LN addr
│       │   ├── receive.tsx       # Receive (Lightning address QR + keypad)
│       │   ├── settings.tsx      # Captain's Quarters (full settings)
│       │   ├── backup.tsx        # Seed phrase backup flow (choose/seed/verify/done)
│       │   └── agent-keys.tsx    # NWC/API agent key management with logs
│       ├── contexts/
│       │   ├── WalletContext.tsx  # balance, txs, send/receive, parse, memo via API
│       │   └── SettingsContext.tsx # AsyncStorage + server sync
│       └── constants/colors.ts   # MIDNIGHT/DAYLIGHT themes
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
- **Fonts**: PirataOne_400Regular (headings), Inter family (body)
- **Pirate vocabulary**: "Transaction Log", "Captain's Quarters", "Protect Your Treasure", "Loading plunder...", "Sail the Lightning seas"

### Navigation
- Root Stack in `_layout.tsx` (no tab bar visible)
- `(tabs)/index.tsx` = home (redirects to `/onboarding` if `settings.onboardingDone` is false)
- Send/Receive presented as modals

### API Routes (all under `/api`)
- `GET /healthz` — health check
- `GET /wallet/balance` — Breez getInfo()
- `GET /wallet/transactions` — Breez listPayments() with memos
- `PATCH /wallet/transactions/:id/memo` — update transaction memo
- `POST /wallet/send` — Breez sendPayment() (supports amountSats for variable invoices)
- `POST /wallet/receive` — Breez prepareReceivePayment + receivePayment
- `POST /wallet/decode-invoice` — Breez parseInvoice()
- `POST /wallet/parse` — parse any input (bolt11, lnurl, lightning address, bitcoin URI)
- `GET /wallet/btc-price?currency=USD` — CoinGecko price
- `GET /wallet/lightning-address` — returns hardcoded address
- `GET /wallet/seed-phrase` — returns WALLET_MNEMONIC words
- `GET /wallet/node-info` — node pubkey, block height, balance
- `GET /wallet/status` — SDK initialization status
- `GET /wallet/new-payments` — check for new incoming payments
- `POST /wallet/sync` — force wallet sync
- `GET/PUT /settings` — PostgreSQL settings
- `GET/POST/PATCH/DELETE /agent-keys` — NWC key management (with daily limits)
- `GET /agent-keys/:id/logs` — per-key activity logs

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
Lazy: first API call triggers `getBreezSdk()`. If env vars missing, gracefully falls back to zeros. SDK uses `LiquidNetwork.MAINNET`.

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
