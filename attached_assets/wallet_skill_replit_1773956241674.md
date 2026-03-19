---
name: bitcoin-wallet-design
description: Design principles, UX patterns, and technical lessons learned from building a Bitcoin Lightning wallet. Use when building any Bitcoin wallet, Lightning wallet, eCash wallet (Cashu/Fedimint), or cryptocurrency payment app. Covers the user's design preferences, Bitcoin Design Guide patterns, SDK integration approaches, and architecture decisions.
---

# Bitcoin Wallet Design & Development Guide

Context captured from building ₿uccaneer, a pirate-themed Bitcoin Lightning wallet using Breez SDK (Spark backend), React, Express, and PostgreSQL.

## User Design Preferences

### Visual Style
- **Dark mode default** — Deep navy/midnight theme as primary. Light mode available but secondary.
- **Playful theming** — The user enjoys character and personality in the UI (pirate theme for Buccaneer). Future wallets may have different themes but expect the same level of care.
- **Hand-drawn 2D cartoon** aesthetic for illustrations — NOT AI-generated Lottie animations (these look bad at small sizes and are unreliable to generate).
- **Fonts:** Display font for headings/amounts (e.g., "Chewy"), clean sans-serif for UI text (e.g., "Nunito").
- **Rounded, card-based UI** — Large border-radius (2rem-3rem), soft shadows, glass-panel effects.
- **Compact layouts** — The user cares deeply about everything fitting on screen. Keypad views, drawers, and overlays must fit within the viewport without scrolling when possible. When a keypad appears, shrink other elements (QR codes, headers) to make room.

### Interaction Patterns
- **Drawer-based flows** — Receive and Send use bottom drawers rather than page navigation for the initial interaction.
- **Framer Motion animations** — `layout` animation on transaction log expansion. Spring animations for celebration overlays. The user specifically prefers the `layout` prop approach.
- **Haptic feedback feel** — `active:scale-95` or `active:scale-[0.98]` on all tappable elements.
- **Sound effects** — Distinct sounds for send vs receive, gated by a user toggle. Don't play sounds by default without a setting to disable.
- **Celebration overlay** — Full-screen animated overlay for incoming payments (not just a toast). Big, joyful, auto-dismisses after ~5 seconds.

### Things the User Dislikes
- Generic/stock-looking UI — Everything should feel considered and custom.
- AI-generated SVG icons at small sizes — They tend to look messy. Use established icon libraries (Lucide, etc.) or very carefully crafted simple SVGs.
- Placeholder/mock data — Always prefer real data from real APIs. Build for production from day one.
- Silent failures — Errors should be explicit, not swallowed.
- Overly technical language in the UI — Keep it friendly and themed.

## Bitcoin Design Guide Principles

Reference: https://bitcoin.design/guide/

### Critical UX Patterns (Must-Have)
1. **Unified QR / BIP21** — When generating a receive invoice with a specific amount, the QR should encode a BIP21 URI: `bitcoin:<onChainAddr>?lightning=<BOLT11>&amount=<btcAmount>`. This lets both Lightning and on-chain wallets pay. Default no-amount QR can be Lightning-only (LNURL).
2. **Fee transparency** — Always show estimated fees before confirming a send. Show fees in the transaction detail view too.
3. **Receive/send limits** — Display subtle info text about limits and typical fees near QR codes and send screens.
4. **Balance tap-to-hide** — Privacy feature: tapping the balance toggles between visible and hidden ("•••"). Persist preference.
5. **Send Max / Use All Funds** — Small "Max" pill button near amount input. When tapped, fills in full balance. Show warning that network fees will be deducted.
6. **Scan QR from photos** — Allow importing QR codes from the photo gallery, not just live camera. Use `jsqr` library for client-side decoding.
7. **Payment status indicators** — Green checkmark (completed), yellow spinner (pending), red badge (failed) in both list and detail views.
8. **Cloud backup option** — Offer both manual seed phrase backup and cloud backup (iCloud/Google Drive) with PIN protection.

### Important UX Patterns (Should-Have)
- **Lightning address** — Register and display a human-readable Lightning address. Make the username part editable in settings.
- **Incoming payment notifications** — Detect new payments via SDK events or polling. Play a sound and show a celebration.
- **Editable transaction memos** — Let users add/edit notes on transactions after the fact.
- **Contacts / saved addresses** — Deferred until BOLT12 is available on the target SDK.
- **NFC tap-to-pay** — Android feasible now; iOS requires native (SwiftUI) for full Core NFC access.

