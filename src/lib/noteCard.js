// The picture people see when a note is shared (WhatsApp, Telegram, X, Google): drawn from the note's own title, year and unit, so every
// note has a proper thumbnail even when its author added no picture. Used by api/note-card.js. Plain JavaScript with no browser or server
// code, so the serverless function and the tests can both import it.
import { MARK_DARK } from "./brandMark.js";

const clamp = (s, n) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…`; };
// the first whole sentence or two that fit: a card that stops mid-sentence looks careless
const sentences = (s, n) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); if (t.length <= n) return t; const cut = t.slice(0, n); const e = cut.lastIndexOf(". "); return e > 50 ? cut.slice(0, e + 1) : clamp(t, n); };
const el = (type, style, children) => ({ type, props: { style: { display: "flex", ...style }, children } });

/** An element tree in the shape satori draws (1200 x 630). input: { title, year, unit, kind, week } */
export function noteCardTree(input) {
  if (input.image) return pictureCardTree(input);
  const title = clamp(input.title || "Study notes", 120);
  const size = title.length > 90 ? 52 : title.length > 60 ? 60 : title.length > 36 ? 72 : 84;
  const chips = [input.year ? `Year ${String(input.year).replace(/\D/g, "")}` : "", input.unit ? clamp(input.unit, 34) : "", input.week ? clamp(input.week, 20) : ""].filter(Boolean);
  const chip = (t, gold = false) => el("div", { padding: "10px 22px", borderRadius: 999, fontSize: 28, fontWeight: 700, color: gold ? "#0b2545" : "#e6f4f1", background: gold ? "#f2b632" : "rgba(255,255,255,0.14)", marginRight: 14 }, t);
  return el("div", { width: 1200, height: 630, boxSizing: "border-box", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", color: "white", background: "linear-gradient(135deg, #0b2545 0%, #0f4c5c 55%, #0f766e 100%)", fontFamily: "sans-serif" }, [
    el("div", { alignItems: "center" }, [
      { type: "img", props: { src: MARK_DARK, width: 42, height: 56, style: { marginRight: 16 } } },
      el("div", { fontSize: 32, fontWeight: 700, letterSpacing: 2, color: "#bfe3dd" }, "OMPATH STUDY"),
      input.kind ? el("div", { marginLeft: 24, padding: "6px 18px", borderRadius: 999, border: "2px solid #f2b632", color: "#f2b632", fontSize: 24, fontWeight: 700 }, String(input.kind).toUpperCase()) : el("div", {}, ""),
    ]),
    el("div", { fontSize: size, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1 }, title),
    el("div", { flexDirection: "column" }, [
      el("div", { flexWrap: "wrap", marginBottom: 22 }, chips.map((c, i) => chip(c, i === 0 && Boolean(input.year)))),
      el("div", { fontSize: 26, color: "#bfe3dd" }, "ompathstudy.com  ·  Notes, MCQs and topic pages for medical students"),
    ]),
  ]);
}

/** The same card with the subject's own picture on the right and the site's name along the bottom: for topics, where a picture says it faster. */
function pictureCardTree(input) {
  const title = clamp(input.title || "Study notes", 80);
  const size = input.blurb ? (title.length > 40 ? 52 : title.length > 22 ? 62 : 74) : (title.length > 50 ? 56 : title.length > 28 ? 68 : 84);
  const chips = [input.year ? `Year ${String(input.year).replace(/\D/g, "")}` : "", input.unit ? clamp(input.unit, 26) : ""].filter(Boolean);
  const chip = (t, gold = false) => el("div", { padding: "9px 20px", borderRadius: 999, fontSize: 26, fontWeight: 700, color: gold ? "#0b2545" : "#e6f4f1", background: gold ? "#f2b632" : "rgba(255,255,255,0.14)", marginRight: 12, marginBottom: 12 }, t);
  return el("div", { width: 1200, height: 630, flexDirection: "row", color: "white", background: "linear-gradient(135deg, #0b2545 0%, #0f4c5c 55%, #0f766e 100%)", fontFamily: "sans-serif" }, [
    el("div", { width: 700, height: 630, boxSizing: "border-box", flexDirection: "column", justifyContent: "space-between", padding: "56px 40px 0 64px" }, [
      el("div", { flexDirection: "column" }, [
        el("div", { alignItems: "center", marginBottom: 34 }, [
          { type: "img", props: { src: MARK_DARK, width: 36, height: 48, style: { marginRight: 14 } } },
          el("div", { fontSize: 28, fontWeight: 700, letterSpacing: 2, color: "#bfe3dd" }, "OMPATH STUDY"),
          input.kind ? el("div", { marginLeft: 20, padding: "5px 16px", borderRadius: 999, border: "2px solid #f2b632", color: "#f2b632", fontSize: 22, fontWeight: 700 }, String(input.kind).toUpperCase()) : el("div", {}, ""),
        ]),
        el("div", { fontSize: size, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }, title),
        input.blurb ? el("div", { marginTop: 26, fontSize: 30, lineHeight: 1.3, fontWeight: 700, color: "#cfe8e4" }, sentences(input.blurb, 175)) : el("div", {}, ""),
      ]),
      el("div", { flexDirection: "column" }, [
        el("div", { flexWrap: "wrap" }, chips.map((c, i) => chip(c, i === 0 && Boolean(input.year)))),
        el("div", { width: 660, height: 88, alignItems: "center", fontSize: 30, fontWeight: 700, color: "#e6f4f1" }, "ompathstudy.com"),
      ]),
    ]),
    el("div", { width: 500, height: 630, padding: 26, boxSizing: "border-box", alignItems: "center", justifyContent: "center" }, [
      el("div", { width: 448, height: 578, borderRadius: 28, background: "white", alignItems: "center", justifyContent: "center", overflow: "hidden" }, [
        { type: "img", props: { src: input.image, width: 448, height: 578, style: { objectFit: "contain" } } },
      ]),
    ]),
  ]);
}
