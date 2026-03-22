import './_group.css';

const C = {
  bg: "#FBF7F1",
  bgCard: "#FFFFFF",
  bgElevated: "#F2ECE3",
  border: "#E8E0D4",
  text: "#1C1C1E",
  textSecondary: "#636366",
  textMuted: "#8E8E93",
  gold: "#E8A820",
  goldBright: "#F0BD40",
  teal: "#17A2B8",
  tealDark: "#11808E",
  coral: "#F06C35",
  coralDark: "#D05828",
  receiveIconBg: "#E0F0F4",
  sendIconBg: "#FCE4D8",
  receiveBtnText: "#11808E",
  sendBtnText: "#D05828",
  txPanelBg: "#FFFFFF",
};

export function CreamCoral() {
  return (
    <div style={{
      width: 390, height: 844, background: C.bg, fontFamily: "'Nunito', sans-serif",
      display: "flex", flexDirection: "column", position: "relative", overflow: "hidden",
    }}>
      <div style={{ padding: "54px 20px 0", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 20, background: C.bgCard,
            border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 40, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center" }}>
            <span style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 36, color: C.text }}>₿</span>
            <span style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 72, color: C.text, letterSpacing: -2 }}>15,673</span>
          </div>
          <p style={{ color: C.textMuted, fontSize: 16, fontWeight: 400, marginTop: 2 }}>≈ $10.78 USD</p>
        </div>

        <div style={{ display: "flex", gap: 16, padding: "24px 0", justifyContent: "center" }}>
          <div style={{
            flex: 1, background: C.receiveIconBg, borderRadius: 24, padding: "18px 0",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 26, background: "rgba(23,162,184,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.tealDark} strokeWidth="2.5"><line x1="19" y1="5" x2="5" y2="19"/><polyline points="5 5 5 19 19 19" fill="none"/></svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 18, color: C.receiveBtnText }}>Receive</span>
          </div>
          <div style={{
            flex: 1, background: C.sendIconBg, borderRadius: 24, padding: "18px 0",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 26, background: "rgba(240,108,53,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.coralDark} strokeWidth="2.5"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="19 19 19 5 5 5" fill="none"/></svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 18, color: C.sendBtnText }}>Send</span>
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: C.txPanelBg, borderTopLeftRadius: 40, borderTopRightRadius: 40,
        padding: "24px 24px 40px", borderTop: `1px solid ${C.border}40`,
        boxShadow: "0 -8px 30px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.textSecondary} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span style={{ fontWeight: 700, fontSize: 18, color: C.textSecondary, flex: 1 }}>Transaction Log</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>
        </div>
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <p style={{ color: C.textSecondary, fontWeight: 700, fontSize: 15 }}>No transactions yet</p>
          <p style={{ color: C.textMuted, fontSize: 13, marginTop: 2 }}>Your voyage log is empty</p>
        </div>
      </div>

      <div style={{
        position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)",
        background: C.coralDark, color: "#FFF", fontSize: 9, fontWeight: 700,
        padding: "2px 10px", borderRadius: 8, letterSpacing: 0.5,
      }}>D: CREAM &amp; CORAL</div>
    </div>
  );
}
