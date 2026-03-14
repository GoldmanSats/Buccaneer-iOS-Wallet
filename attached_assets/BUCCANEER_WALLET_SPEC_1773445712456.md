# Buccaneer Wallet — Complete App Specification

This document describes every screen, color, component, API endpoint, and behavior of the Buccaneer Wallet app. Use this as the definitive reference to rebuild the app in React Native / Expo.

The full working web codebase is available at: **https://github.com/GoldmanSats/buccaneer-wallet**

---

## 1. Overview

Buccaneer Wallet is a Bitcoin Lightning wallet with a pirate/nautical theme. It runs on **mainnet with real sats** using the **Breez SDK (Spark/nodeless backend)**. It is a single-user personal wallet.

**Key Facts:**
- Lightning address: `buccaneeradiciw@breez.tips`
- Backend: Breez SDK Spark (nodeless)
- Network: Bitcoin mainnet
- NWC relay: `wss://relay.damus.io`
- Version: v1.0.0 "Blackbeard"

---

## 2. Design System

### 2.1 Color Palette

**Midnight Mode (default dark theme):**
- Background: `#0B1426` (deep navy)
- Card/surface: `bg-card` (slightly lighter navy, around `#151f35`)
- Foreground text: white/near-white
- Muted text: `text-muted-foreground` (grey-blue)
- Border: `border-border/50` (subtle, semi-transparent)

**Daylight Mode (light theme):**
- Background: white
- Card/surface: white/light grey
- Foreground text: near-black

**Accent Colors:**
- Primary/Gold: `#c9a24d`, `#d4ad5a` (pirate gold, used for primary buttons)
- Receive (teal): `#17A2B8` (icon bg), `#0D6E7D` (text in light), `#17A2B8` (text in dark)
- Send (orange): `#E86A33` (icon bg), `#B54215` (text in light), `#E86A33` (text in dark)
- Receive button background (light mode): `#EAF7FA`, hover `#DDF2F6`
- Send button background (light mode): `#FDE9E6`, hover `#F9D7D2`
- Pending/deposit: yellow-500 tones
- Error/delete: red-500 tones
- Lightning address text: `text-yellow-500/90`

### 2.2 Typography
- Headings: pirate-themed display font (`font-display`)
- Body: system sans-serif
- Mono: system monospace (for addresses, hashes, seed words)

### 2.3 Component Patterns
- Cards: `rounded-[2rem]` with `shadow-sm border border-border/50`
- Buttons: `rounded-2xl` or `rounded-3xl`, `active:scale-95` or `active:scale-[0.97]` for press feedback
- Icons: 10x10 containers with `rounded-xl` and tinted backgrounds (e.g., `bg-yellow-500/15`, `bg-purple-100 dark:bg-purple-900/30`)
- Settings rows: `p-4` padding, icon + label + subtitle pattern, chevron or switch on right

### 2.4 Sound Effects
- **Receive payment**: plays `were_rich.m4a`
- **Send payment**: plays `small_cannon.mp3`
- **Fiat toggle**: plays `fiat_maxi.m4a`
- Sounds can be muted via "Annoying Parrot Squawks" toggle in Settings

---

## 3. App Flow & Navigation

```
Onboarding (if not onboarded)
  -> Welcome screen
  -> Create New Wallet / Restore from Backup
  -> "Setting Sail..." loading
  -> Home

Home (main screen)
  -> Settings (Captain's Quarters)
  -> Backup Flow (if not backed up, banner shown)
  -> Receive (bottom sheet/drawer)
  -> Send (separate screen)

Settings (Captain's Quarters)
  -> Backup (Seed Phrase)
  -> Agent Access (AI Agent Keys)
  -> Back to Home
```

---

## 4. Screen-by-Screen Specification

### 4.1 Onboarding Screen

**File:** `client/src/pages/Onboarding.tsx`