### Architecture Pattern
- **SDK as source of truth** — Transaction history comes from the SDK, not the database. DB is fallback only.
- **Balance sync** — When fetching balance from SDK, also update the DB wallet record to keep them in sync.
- **Memo overlay** — Store user memos in a separate DB table keyed by SDK payment ID, then merge at query time.
- **Event-driven incoming payments** — SDK fires `paymentSucceeded` events. Store pending payments in memory, expose via polling endpoint, clear after client reads them.

## Technical Architecture (React + Express)

### Stack
- React + TypeScript + Vite (frontend)
- Express.js (backend API)
- PostgreSQL + Drizzle ORM (persistence)
- TailwindCSS v4 + shadcn/ui (styling)
- Framer Motion (animations)
- Wouter (routing)
- React Query / TanStack Query (data fetching)

### Key Patterns
- **React Query polling** — Balance polls every 15s, new-payment detection every 5s. Use `refetchInterval`.
- **Mutation + invalidation** — After send/receive, invalidate balance + transactions + wallet queries.
- **Lazy SDK init** — SDK initializes on first API call, not at server start. Singleton pattern with promise deduplication.
- **BigInt handling** — Bitcoin SDKs often return BigInt values. Always sanitize to Number before JSON serialization.
- **CJS/ESM interop** — Some SDK packages ship as CommonJS. Use `createRequire(import.meta.url)` in ESM projects.
- **Wake Lock** — Request screen wake lock when displaying receive QR codes so the screen doesn't dim.

### File Organization
- `shared/schema.ts` — Drizzle schema + Zod validation schemas + TypeScript types
- `server/breez.ts` (or equivalent SDK file) — All SDK interaction isolated in one file
- `server/routes.ts` — Thin API routes that delegate to storage + SDK
- `server/storage.ts` — Database CRUD via Drizzle, implements a storage interface
- `client/src/hooks/use-wallet.ts` — All React Query hooks for wallet/SDK APIs
- `client/src/hooks/use-settings.ts` — Settings management with optimistic updates
- `client/src/pages/Home.tsx` — Main wallet screen
- `client/src/pages/SendFlow.tsx` — Multi-step send flow
- `client/src/pages/Settings.tsx` — Settings/preferences

## On-Chain Transaction Minimums (Submarine Swaps)

When using Lightning-first wallets (Breez SDK Spark, Greenlight, Phoenix, etc.), on-chain transactions work via **submarine swaps** — converting between Lightning balance and on-chain Bitcoin through a swap service. This has important implications:

### Sending On-Chain
- **Minimum amount is typically 30,000–50,000 sats** depending on the swap provider and current network fees.
- The total cost includes: the send amount + on-chain mining fees + swap service fee.
- Amounts below the minimum will fail — often with a misleading "insufficient balance" error even if you have enough sats. The real issue is the amount is below the swap threshold.
- **Guidance for users:** For small amounts (under ~30k sats), always use Lightning (invoice or Lightning address). On-chain is for larger amounts where the fees make sense proportionally.

### Receiving On-Chain
- The wallet generates a Bitcoin address, but incoming funds are "claimed" via a swap into the Lightning balance.
- Very small on-chain deposits may cost more in claim fees than they're worth.
- Auto-claim with escalating fee rates (e.g., try 10, then 25, then 50 sat/vB) is a good pattern to handle varying network conditions.
- Show pending on-chain deposits clearly in the UI with a distinct visual treatment (yellow/pending state) and poll for confirmation (~15 second intervals).

### Fee Display
- Always show the swap fee breakdown before confirming an on-chain send.
- In the receive flow, show a note about minimum on-chain amounts and expected claim fees.

## Nostr Wallet Connect (NWC) Integration

NWC (NIP-47) allows external apps and AI agents to interact with the wallet over Nostr relays. This is how you give programmatic access to your wallet without exposing API keys directly.

### Architecture
- **Service keypair** — Derive deterministically from the wallet mnemonic (e.g., SHA-256 of `nwc-service-{mnemonic}`). This gives a stable Nostr identity without storing extra secrets.
- **Client keypair** — Generated fresh for each new NWC connection. The client secret is given to the connecting app as part of the connection URI.
- **Relay** — Use a well-known public relay (e.g., `wss://relay.damus.io`). Only one relay is needed.
- **Connection URI format:** `nostr+walletconnect://{servicePubkey}?relay={relayUrl}&secret={clientSecret}`

### Supported Methods (NIP-47)
- `get_info` — Wallet alias, color, pubkey, network, supported methods
- `get_balance` — Current balance in sats
- `pay_invoice` — Pay a BOLT11 invoice (enforce spend limits)
- `make_invoice` — Create a Lightning invoice for receiving
- `list_transactions` — Recent transaction history

