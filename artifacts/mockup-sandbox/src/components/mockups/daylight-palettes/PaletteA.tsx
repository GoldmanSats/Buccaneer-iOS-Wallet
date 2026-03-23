export function PaletteA() {
  const bg = "#F5F0E8";
  const card = "#FFFFFF";
  const receiveBtn = "#D6EBF2";
  const receiveBtnIcon = "#5BA3C0";
  const sendBtn = "#F5D6CC";
  const sendBtnIcon = "#D4826A";
  const txLogBg = "#FFFFFF";
  const txSent = "#E8B4A0";
  const heading = "#1A2B3D";
  const muted = "#7A8A9C";
  const amount = "#C45D3E";
  const green = "#22C55E";

  return (
    <div style={{ width: 320, minHeight: 620, background: bg, borderRadius: 32, padding: 24, fontFamily: "'Nunito', sans-serif", position: "relative", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700&family=Chewy&display=swap" rel="stylesheet" />
      <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,0.06)", borderRadius: 8, padding: "4px 6px", fontSize: 10, color: "#888", fontWeight: 700 }}>A — Warm Whisper</div>

      <div style={{ marginTop: 32, textAlign: "center" }}>
        <div style={{ fontFamily: "'Chewy', cursive", fontSize: 48, color: heading, letterSpacing: -1 }}>₿11,053</div>
        <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>≈ NZ$12.16 NZD</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
        <div style={{ flex: 1, background: receiveBtn, borderRadius: 16, padding: 20, textAlign: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: receiveBtnIcon, margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 20 }}>↙</span>
          </div>
          <div style={{ fontWeight: 700, color: heading, fontSize: 14 }}>Receive</div>
        </div>
        <div style={{ flex: 1, background: sendBtn, borderRadius: 16, padding: 20, textAlign: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: sendBtnIcon, margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 20 }}>↗</span>
          </div>
          <div style={{ fontWeight: 700, color: heading, fontSize: 14 }}>Send</div>
        </div>
      </div>

      <div style={{ background: txLogBg, borderRadius: 20, marginTop: 28, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: heading, marginBottom: 16 }}>⏱ Transaction Log</div>
        {[{ label: "Sent payment", time: "Yesterday, 11:37 PM", amt: "-100 sats", fee: "3" },
          { label: "Sent payment", time: "Mar 20, 4:12 PM", amt: "-5,000 sats", fee: "8" }].map((tx, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i > 0 ? "1px solid #F0EDE6" : "none" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: txSent, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: sendBtnIcon, fontSize: 14, fontWeight: 700 }}>↗</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: heading }}>{tx.label}</div>
              <div style={{ fontSize: 11, color: muted }}>{tx.time}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: amount }}>{tx.amt}</div>
              <div style={{ fontSize: 10, color: muted }}>Fee: {tx.fee} <span style={{ color: green }}>✓</span></div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        {[{ label: "BG", color: bg }, { label: "Card", color: card }, { label: "Recv", color: receiveBtn }, { label: "Send", color: sendBtn }, { label: "TxIcon", color: txSent }].map((c, i) => (
          <div key={i} style={{ textAlign: "center", flex: 1 }}>
            <div style={{ width: "100%", height: 24, borderRadius: 6, background: c.color, border: "1px solid #ddd" }} />
            <div style={{ fontSize: 9, color: muted, marginTop: 3 }}>{c.label}</div>
            <div style={{ fontSize: 8, color: "#aaa" }}>{c.color}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