**Welcome Screen:**
- Full-screen, centered layout
- Logo: moonlit galleon ship image (`buc_3_1773366690786.png`), 160x160, `rounded-[2rem]`, shadow, `border border-white/10`
- Title: "Buccaneer Wallet" in display font, 4xl
- Subtitle: "The self-custody lightning wallet built for pirates, not saylors."
- Three feature icons in a row with dividers:
  - Lightning bolt image + "Instant"
  - Anchor icon + "Yours"
  - Bitcoin symbol + "BTC Only"
- Two buttons at bottom:
  - "Create New Wallet" — primary filled button (gold bg)
  - "Restore from Backup" — outlined card-style button

**Restore Screen:**
- Back button (Anchor icon)
- Title: "Restore Wallet" / "Pick up where ye left off, Captain."
- iCloud Backup card: Cloud icon (blue), "Check for Backup" button
- Recovery Phrase card: KeyRound icon (amber), 12-word grid (3 columns), Paste button, "Restore Wallet" button
- Seed word inputs: numbered 1-12, monospace font

**Loading Screen ("Setting Sail..."):**
- Ship logo animating (bobbing up/down)
- Spinner
- "Setting Sail..." title
- "It may take a little time to weigh anchor" subtitle

**Error Screen:**
- AlertCircle icon (red)
- "Something Went Wrong" title
- Error message
- "Try Again" button

### 4.2 Home Screen

**File:** `client/src/pages/Home.tsx`

**Header:**
- Left: Settings gear button (custom ship wheel SVG — circle with spokes and knobs, `w-10 h-10 rounded-full bg-card border border-border/50`)
- Right: "Backup!" badge if not backed up (orange pill with ShieldAlert icon, uppercase tracking-wider text)

**Balance Display (centered):**
- Tappable to hide/reveal balance
- Sats mode: Bitcoin symbol (₿) + formatted number, responsive font size based on digit count (3-digit=7xl, 5-digit=6xl, 7-digit=5xl, more=4xl)
- Fiat mode: currency symbol + formatted amount
- Secondary line: approximate conversion (e.g., "≈ $12.50 USD" or "≈ 19,231 sats")
- Hidden state shows "•••" with "Tap to reveal"

**Fiat Conversion Rates (hardcoded):**
```
USD: 0.00065, symbol $
EURO: 0.00060, symbol €
YEN: 0.098, symbol ¥
AUD: 0.0010, symbol A$
GBP: 0.00051, symbol £
NZD: 0.0011, symbol NZ$
```

**Send/Receive Buttons (2-column grid):**
- Receive: teal themed, ArrowDownLeft icon (w-14 h-14 circle), "Receive" label
  - Light: `bg-[#EAF7FA]`, icon bg `bg-[#17A2B8]/20`, text `text-[#0D6E7D]`
  - Dark: `bg-card`, icon bg `bg-[#17A2B8]/10`, text `text-[#17A2B8]`
- Send: orange themed, ArrowUpRight icon, "Send" label
  - Light: `bg-[#FDE9E6]`, icon bg `bg-[#E86A33]/20`, text `text-[#B54215]`
  - Dark: `bg-card`, icon bg `bg-[#E86A33]/10`, text `text-[#E86A33]`

**Transaction Log (bottom panel):**
- Expandable panel with `rounded-t-[2.5rem]`, slides up to full screen
- Header: History icon + "Transaction Log" (tappable to expand/collapse)
- Empty state: "No transactions yet" / "Your voyage log is empty"
- Each transaction row:
  - Circle icon (w-12 h-12): ArrowDownLeft for receive (teal), ArrowUpRight for send (orange)
  - Pending deposits: yellow themed with spinning Loader2 badge
  - Memo/description text (bold, sm) + date (xs, muted)
  - Right side: +/- amount in sats (colored), fee if any, status indicator (CheckCircle2 green, Loader2 yellow spinning, "FAILED" red text)
- Tapping a transaction opens detail drawer

