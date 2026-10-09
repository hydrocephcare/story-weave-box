// The picture people see when a note is shared (WhatsApp, Telegram, X, Google): drawn from the note's own title, year and unit, so every
// note has a proper thumbnail even when its author added no picture. Used by api/note-card.js. Plain JavaScript with no browser or server
// code, so the serverless function and the tests can both import it.

const clamp = (s, n) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…`; };
const el = (type, style, children) => ({ type, props: { style: { display: "flex", ...style }, children } });

/** An element tree in the shape satori draws (1200 x 630). input: { title, year, unit, kind, week } */
export function noteCardTree(input) {
  const title = clamp(input.title || "Study notes", 120);
  const size = title.length > 90 ? 52 : title.length > 60 ? 60 : title.length > 36 ? 72 : 84;
  const chips = [input.year ? `Year ${String(input.year).replace(/\D/g, "")}` : "", input.unit ? clamp(input.unit, 34) : "", input.week ? clamp(input.week, 20) : ""].filter(Boolean);
  const chip = (t, gold = false) => el("div", { padding: "10px 22px", borderRadius: 999, fontSize: 28, fontWeight: 700, color: gold ? "#0b2545" : "#e6f4f1", background: gold ? "#f2b632" : "rgba(255,255,255,0.14)", marginRight: 14 }, t);
  return el("div", { width: 1200, height: 630, boxSizing: "border-box", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", color: "white", background: "linear-gradient(135deg, #0b2545 0%, #0f4c5c 55%, #0f766e 100%)", fontFamily: "sans-serif" }, [
    el("div", { alignItems: "center" }, [
      el("div", { width: 18, height: 18, borderRadius: 18, background: "#f2b632", marginRight: 16 }),
      el("div", { fontSize: 32, fontWeight: 700, letterSpacing: 2, color: "#bfe3dd" }, "OMPATH STUDY"),
      input.kind ? el("div", { marginLeft: 24, padding: "6px 18px", borderRadius: 999, border: "2px solid #f2b632", color: "#f2b632", fontSize: 24, fontWeight: 700 }, String(input.kind).toUpperCase()) : el("div", {}, ""),
    ]),
    el("div", { fontSize: size, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1 }, title),
    el("div", { flexDirection: "column" }, [
      el("div", { flexWrap: "wrap", marginBottom: 22 }, chips.map((c, i) => chip(c, i === 0 && Boolean(input.year)))),
      el("div", { fontSize: 26, color: "#bfe3dd" }, "ompathstudy.com  ·  Notes, MCQs and essays for MBChB"),
    ]),
  ]);
}
