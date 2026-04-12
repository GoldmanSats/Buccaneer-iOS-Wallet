type PairOwnerDeviceOptions = {
  baseUrl: string;
  publicKey: string;
  label: string;
  token: string;
};

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const exact = process.argv.find((arg) => arg.startsWith(prefix));
  if (exact) return exact.slice(prefix.length);

  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function usage(): string {
  return [
    "Usage:",
    "  pnpm --filter @workspace/scripts pair-owner-device --base-url https://example.com --public-key <hex> --label \"Kirk's iPhone\"",
    "",
    "Environment:",
    "  WALLET_OWNER_TOKEN or X_WALLET_OWNER must be set to the private bootstrap token.",
    "  BELLAMY_API_BASE can be used instead of --base-url.",
  ].join("\n");
}

function getOptions(): PairOwnerDeviceOptions {
  const baseUrl = readArg("base-url") ?? process.env.BELLAMY_API_BASE ?? "";
  const publicKey = (readArg("public-key") ?? "").trim().toLowerCase();
  const label = (readArg("label") ?? "").trim();
  const token = process.env.WALLET_OWNER_TOKEN ?? process.env.X_WALLET_OWNER ?? "";

  if (!baseUrl || !publicKey || !label || !token) {
    throw new Error(usage());
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    publicKey,
    label,
    token,
  };
}

async function main() {
  const options = getOptions();
  const res = await fetch(`${options.baseUrl}/api/owner-auth/bootstrap/device`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Wallet-Owner": options.token,
    },
    body: JSON.stringify({
      publicKey: options.publicKey,
      label: options.label,
    }),
  });

  const body = await res.json().catch(() => null) as { message?: string } | null;
  if (!res.ok) {
    const message =
      typeof body?.message === "string" && body.message.trim()
        ? body.message
        : `Pairing failed with status ${res.status}`;
    throw new Error(message);
  }

  console.log("Owner device paired successfully.");
  console.log(JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