**Transaction Detail Drawer:**
- Large circle icon (w-20 h-20)
- Amount in display font (4xl) + "sats"
- Date/time
- Pending deposit: yellow banner with "Waiting for on-chain confirmation"
- Fields: Status, Method (for deposits), Fee, Memo (editable input), Payment Hash (monospace, break-all)

**Receive Drawer (bottom sheet):**
- Title: "Receive" in display font
- QR Code: large, white background, rounded corners
  - Center overlay: "₿uccaneer" text with Lightning ⚡ badge (and Bitcoin ₿ badge if on-chain available)
  - QR value: unified Bitcoin URI if on-chain available, otherwise LNURL bech32
  - Shrinks to 180px when amount entry is shown
- Lightning address display below QR: tappable to copy, yellow text, "Lightning Address · tap to copy" subtitle
- Protocol badges: "⚡ Lightning" + "₿ On-chain" pills if both available
- Info text about receive limits
- Two buttons: "Request Amount" (outlined/dashed) + "Share" (yellow filled)
- Amount entry mode: display with unit toggle (SATS/BTC/USD), 3x4 number keypad, Cancel + Generate buttons
- After invoice generated: truncated invoice preview, fee info, Copy + Share buttons, "New Invoice" button
- Wake lock active while drawer is open

**Celebration Overlay (on payment received):**
- Full screen dark overlay with blur
- Treasure chest image (animated wobble)
- "Treasure Received!" in display font (white, 4xl)
- "+{amount}" in yellow display font (6xl) + "sats"
- Description text
- "Tap anywhere to dismiss"
- Auto-dismisses after ~5 seconds
- Plays `were_rich.m4a` sound

### 4.3 Send Screen

**File:** `client/src/pages/SendFlow.tsx` (route: `/send`)

Features:
- QR scanner for scanning invoices
- Manual paste field for Lightning invoices or addresses
- Amount input with unit toggle
- Fee preview before sending
- Confirmation step
- Plays `small_cannon.mp3` on successful send

### 4.4 Settings Screen (Captain's Quarters)

**File:** `client/src/pages/Settings.tsx`

**Header:**
- Back button (ArrowLeft in w-10 h-10 circle, `bg-white glass-panel`)
- Title: "Captain's Quarters" in display font (3xl)
- Sticky with blur (`bg-background/80 backdrop-blur-md`)

**Lightning Address Card (top section):**
- Card with `rounded-[2rem] p-4`
- Display mode: Zap icon (yellow, w-10 h-10 rounded-xl bg-yellow-500/15) + address text (bold) + Copy button (w-8 h-8 circle) + Edit/Pencil button (w-8 h-8 circle)
- Edit mode: input field with `@breez.tips` suffix, Cancel + Save buttons

**Security & Ship Guard Section:**
- Section header: "SECURITY & SHIP GUARD" (xs, uppercase, tracking-widest, muted)
- Seed Phrase row: Key icon (secondary bg), "Backup your booty" subtitle, chevron right -> navigates to `/backup`
- Face ID Lock row: Shield icon (accent bg), switch toggle

**Agent Access Section:**
- Section header: "AGENT ACCESS"
- AI Agent Keys row: Bot icon (purple bg), "Let AI agents use your wallet" subtitle, chevron right -> navigates to `/agent-access`

**Preferences Section:**
- Section header: "PREFERENCES"
- Fiat Currency row: Coins icon, dropdown select (USD/EURO/YEN/AUD/GBP/NZD)
- Primary Display row: Coins icon, segmented toggle (SATS / FIAT)
- Annoying Parrot Squawks row: Bell icon (blue bg), switch toggle (controls sound effects)
- Daytime Mode row: Moon/Sun icon (indigo bg), switch toggle

**About The Voyage Section:**
- Spark Network Status: Sparkles icon (purple bg), status indicator (green pulse dot "ONLINE", red dot "OFFLINE", or spinner "CHECKING")
  - Expandable: shows Balance, Pending Receive/Send, Node ID, Backend ("Spark (Nodeless)"), Network ("Mainnet")
