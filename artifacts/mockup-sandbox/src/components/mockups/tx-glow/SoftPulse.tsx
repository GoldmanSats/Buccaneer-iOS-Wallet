import './_group.css';

const DARK = {
  bg: "#0B1426",
  bgCard: "#151f35",
  border: "#1E2D50",
  text: "#FFFFFF",
  textSecondary: "#8FA3C8",
  textMuted: "#4A6080",
  teal: "#17A2B8",
  coral: "#E86A33",
  green: "#22C55E",
};

const LIGHT = {
  bg: "#F8F4ED",
  bgCard: "#FFFFFF",
  border: "#DDD8CE",
  text: "#1A1E2C",
  textSecondary: "#3A3F4E",
  textMuted: "#8A8E9A",
  tealDark: "#0D6E7D",
  coralDark: "#B54215",
  green: "#16A34A",
  receiveCardBg: "#DCEEF3",
};

export function SoftPulse() {
  return (
    <div style={{ width: 390, height: 500, fontFamily: "'Nunito', sans-serif", display: "flex", flexDirection: "column", gap: 20, padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#666", textAlign: "center", letterSpacing: 1, textTransform: "uppercase" }}>
        Option A: Soft Background Pulse
      </div>
      <div style={{ fontSize: 11, color: "#999", textAlign: "center", marginTop: -16 }}>
        Entire row background glows and fades out over ~2 seconds
      </div>

      <div style={{ borderRadius: 20, overflow: "hidden", background: DARK.bgCard, padding: "16px 16px 8px", border: `1px solid ${DARK.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: DARK.textMuted, marginBottom: 10, letterSpacing: 0.5 }}>DARK MODE — RECEIVE</div>
        
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14,
          background: `rgba(23, 162, 184, 0.15)`,
          boxShadow: `0 0 20px rgba(23, 162, 184, 0.12)`,
          animation: "pulseReceiveDark 2s ease-out forwards",
        }}>
          <div style={{ width: 38, height: 38, borderRadius: 19, background: "rgba(23,162,184,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={DARK.teal} strokeWidth="2.5"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="7 7 7 17 17 17"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: DARK.text }}>Incoming payment</div>
            <div style={{ fontSize: 12, color: DARK.textMuted, marginTop: 1 }}>Just now</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: DARK.teal }}>+1,500 sats</div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={DARK.green} stroke="none"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10" fill="none" stroke="#FFF" strokeWidth="2.5"/></svg>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", marginTop: 4, opacity: 0.6 }}>
          <div style={{ width: 38, height: 38, borderRadius: 19, background: "rgba(23,162,184,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={DARK.teal} strokeWidth="2.5"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="7 7 7 17 17 17"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: DARK.text }}>Earlier payment</div>
            <div style={{ fontSize: 12, color: DARK.textMuted, marginTop: 1 }}>Today, 10:45 AM</div>
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, color: DARK.teal }}>+1,000 sats</div>
        </div>
      </div>

      <div style={{ borderRadius: 20, overflow: "hidden", background: LIGHT.bgCard, padding: "16px 16px 8px", border: `1px solid ${LIGHT.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: LIGHT.textMuted, marginBottom: 10, letterSpacing: 0.5 }}>LIGHT MODE — RECEIVE</div>
        
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14,
          background: `rgba(13, 110, 125, 0.10)`,
          boxShadow: `0 0 16px rgba(13, 110, 125, 0.08)`,
          animation: "pulseReceiveLight 2s ease-out forwards",
        }}>
          <div style={{ width: 38, height: 38, borderRadius: 19, background: LIGHT.receiveCardBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={LIGHT.tealDark} strokeWidth="2.5"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="7 7 7 17 17 17"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: LIGHT.text }}>Incoming payment</div>
            <div style={{ fontSize: 12, color: LIGHT.textMuted, marginTop: 1 }}>Just now</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: LIGHT.tealDark }}>+1,500 sats</div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={LIGHT.green} stroke="none"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10" fill="none" stroke="#FFF" strokeWidth="2.5"/></svg>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", marginTop: 4, opacity: 0.6 }}>
          <div style={{ width: 38, height: 38, borderRadius: 19, background: LIGHT.receiveCardBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={LIGHT.tealDark} strokeWidth="2.5"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="7 7 7 17 17 17"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: LIGHT.text }}>Earlier payment</div>
            <div style={{ fontSize: 12, color: LIGHT.textMuted, marginTop: 1 }}>Today, 10:45 AM</div>
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, color: LIGHT.tealDark }}>+1,000 sats</div>
        </div>
      </div>

      <style>{`
        @keyframes pulseReceiveDark {
          0% { background: rgba(23,162,184,0.25); box-shadow: 0 0 24px rgba(23,162,184,0.20); }
          50% { background: rgba(23,162,184,0.12); box-shadow: 0 0 12px rgba(23,162,184,0.10); }
          100% { background: transparent; box-shadow: none; }
        }
        @keyframes pulseReceiveLight {
          0% { background: rgba(13,110,125,0.15); box-shadow: 0 0 20px rgba(13,110,125,0.10); }
          50% { background: rgba(13,110,125,0.06); box-shadow: 0 0 8px rgba(13,110,125,0.04); }
          100% { background: transparent; box-shadow: none; }
        }
      `}</style>
    </div>
  );
}
