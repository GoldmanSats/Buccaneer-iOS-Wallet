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

## Structure

```text
/
├── artifacts/
│   ├── api-server/          # Express API (port from $PORT env, default 8080)
│   │   └── src/
│   │       ├── lib/breez.ts # Breez SDK integration (lazy-init)
│   │       └── routes/      # wallet, settings, agentKeys, health
│   └── mobile/              # Expo React Native app
│       ├── app/             # Expo Router file-based routes
│       │   ├── _layout.tsx  # Root Stack (fonts, providers)
│       │   ├── (tabs)/index.tsx  # Home screen (balance, txs, send/receive)
│       │   ├── onboarding.tsx    # Welcome screen
│       │   ├── send.tsx          # Send Lightning payment
│       │   ├── receive.tsx       # Receive (static Lightning address QR)
│       │   ├── settings.tsx      # Captain's Quarters
│       │   ├── backup.tsx        # Seed phrase backup flow
│       │   └── agent-keys.tsx    # NWC AI agent key management
│       ├── contexts/
│       │   ├── WalletContext.tsx  # balance, txs, send/receive via API
│       │   └── SettingsContext.tsx # AsyncStorage + server sync
│       └── constants/colors.ts   # MIDNIGHT/DAYLIGHT themes
├── lib/
│   ├── api-spec/            # OpenAPI 3.1 spec + Orval config
│   ├── api-client-react/    # Generated React Query hooks
│   ├── api-zod/             # Generated Zod schemas from OpenAPI
│   └── db/                  # Drizzle ORM schema + DB connection
│       └── src/schema/
│           ├── settings.ts        # fiatCurrency, primaryDisplay, etc.
│           ├── agentKeys.ts       # NWC keys with spending limits
│           └── transactionCache.ts # Cached payment records
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
- `GET /wallet/transactions` — Breez listPayments()
- `POST /wallet/send` — Breez sendPayment()
- `POST /wallet/receive` — Breez prepareReceivePayment + receivePayment
- `POST /wallet/decode-invoice` — Breez parseInput()
- `GET /wallet/btc-price?currency=USD` — CoinGecko price
- `GET /wallet/lightning-address` — returns hardcoded address
- `GET /wallet/seed-phrase` — returns WALLET_MNEMONIC words
- `GET/PUT /settings` — PostgreSQL settings
- `GET/POST/DELETE /agent-keys` — NWC key management

### Secrets Required
- `BREEZ_API_KEY` — Breez SDK API key
- `WALLET_MNEMONIC` — 12-word BIP39 mnemonic (real mainnet wallet)

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