- Pirate's Code (TOS): BookOpen icon (gray bg), external link icon
- Version footer: "v1.0.0 'Blackbeard'" centered, muted

**Danger Zone Section:**
- Red-bordered card
- Delete Wallet: Trash2 icon (red bg), "Wipe wallet and return to setup"
- Confirmation modal: AlertTriangle icon, "Abandon Ship?" title, warning about losing funds, "Delete My Wallet" red button + "Actually, on second thought..." cancel

### 4.5 Backup Flow (Protect Your Treasure)

**File:** `client/src/pages/BackupFlow.tsx`

**Step 0 — Choose Method:**
- 3D treasure map SVG icon in circle (w-24 h-24, `bg-[#f5e6c8]` light / `bg-card` dark)
  - The SVG is a folded parchment map with 4 panels (3D perspective using polygons), dashed trails, dashed circle, and red X marks the spot
- Title: "Protect Your Treasure" (display font, 4xl)
- Subtitle: "Choose how to back up your wallet. You can always do both later."
- Two options:
  - "Write Down Seed Phrase" — PenLine icon + "Manual, offline backup"
  - "Cloud Backup" — Cloud icon + "Encrypted, automatic" (blue themed)

**Manual Backup Flow:**
- Step 1 — View seed words: 12-word grid (3 columns, 4 rows), each word numbered, revealed with eye toggle option
- Step 2 — Verify: Quiz on 4 random words, user must type correct word for each position
- Completion: marks backup as done, returns to home

**Cloud Backup Flow:**
- Step 1 — Intro with lock icon
- Step 2 — Create PIN (4+ digits)
- Step 3 — Verify PIN
- Step 4 — Choose provider (iCloud/Google Drive)
- Step 5 — Uploading animation
- Step 6 — Done confirmation

### 4.6 Agent Access Screen

**File:** `client/src/pages/AgentAccess.tsx`

- List of AI agent keys with labels, connection types (API / NWC)
- Create new key: label, per-transaction limit, daily limit
- Create NWC connection: generates nostr+walletconnect:// URI
- Each key shows: label, type badge, enabled toggle, spending limits, copy API key/NWC URI
- Activity log per key
- Delete key option

---

## 5. Backend API Specification

**Base URL:** Express server on same host

### 5.1 Wallet Endpoints
```
GET    /api/wallet                    — Get or create wallet
POST   /api/wallet/reset              — Reset wallet (wipe onboarded/backup flags)
GET    /api/wallet/mnemonic           — Get 12-word seed phrase
PATCH  /api/wallet/settings           — Update settings (fiatCurrency, isFiatPrimary, isDarkMode, hideSquawks, hasBackedUp, onboarded)
```

### 5.2 Transaction Endpoints
```
GET    /api/transactions              — List all transactions (from Breez SDK + pending deposits)
PATCH  /api/transactions/:id/memo     — Update transaction memo
```

### 5.3 Breez SDK Endpoints
```
POST   /api/breez/init                — Initialize Breez SDK
GET    /api/breez/status              — Check if SDK is ready
GET    /api/breez/info                — Get wallet info (balance, pubkey, pending amounts)
GET    /api/breez/balance             — Get current balance
POST   /api/breez/invoice             — Create Lightning invoice (amountSats, description)
GET    /api/breez/bitcoin-address     — Generate on-chain Bitcoin address
POST   /api/breez/parse               — Parse Lightning input (invoice, LNURL, address)
POST   /api/breez/prepare-send        — Prepare a payment (paymentRequest, amountSats)
POST   /api/breez/send                — Execute prepared payment
POST   /api/breez/prepare-lnurl-pay   — Prepare LNURL payment (address, amountSats, comment)
POST   /api/breez/lnurl-pay           — Execute prepared LNURL payment
GET    /api/breez/lightning-address    — Get/ensure Lightning address
POST   /api/breez/register-lightning-address — Register new username (username)
GET    /api/breez/new-payments        — Poll for new incoming payments
GET    /api/breez/diagnose-deposit    — Diagnose on-chain deposit issues
POST   /api/breez/claim-deposit       — Claim an on-chain deposit
POST   /api/breez/refund-deposit      — Refund an on-chain deposit
GET    /api/breez/pending-deposits    — List unclaimed on-chain deposits
GET    /api/breez/payments            — List raw payments from SDK
```