### Authentication & Security
- Every incoming NWC request is authenticated by matching the sender's Nostr pubkey against registered connections in the database.
- Disabled connections are rejected with an "UNAUTHORIZED" NWC error response.
- All requests are decrypted using NIP-04 (encrypted DMs between service and client keypairs).
- Use the `nostr-tools` library for key generation, event signing, and NIP-04 encryption/decryption.

### WebSocket Relay Connection
- Maintain a persistent WebSocket connection to the relay.
- Subscribe to NWC request events (kind 23194) tagged to the service pubkey.
- Respond with NWC response events (kind 23195).
- Publish an info event (kind 13194) advertising supported methods.
- Implement reconnection logic with backoff for relay disconnects.

## Agent API Design

For letting AI agents (or any external automation) spend from the wallet via REST API:

### Key Management
- Generate API keys with a unique prefix (e.g., `buc_` followed by 64 hex chars).
- Each key has a human-readable label, enabled/disabled toggle, and spend limits.
- Store keys in the database alongside the wallet they belong to.
- When listing keys in the UI, mask the middle of the key (show first 8 and last 4 chars only).

### Spend Limits (Critical)
- **Per-transaction limit** (`maxPerTx`) — Maximum sats allowed in a single payment. Default: 1,000 sats.
- **Daily limit** (`maxDaily`) — Maximum total sats per calendar day. Default: 10,000 sats.
- Track `spentToday` and `spentDate` on each key. Reset the counter when the date changes.
- Check limits before every payment. Return a clear 403 error with the specific limit that was exceeded.

### API Endpoints Pattern
```
GET  /api/v1/agent/balance        — Current balance
GET  /api/v1/agent/info           — Wallet info + remaining spend limits
POST /api/v1/agent/invoice        — Create invoice (amountSats, description)
POST /api/v1/agent/pay            — Pay invoice or Lightning address
GET  /api/v1/agent/transactions   — Recent transactions
GET  /api/v1/agent/address        — Get Lightning address
```

### Authentication
- Bearer token auth: `Authorization: Bearer buc_...`
- Middleware validates the token against the database, checks enabled status, then attaches the key to the request.
- NWC connections use a separate auth path (Nostr pubkey matching) but share the same spend limit logic.

### Activity Logging
- Log every agent action (balance checks, payments, invoice creation) with: key ID, action type, amount, status (success/denied/error), and detail text.
- Expose logs per key in the settings UI so the wallet owner can audit what agents are doing.
- This is essential for trust — the user needs to see exactly what each agent has done.

## Mobile App Deployment: Capacitor vs Expo

### Capacitor Limitations (Lessons Learned)
- **No Expo Go support** — Capacitor wraps a web app in a native shell, but you cannot test it through Expo Go. You must build and install the full native binary every time.
- **TestFlight-only testing on iOS** — No quick preview workflow. Every change requires a new build, upload to TestFlight, and wait for processing.
- **Single backend instance** — A Capacitor app pointing to a Replit backend means all TestFlight users share the same wallet/mnemonic. This is fine for personal testing but dangerous if anyone else installs it.
- **Good for:** Quick proof-of-concept when you already have a working web app and just want it in a native shell.
- **Bad for:** Ongoing development iteration, multi-user testing, or anything requiring native APIs (NFC, biometrics, secure enclave).

### Expo / React Native (Recommended Path)
- **Expo Go testing** — Scan a QR code and instantly preview on your phone. Much faster iteration.
- **Direct App Store publishing** — EAS Build handles the full build pipeline.
- **Native API access** — Biometrics, secure storage, NFC, push notifications all work properly.
- **Tradeoff:** Frontend must be rewritten in React Native components (no HTML/CSS). The backend (Express + Breez SDK + database) can be reused as-is — just point the mobile app at the same API server.

## Cashu eCash Wallet Notes

If building a Cashu wallet next, key differences from Lightning:
- **Mints instead of nodes** — User connects to one or more Cashu mints (custodial eCash issuers).
- **Proofs instead of channels** — Balance is a set of eCash tokens (proofs) stored locally.
- **Cashu protocol** — NUT specifications define token formats, minting, melting (redeeming to Lightning), and swapping.
- **Libraries** — Look at `@cashu/cashu-ts` (TypeScript SDK) or the Cashu reference implementations.
- **Multi-mint support** — Users may want to connect to multiple mints and see aggregate balance.
- **Token backup** — eCash tokens are bearer instruments. Backup is even more critical than Lightning — lost tokens = lost funds.
- **Privacy focus** — eCash is inherently more private than Lightning. The UI should reflect this (no payment history stored on mint side).

Many of the UX patterns above (unified QR, fee transparency, send max, celebration overlays, tap-to-hide balance) apply equally to a Cashu wallet.
