export function SwatchCompare() {
  const swatches = [
    { label: "hsl(40,40%,96%)", hex: "#F5F0E8" },
    { label: "Current app", hex: "#F6F3ED" },
    { label: "Option", hex: "#F7F3EE" },
  ];

  return (
    <div style={{ display: "flex", gap: 0, fontFamily: "'Nunito', sans-serif", height: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700&display=swap" rel="stylesheet" />
      {swatches.map((s, i) => (
        <div key={i} style={{ flex: 1, background: s.hex, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRight: i < swatches.length - 1 ? "1px dashed #ccc" : "none" }}>
          <div style={{ width: 80, height: 80, borderRadius: 12, background: "#FFFFFF", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", marginBottom: 16 }} />
          <div style={{ fontWeight: 700, fontSize: 14, color: "#333" }}>{s.hex}</div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}