### 5.4 Agent Key Management Endpoints (Settings UI)
```
POST   /api/agent/keys                — Create API key
POST   /api/agent/nwc                 — Create NWC connection
GET    /api/agent/keys                — List all keys (masked)
PATCH  /api/agent/keys/:id            — Update key settings
DELETE /api/agent/keys/:id            — Delete key
GET    /api/agent/keys/:id/logs       — Get activity logs for key
```

### 5.5 Agent API (External, Bearer token auth)
```
GET    /api/v1/agent/balance          — Get balance
GET    /api/v1/agent/info             — Get wallet info + spending limits
POST   /api/v1/agent/invoice          — Create invoice
POST   /api/v1/agent/pay              — Pay invoice or Lightning address (with spend limit checks)
GET    /api/v1/agent/transactions     — List transactions
GET    /api/v1/agent/address          — Get Lightning address
```

---

## 6. Database Schema

**PostgreSQL with Drizzle ORM**

### wallets
| Column | Type | Default |
|--------|------|---------|
| id | varchar (PK) | gen_random_uuid() |
| balance | integer | 0 |
| paymentAddress | text | "captain@buccaneer.sats" |
| fiatCurrency | text | "USD" |
| isFiatPrimary | boolean | false |
| isDarkMode | boolean | true |
| hideSquawks | boolean | false |
| hasBackedUp | boolean | false |
| onboarded | boolean | false |
| createdAt | timestamp | now() |

### transactions
| Column | Type | Default |
|--------|------|---------|
| id | varchar (PK) | gen_random_uuid() |
| walletId | varchar | required |
| type | text | required ("receive" or "send") |
| amount | integer | required |
| memo | text | "" |
| status | text | "completed" |
| paymentHash | text | nullable |
| fees | integer | 0 |
| createdAt | timestamp | now() |

### transaction_memos
| Column | Type |
|--------|------|
| txId | varchar (PK) |
| memo | text |

### agent_keys
| Column | Type | Default |
|--------|------|---------|
| id | varchar (PK) | gen_random_uuid() |
| walletId | varchar | required |
| apiKey | text | required |
| label | text | "My Agent" |
| maxPerTx | integer | 1000 |
| maxDaily | integer | 10000 |
| spentToday | integer | 0 |
| spentDate | text | nullable |
| enabled | boolean | true |
| connectionType | text | "api" |
| nwcClientSecret | text | nullable |
| nwcClientPubkey | text | nullable |
| createdAt | timestamp | now() |

### agent_logs
| Column | Type | Default |
|--------|------|---------|
| id | varchar (PK) | gen_random_uuid() |
| keyId | varchar | required |
| action | text | required |
| amount | integer | nullable |
| status | text | "success" |
| detail | text | nullable |
| createdAt | timestamp | now() |

---

## 7. Breez SDK Integration

**File:** `server/breez.ts`

- Uses `@nicepayments/breez-sdk-spark` npm package
- Initialized with `BREEZ_API_KEY` and `WALLET_MNEMONIC` environment secrets
- Event listener handles: `paymentSucceeded` (incoming), `unclaimedDeposits`, `claimedDeposits`
- Auto-claims on-chain deposits when detected
- Pending incoming payments stored in memory, polled by frontend via `/api/breez/new-payments`
- All BigInt values sanitized before JSON serialization

---

## 8. NWC (Nostr Wallet Connect) Integration

**File:** `server/nwc.ts`

