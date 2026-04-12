# Bellamy APNs setup — step-by-step (for non-developers)

This guide walks you through **everything** you need to do once so Bellamy can send **silent push notifications** to iPhones. Those wakes let the wallet run in the background when an AI agent asks to pay—without the user opening the app.

**You are not doing anything wrong if this feels fiddly.** Apple designed it this way. Follow the steps in order.

---

## Read this first (30 seconds)


| What                       | Who                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| **You (Bellamy operator)** | Create a key on Apple’s website, copy a few IDs, put them in your **server’s** configuration.             |
| **Your app users**         | They never upload `.p8` files or Team IDs. They only tap “Allow” when the phone asks about notifications. |


**Important:** The `.p8` file is a **secret**—like a password. Do **not** put it inside your GitHub repo. Do **not** paste it in Discord or email. This repo’s `.gitignore` ignores `*.p8` files to reduce accidents, but you should still treat the key carefully.

---

## Before you start — checklist

1. You have an **Apple Developer Program** membership (paid account).
2. You know your **Apple ID** password and can sign in at [developer.apple.com](https://developer.apple.com).
3. You have access to wherever your **Bellamy API server** runs (for example **Railway**, **Fly.io**, a VPS, or your Mac for local testing).

You do **not** need to change anything in Xcode for this particular server-side push setup.

---

## Part 1 — Create the APNs key in Apple’s portal

Do this in a desktop browser (Safari or Chrome on Mac is fine).

### Step 1 — Open the right place

1. Go to **[https://developer.apple.com/account](https://developer.apple.com)**.
2. Sign in with the Apple ID that owns your team.
3. In the left sidebar (or top navigation), open **Certificates, Identifiers & Profiles**.

### Step 2 — Open the Keys section

1. Click **Keys** in the left sidebar (under “Certificates, Identifiers & Profiles”).
2. You’ll see a list of existing keys (maybe empty).

### Step 3 — Create a new key

1. Click the **blue plus (+)** button next to “Keys” (or a button that says **Register a New Key**).
2. **Key Name:** type something you’ll recognize later, e.g. `Bellamy Push Production`.
3. Scroll down to **Enable** services and check **Apple Push Notifications service (APNs)**.
  - You do **not** need to check “DeviceCheck” or “Sign In with Apple” for this—only **APNs** unless you know you need something else.
4. Click **Continue**, then **Register**.

### Step 4 — Download the key file (you only get one chance)

1. On the confirmation screen, Apple shows:
  - **Key ID** — a 10-character code (letters and numbers). **Copy it** into a note or password manager.
  - A **Download** button for a file named like `**AuthKey_XXXXXXXXXX.p8`** (the `X`s match your Key ID).
2. Click **Download** and save the file somewhere **safe and memorable**, for example:
  - `Documents/Bellamy-secrets/AuthKey_XXXXXXXXXX.p8`
  - Or your password manager’s “file attachments” if it supports that
3. **You cannot download this same file again from Apple.** If you lose it, you must create a **new** key and update your server with the new Key ID and file.

### Step 5 — Find your Team ID

1. Still on [developer.apple.com/account](https://developer.apple.com/account), open **Membership details** (wording may vary: “Membership” or your name in the sidebar).
2. Find **Team ID** — a **10-character** string (letters and numbers). **Copy it** next to your Key ID.

You now have three things to keep:


| Thing          | What it looks like               | Where it came from    |
| -------------- | -------------------------------- | --------------------- |
| **Key ID**     | 10 characters, e.g. `AB12CD34EF` | Keys → your new key   |
| **Team ID**    | 10 characters                    | Membership details    |
| `**.p8` file** | `AuthKey_AB12CD34EF.p8`          | The one-time download |


---

## Part 2 — Is this the same as my App Store Connect key?

**Usually no.** Many projects have a separate **App Store Connect API** key (also a `.p8`) used for uploading builds. **Push notifications use a different key** created under **Certificates, Identifiers & Profiles → Keys** with **APNs** enabled, as above.

If you already created an APNs key correctly, you can reuse **that** `.p8` + Key ID + Team ID—you do not need two APNs keys unless you want separate keys per environment (rare for a solo project).

---

## Part 3 — Where to put the key (choose one approach)

**Never commit the `.p8` to Git.** Pick **one** of these.

### Option A — Hosted server (Railway, Fly, etc.) — recommended for production

The server does not need the file on disk if you pass the key as **base64** in an environment variable.

**On your Mac** (Terminal app):

1. Put your downloaded file somewhere easy, e.g. Desktop: `AuthKey_XXXXXXXXXX.p8`.
2. Run (replace the path with your real file path). This copies **one continuous line** (no line breaks—important for pasting into Railway):
  ```bash
   openssl base64 -A -in ~/Desktop/AuthKey_XXXXXXXXXX.p8 | pbcopy
  ```
   If `openssl` is not available, try:
3. In Railway (or your host), open your **Bellamy API** service → **Variables** (or **Secrets**).
4. Add:
  - `APNS_KEY_BASE64` = paste that long line (one line, no spaces).
  - `APNS_KEY_ID` = your 10-character Key ID.
  - `APNS_TEAM_ID` = your 10-character Team ID.
  - `APNS_BUNDLE_ID` = `buccaneerwallet` (unless you changed `ios.bundleIdentifier` in the mobile `app.json`).
  - `APNS_ENVIRONMENT` = `production` for TestFlight / App Store builds (default).
5. **Redeploy** the API server so it picks up the new variables.

You can **delete** the local copy from Desktop after the variable is saved, or keep it in a password manager.

### Option B — Local development on your Mac (path to the file)

1. Create a folder **outside** the project if you like, e.g. `~/Documents/Bellamy-secrets/`, and move the `.p8` there.
2. Open `**artifacts/api-server/.env`** (create it if missing; it is **gitignored** and will not be committed).
3. Add lines like:
  ```env
   APNS_KEY_ID=YOUR_KEY_ID_HERE
   APNS_TEAM_ID=YOUR_TEAM_ID_HERE
   APNS_KEY_PATH=/Users/YOUR_USERNAME/Documents/Bellamy-secrets/AuthKey_YOURKEYID.p8
   APNS_BUNDLE_ID=buccaneerwallet
   APNS_ENVIRONMENT=development
  ```
   Use the **real absolute path** to your `.p8`. Use `development` for debug/dev builds on a physical device; use `production` when testing a TestFlight build against a local server (must match how the device token was issued).
4. Start the API server as you normally do; it will read the key from disk.

**Do not** put the `.p8` inside the Git repo folder unless you’re comfortable—it’s safer outside the repo or only in a path you know is ignored.

### Option C — Docker / VPS with a file on the server

1. Copy the `.p8` to the server with `scp` or your host’s file upload, e.g. `/home/deploy/apns/AuthKey_XXX.p8`.
2. Set `APNS_KEY_PATH` to that **absolute path** in the server’s environment or Docker env file.
3. Ensure the process running Bellamy can **read** that file (permissions).

---

## Part 4 — Environment variables reference


| Variable           | Required?                 | What to put                                                                                              |
| ------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `APNS_KEY_ID`      | Yes                       | 10-character Key ID from Apple.                                                                          |
| `APNS_TEAM_ID`     | Yes                       | 10-character Team ID.                                                                                    |
| `APNS_KEY_PATH`    | One of path **or** base64 | Full path to `.p8` on the machine running the server.                                                    |
| `APNS_KEY_BASE64`  | One of path **or** base64 | Base64 of entire `.p8` contents (good for Railway).                                                      |
| `APNS_BUNDLE_ID`   | No                        | Defaults to `buccaneerwallet`. Must match the iOS app’s bundle ID.                                       |
| `APNS_ENVIRONMENT` | No                        | `production` (default) or `development`. Must match the **build type** that registered the device token. |


See also `artifacts/api-server/.env.example` for commented placeholders.

### Production vs development (short version)

- **TestFlight / App Store** → `APNS_ENVIRONMENT=production` (or omit; production is default).
- **Debug build from Xcode / dev client** on a phone → often `**development`**.

If this is wrong, Apple rejects the push and nothing obvious happens on the phone.

---

## Part 5 — Database note

After schema changes, run your usual database migration / `drizzle push` so `wallet_agent_identities` can store device push tokens. (Your developer workflow may already cover this.)

---

## Part 6 — How to know it’s working

1. Deploy the API with all required `APNS_`* variables.
2. Install the app on a **real iPhone** (not the Simulator for reliable push).
3. Complete onboarding, enable **Agent Access**, and tap **Allow** if iOS asks about notifications.
4. Background the app and trigger an agent payment. The flow should complete without opening the wallet.

Check API server logs for messages about silent push or APNs misconfiguration.

---

## Part 7 — What your customers experience

They **do not** visit Apple Developer or handle `.p8` files. They:

1. Install Bellamy and create a wallet.
2. Enable Agent Access and allow notifications when prompted (your in-app copy explains why).
3. Copy **one** NWC connection string to their AI tool.

---

## Security recap

- The `.p8` can send pushes to **your** apps under your team—guard it like a root password.
- Prefer `**APNS_KEY_BASE64`** in a host’s secret store over uploading the raw file to random servers.
- Never commit `.p8` files; this repo ignores `*.p8` to help prevent mistakes.

---

## iOS limitations (honest expectations)

- **App in background / screen off:** This is what silent push is for.
- **User force-quit the app** (removed from the app switcher): Apple may delay background work until the user opens the app again.

If something still fails after following this guide, double-check Key ID, Team ID, bundle ID, `APNS_ENVIRONMENT`, and that the server process can read the key (path) or the base64 variable is complete (one line, no line breaks).