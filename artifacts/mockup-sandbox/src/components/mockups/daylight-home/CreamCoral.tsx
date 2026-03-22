import './_group.css';

const C = {
  bg: "#F9F5EE",
  bgCard: "#FFFFFF",
  border: "#E6E1D7",
  text: "#1B1F2B",
  textSecondary: "#3B4050",
  textMuted: "#909298",
  tealDark: "#12757C",
  coralDark: "#C45824",
  receiveCardBg: "#E2EFF4",
  sendCardBg: "#FBDED6",
  receiveIconBg: "#C4DDE8",
  sendIconBg: "#F0C4B8",
  txPanelBg: "#FEFCFA",
  greenCheck: "#34C759",
  backupBg: "#FFF5E8",
  backupBorder: "#FDDAA4",
  backupText: "#D06C1C",
};

function SettingsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="1.8">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="2" x2="12" y2="5.5"/><line x1="12" y1="18.5" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="5.5" y2="12"/><line x1="18.5" y1="12" x2="22" y2="12"/>
      <line x1="4.93" y1="4.93" x2="7.4" y2="7.4"/><line x1="16.6" y1="16.6" x2="19.07" y2="19.07"/>
      <line x1="4.93" y1="19.07" x2="7.4" y2="16.6"/><line x1="16.6" y1="7.4" x2="19.07" y2="4.93"/>
    </svg>
  );
}

export function CreamCoral() {
  return (
    <div style={{
      width: 390, height: 844, background: C.bg, fontFamily: "'Nunito', sans-serif",
      display: "flex", flexDirection: "column", position: "relative", overflow: "hidden",
    }}>
      <div style={{ padding: "60px 24px 0", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 22, background: C.bgCard,
            border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}>
            <SettingsIcon />
          </div>
          <div style={{
            background: C.backupBg, border: `1.5px solid ${C.backupBorder}`,
            borderRadius: 20, padding: "6px 14px", display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.backupText} strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span style={{ fontWeight: 700, fontSize: 13, color: C.backupText, letterSpacing: 0.5 }}>BACKUP!</span>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 50, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 32, color: C.text, marginRight: 2 }}>₿</span>
            <span style={{ fontWeight: 800, fontSize: 64, color: C.text, letterSpacing: -2 }}>15,673</span>
          </div>
          <p style={{ color: C.textMuted, fontSize: 16, fontWeight: 400, marginTop: 4 }}>≈ NZ$17.24 NZD</p>
        </div>

        <div style={{ display: "flex", gap: 14, padding: "28px 0", justifyContent: "center" }}>
          <div style={{
            flex: 1, background: C.receiveCardBg, borderRadius: 22, padding: "22px 0",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 50, height: 50, borderRadius: 25, background: C.receiveIconBg,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.tealDark} strokeWidth="2.5" strokeLinecap="round"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="7 7 7 17 17 17"/></svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 17, color: C.tealDark }}>Receive</span>
          </div>
          <div style={{
            flex: 1, background: C.sendCardBg, borderRadius: 22, padding: "22px 0",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 50, height: 50, borderRadius: 25, background: C.sendIconBg,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.coralDark} strokeWidth="2.5" strokeLinecap="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="17 17 17 7 7 7"/></svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 17, color: C.coralDark }}>Send</span>
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: C.txPanelBg, borderTopLeftRadius: 36, borderTopRightRadius: 36,
        padding: "22px 24px 0",
        boxShadow: "0 -6px 24px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.textSecondary} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span style={{ fontWeight: 700, fontSize: 17, color: C.textSecondary, flex: 1 }}>Transaction Log</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: `1px solid ${C.border}40` }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: C.receiveCardBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.tealDark} strokeWidth="2.5"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="7 7 7 17 17 17"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 15, color: C.text, margin: 0 }}>Incoming payment</p>
            <p style={{ fontSize: 13, color: C.textMuted, margin: "2px 0 0" }}>Today, 11:17 AM</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontWeight: 700, fontSize: 15, color: C.tealDark, margin: 0 }}>+1,500 sats</p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={C.greenCheck} stroke="none"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10" fill="none" stroke="#FFF" strokeWidth="2"/></svg>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: `1px solid ${C.border}20` }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: C.receiveCardBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.tealDark} strokeWidth="2.5"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="7 7 7 17 17 17"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 15, color: C.text, margin: 0 }}>Buccaneer Wallet</p>
            <p style={{ fontSize: 13, color: C.textMuted, margin: "2px 0 0" }}>Today, 10:45 AM</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontWeight: 700, fontSize: 15, color: C.tealDark, margin: 0 }}>+1,000 sats</p>
          </div>
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