- Service keypair derived from WALLET_MNEMONIC via SHA-256
- Relay: `wss://relay.damus.io`
- NIP-47 supported methods: `get_info`, `get_balance`, `pay_invoice`, `make_invoice`, `list_transactions`
- Each NWC request authenticated against `agent_keys` table by client pubkey
- Spend limits enforced per-transaction and daily
- Connection URI format: `nostr+walletconnect://{servicePubkey}?relay={relay}&secret={clientSecret}`

---

## 9. Environment Secrets Required

| Secret | Purpose |
|--------|---------|
| BREEZ_API_KEY | Breez SDK authentication |
| WALLET_MNEMONIC | 12-word BIP39 mnemonic for wallet |
| DATABASE_URL | PostgreSQL connection string |

---

## 10. Key Behaviors

1. **Balance polling**: Frontend polls `/api/breez/balance` and `/api/breez/new-payments` regularly
2. **Pending deposits**: When detected, transaction list polls every 15 seconds
3. **Celebration**: Incoming payment triggers full-screen celebration overlay with sound
4. **Balance hide/show**: Persisted in localStorage (`pirate-wallet-hide-balance`)
5. **Onboarding gate**: If wallet not onboarded, all routes redirect to Onboarding
6. **Backup reminder**: If not backed up, orange "Backup!" badge shown on Home header
7. **Transaction memos**: Editable inline in transaction detail, saved to separate `transaction_memos` table
8. **Dark mode default**: `isDarkMode: true` by default — Midnight Mode is the default experience

---

## 11. Assets

**Logo** (stored in `attached_assets/`, imported via `@assets/` alias):
- `buc_3_1773366690786.png` — Main logo (moonlit galleon ship). Import: `import shipImg from "@assets/buc_3_1773366690786.png"`

**Images** (in `client/src/assets/images/`):
- `treasure-chest.png` — Used in receive celebration overlay
- `onboarding-lightning.png` — Lightning bolt for onboarding features row
- `onboarding-ship.png` — Ship image (alternative)
- `map-coordinates.png` — Treasure map (referenced but inline SVG used instead now in BackupFlow)
- `onboarding-shield.png` — Shield for backup
- `empty-chest.png` — Empty state illustration
- `parrot-mast.png`, `parrot-scroll.png` — Parrot illustrations
- `receive-pirate.png` — Pirate illustration for receive
- `sea-plane.png` — Sea illustration
- `qr-code.png` — QR code placeholder

**Sound files** (in `public/sounds/`):
- `were_rich.m4a` — Receive payment celebration
- `small_cannon.mp3` — Send payment confirmation
- `fiat_maxi.m4a` — Fiat display toggle

---

## 12. Route Map

```
/                     -> Home.tsx (main wallet screen)
/settings             -> Settings.tsx (Captain's Quarters)
/backup               -> BackupFlow.tsx (seed phrase backup)
/send                 -> SendFlow.tsx (send payment flow)
/agent-access         -> AgentAccess.tsx (AI agent key management)
/onboarding-preview   -> Onboarding.tsx (dev preview, can be removed)
```

Onboarding gate: If `wallet.onboarded === false`, all routes show `Onboarding.tsx` instead.

---

## 13. Security Notes

- This is a **single-user personal wallet**. There is no multi-user authentication system.
- All internal API endpoints (`/api/wallet/*`, `/api/breez/*`, `/api/agent/keys`) are trusted — they assume the caller is the wallet owner (no auth middleware).
- The **Agent API** (`/api/v1/agent/*`) is the only externally-authenticated surface, using Bearer token auth (`buc_...` API keys) with per-transaction and daily spend limits.
- The NWC service authenticates requests by matching Nostr pubkeys against registered `agent_keys` in the database.
- Seed phrase (`/api/wallet/mnemonic`) is served without auth — this endpoint should only be accessible from the local app UI.
- Wallet deletion wipes onboarded/backup flags but does NOT destroy the underlying Breez SDK wallet or mnemonic.
