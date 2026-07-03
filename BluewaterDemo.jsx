import React, { useState } from "react";

// ============== BLUEWATER PRODUCTION TRACKER — TEAM DEMO ==============
// Interactive Ops (computer) view + static TV and Mobile previews.
// Demo data lives in component state — changes are session-only (not saved/shared).

const NAVY = "#173A5E";
const NAVY_DK = "#0F2E4D";
const SPLASH = "#2E92D6";
const STEEL = "#A9C3D4";

// ---------- Status definitions per tracker ----------
const LAM_STATUS = {
  MU: { t: "Mold Unavailable", bg: "#EEF0F2", fg: "#5F6B73", tv: "#7E8B93" },
  MO: { t: "Mold Open", bg: "#CFD8DE", fg: "#33424C", tv: "#4A5A66" },
  IP: { t: "In Progress", bg: "#FCEBEB", fg: "#A32D2D", tv: "#D8443F" },
  CM: { t: "Complete/On Mold", bg: "#FAEEDA", fg: "#854F0B", tv: "#E89A2B" },
  PU: { t: "Pulled", bg: "#EAF3DE", fg: "#3B6D11", tv: "#5C9A2E" },
  NA: { t: "Not Applicable", bg: "#E4E4E7", fg: "#9A9A9F", tv: "#2A4258" },
};
const LAM_ORDER = ["MU", "MO", "IP", "CM", "PU"];

const FIN_STATUS = {
  NA: { t: "Not Available", bg: "#E4E4E7", fg: "#9A9A9F", tv: "#7E8B93" },
  NS: { t: "Not Started", bg: "#FCEBEB", fg: "#A32D2D", tv: "#D8443F" },
  IP: { t: "In Progress", bg: "#FAEEDA", fg: "#854F0B", tv: "#E89A2B" },
  CO: { t: "Complete", bg: "#EAF3DE", fg: "#3B6D11", tv: "#5C9A2E" },
};
const FIN_ORDER = ["NA", "NS", "IP", "CO"];

const KP_STATUS = {
  NO: { t: "Not Ordered", bg: "#F1EFE8", fg: "#5F5E5A", tv: "#7E8B93" },
  OR: { t: "Ordered", bg: "#FAEEDA", fg: "#854F0B", tv: "#E89A2B" },
  RE: { t: "Received", bg: "#EAF3DE", fg: "#3B6D11", tv: "#5C9A2E" },
};
const KP_ORDER = ["NO", "OR", "RE"];

const LAM_TASKS = ["Glass","Hull","Transducer","T Top","Liner","Ring","Baitwell","Leaning Post","Console","Console Face","Hatches","Boxes","Grid"];
const FIN_TASKS = ["Hull","Liner","Ring","Hard Top","Console","Console Face","Hatches","Leaning Post","Buckets","Other"];
const KP_PARTS = ["Coosa Kit","Gelcoat","Motors","Ride","Bracket","New Wire","Upholstery","Wallabys Tanks","Wallabys Other","Poly Parts Teak","Poly Parts Premium","Rigging","Steering","Wind Shield","Helm Pad Kit","Trailer"];

// Production Schedule stages (matches the existing live app)
const SCHED_STATUS = {
  BL: { t: "Backlog", bg: "#EEF0F2", fg: "#5F6B73", tv: "#7E8B93" },
  PP: { t: "Pre-Production", bg: "#E5EDF3", fg: "#33617F", tv: "#5C7A92" },
  GS: { t: "Glass Shop", bg: "#FCEBEB", fg: "#A32D2D", tv: "#D8443F" },
  BK: { t: "Back Line", bg: "#FAEEDA", fg: "#854F0B", tv: "#E89A2B" },
  FL: { t: "Front Line", bg: "#FBF3D6", fg: "#7A6310", tv: "#D6B33A" },
  QC: { t: "QC", bg: "#E6F0F5", fg: "#1E5E7E", tv: "#3A8BB0" },
  DL: { t: "Delivered", bg: "#EAF3DE", fg: "#3B6D11", tv: "#5C9A2E" },
};
const SCHED_ORDER = ["BL", "PP", "GS", "BK", "FL", "QC", "DL"];

const LAM_FLAGS = {
  delay: { t: "Issue / Delay", c: "#BA7517" },
  rework: { t: "Required Rework", c: "#185FA5" },
  unsat: { t: "Unsatisfactory", c: "#A32D2D" },
};
const KP_FLAGS = {
  late: { t: "Late", c: "#A32D2D" },
  back: { t: "Backordered", c: "#BA7517" },
  unsat: { t: "Unsatisfactory", c: "#185FA5" },
};

const BOATS = [
  { id: "28227", cust: "7Sports", model: "2850", hull: "Ice Blue" },
  { id: "25T036", cust: "Svoboda", model: "25T", hull: "White" },
  { id: "28222", cust: "Bertone", model: "2850", hull: "Black" },
  { id: "25T045", cust: "BGS", model: "25T", hull: "White" },
  { id: "36010", cust: "Parbhoo", model: "36", hull: "Medium Gray" },
];

const today = () => {
  const d = new Date();
  return (d.getMonth() + 1) + "/" + d.getDate();
};

// ---------- Seed demo data ----------
function seedLam() {
  const data = {};
  BOATS.forEach((b) => (data[b.id] = {}));
  data["28227"] = { Glass:{s:"IP",d:"1/8"}, Hull:{s:"MO",d:"1/10",color:"Ice Blue"}, Transducer:{s:"CM",d:"1/5"}, "T Top":{s:"PU",d:"12/29"} };
  data["25T036"] = { Glass:{s:"CM",d:"1/12"}, Hull:{s:"CM",d:"1/14"}, Transducer:{s:"IP",d:"1/15"}, "T Top":{s:"MO",d:"1/18"} };
  data["28222"] = { Glass:{s:"PU",d:"1/20"}, Hull:{s:"PU",d:"1/22",color:"Black"}, Transducer:{s:"PU",d:"1/18"}, "T Top":{s:"CM",d:"1/25"}, Liner:{s:"CM",d:"1/28"}, Ring:{s:"IP",d:"2/1"} };
  data["25T045"] = { Glass:{s:"PU",d:"12/28"}, Hull:{s:"PU",d:"12/30"}, Transducer:{s:"PU",d:"12/25"}, "T Top":{s:"PU",d:"1/2"}, Liner:{s:"PU",d:"1/5"}, Ring:{s:"NA"}, Baitwell:{s:"PU",d:"1/10",color:"Ice Blue"} };
  data["36010"] = { Hull:{s:"MU",color:"Medium Gray"} };
  return data;
}
function seedLamFlags() {
  return { "28227|Glass":["delay"], "25T036|Transducer":["rework"], "28222|Liner":["unsat","rework"] };
}
function seedFin() {
  const data = {};
  BOATS.forEach((b) => (data[b.id] = {}));
  data["28227"] = { Hull:{s:"CO",d:"1/8",grade:"good"}, Liner:{s:"IP",d:"1/12"}, Ring:{s:"NS",asap:true} };
  data["25T036"] = { Hull:{s:"IP",d:"1/14",grade:"bad"}, Liner:{s:"NS"} };
  data["28222"] = { Hull:{s:"CO",d:"1/20",grade:"good"}, Liner:{s:"CO",d:"1/22"}, Ring:{s:"IP",d:"1/28",grade:"ugly",asap:true}, "Hard Top":{s:"IP",d:"2/1"}, Console:{s:"NS"} };
  data["25T045"] = { Hull:{s:"CO",d:"12/28"}, Liner:{s:"CO",d:"12/30",grade:"good"}, Ring:{s:"CO",d:"1/2"}, "Hard Top":{s:"CO",d:"1/5"}, Console:{s:"IP",d:"1/8"} };
  data["36010"] = {};
  return data;
}
function seedSched() {
  // build order (top = built first) + current stage, matched to tracker progress
  return [
    { id: "25T045", stage: "FL", d: "1/8" },   // furthest along — finishing underway
    { id: "28222", stage: "BK", d: "1/28" },    // lamination mostly pulled, finishing started
    { id: "28227", stage: "GS", d: "1/8" },      // mid-lamination
    { id: "25T036", stage: "GS", d: "1/12" },    // mid-lamination
    { id: "36010", stage: "PP", d: "1/2" },      // barely started
  ];
}

function seedKP() {
  const data = {};
  BOATS.forEach((b) => (data[b.id] = {}));
  data["28227"] = { "Coosa Kit":{s:"RE",d:"1/2"}, Gelcoat:{s:"RE",d:"1/3"}, Motors:{s:"OR",d:"1/18",flags:["late"]}, Ride:{s:"RE",d:"1/2"}, Bracket:{s:"OR",d:"1/22"}, Upholstery:{s:"OR",d:""} };
  data["25T036"] = { "Coosa Kit":{s:"RE",d:"1/4"}, Gelcoat:{s:"OR",d:"1/20",flags:["back"]}, Motors:{s:"OR",d:"1/25"}, Steering:{s:"RE",d:"1/5"} };
  data["28222"] = { "Coosa Kit":{s:"RE",d:"12/20"}, Gelcoat:{s:"RE",d:"12/21"}, Motors:{s:"RE",d:"12/22"}, Bracket:{s:"RE",d:"1/2",flags:["unsat"]}, Rigging:{s:"OR",d:"1/28"}, "Wind Shield":{s:"OR",d:"2/3"} };
  data["25T045"] = { "Coosa Kit":{s:"RE",d:"12/18"}, Gelcoat:{s:"RE",d:"12/19"}, Motors:{s:"RE",d:"12/20"}, Upholstery:{s:"RE",d:"1/2"}, Trailer:{s:"RE",d:"1/4"} };
  data["36010"] = { "Coosa Kit":{s:"RE",d:"1/2"}, Gelcoat:{s:"RE",d:"1/3"}, Motors:{s:"RE",d:"1/4"}, Bracket:{s:"RE",d:"1/5"}, Rigging:{s:"RE",d:"1/6"} };
  return data;
}

// ---------- Small UI helpers ----------
function Logo({ size = 20, light = true }) {
  const barH = size * 1.1;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      <span style={{ display: "inline-block", width: size * 0.25, height: barH, background: STEEL, transform: "skewX(-12deg)" }} />
      <span style={{ display: "inline-block", width: size * 0.25, height: barH, background: STEEL, transform: "skewX(-12deg)" }} />
      <span style={{ fontSize: size, fontWeight: 800, fontStyle: "italic", color: light ? "#fff" : NAVY, letterSpacing: 0.5, marginLeft: 4, fontFamily: "Arial, sans-serif" }}>BLUEWATER</span>
    </span>
  );
}

function Face({ grade, size = 16 }) {
  const map = { good: { e: "🙂", c: "#3B6D11" }, bad: { e: "😐", c: "#BA7517" }, ugly: { e: "🙁", c: "#A32D2D" } };
  const g = map[grade];
  if (!g) return null;
  return <span style={{ fontSize: size, lineHeight: 1 }} title={grade}>{g.e}</span>;
}

// ============================= MAIN APP =============================
export default function App() {
  const [device, setDevice] = useState("computer"); // computer | tv | mobile
  const [tab, setTab] = useState("Lamination");

  const [lam, setLam] = useState(seedLam);
  const [lamFlags, setLamFlags] = useState(seedLamFlags);
  const [fin, setFin] = useState(seedFin);
  const [kp, setKp] = useState(seedKP);
  const [sched, setSched] = useState(seedSched);

  const [menu, setMenu] = useState(null); // { tracker, boatId, task, x, y }

  // ---- status mutation helpers (Ops actions) ----
  function advance(tracker, boatId, task) {
    if (tracker === "Lamination") {
      setLam((prev) => {
        const cur = prev[boatId][task]?.s || "MU";
        if (cur === "NA") return prev;
        const i = LAM_ORDER.indexOf(cur);
        if (i >= LAM_ORDER.length - 1) return prev;
        const next = LAM_ORDER[i + 1];
        return { ...prev, [boatId]: { ...prev[boatId], [task]: { ...prev[boatId][task], s: next, d: next === "MU" ? "" : today() } } };
      });
    } else if (tracker === "Finishing") {
      setFin((prev) => {
        const cur = prev[boatId][task]?.s || "NA";
        const i = FIN_ORDER.indexOf(cur);
        if (i >= FIN_ORDER.length - 1) return prev;
        const next = FIN_ORDER[i + 1];
        return { ...prev, [boatId]: { ...prev[boatId], [task]: { ...prev[boatId][task], s: next, d: next === "NA" ? "" : today() } } };
      });
    } else if (tracker === "Key Parts") {
      setKp((prev) => {
        const cur = prev[boatId][task]?.s || "NO";
        const i = KP_ORDER.indexOf(cur);
        if (i >= KP_ORDER.length - 1) return prev;
        const next = KP_ORDER[i + 1];
        return { ...prev, [boatId]: { ...prev[boatId], [task]: { ...prev[boatId][task], s: next, d: next === "RE" ? today() : (prev[boatId][task]?.d || "") } } };
      });
    }
  }
  function stepBack(tracker, boatId, task) {
    const order = tracker === "Lamination" ? LAM_ORDER : tracker === "Finishing" ? FIN_ORDER : KP_ORDER;
    const setter = tracker === "Lamination" ? setLam : tracker === "Finishing" ? setFin : setKp;
    const first = order[0];
    setter((prev) => {
      const cur = prev[boatId][task]?.s || first;
      if (cur === "NA" && tracker === "Lamination") return prev;
      const i = order.indexOf(cur);
      if (i <= 0) return prev;
      return { ...prev, [boatId]: { ...prev[boatId], [task]: { ...prev[boatId][task], s: order[i - 1] } } };
    });
  }
  function toggleFlag(tracker, boatId, task, flag) {
    if (tracker === "Lamination") {
      setLamFlags((prev) => {
        const key = boatId + "|" + task;
        const cur = prev[key] || [];
        const next = cur.includes(flag) ? cur.filter((f) => f !== flag) : [...cur, flag];
        return { ...prev, [key]: next };
      });
    } else if (tracker === "Key Parts") {
      setKp((prev) => {
        const cur = prev[boatId][task]?.flags || [];
        const next = cur.includes(flag) ? cur.filter((f) => f !== flag) : [...cur, flag];
        return { ...prev, [boatId]: { ...prev[boatId], [task]: { ...prev[boatId][task], flags: next } } };
      });
    }
  }
  function setGrade(boatId, task, grade) {
    setFin((prev) => {
      const curGrade = prev[boatId][task]?.grade;
      return { ...prev, [boatId]: { ...prev[boatId], [task]: { ...prev[boatId][task], grade: curGrade === grade ? null : grade } } };
    });
  }
  function toggleAsap(boatId, task) {
    setFin((prev) => ({ ...prev, [boatId]: { ...prev[boatId], [task]: { ...prev[boatId][task], asap: !prev[boatId][task]?.asap } } }));
  }
  function schedAdvance(boatId) {
    setSched((prev) => prev.map((row) => {
      if (row.id !== boatId) return row;
      const i = SCHED_ORDER.indexOf(row.stage);
      if (i >= SCHED_ORDER.length - 1) return row;
      return { ...row, stage: SCHED_ORDER[i + 1], d: today() };
    }));
  }
  function schedBack(boatId) {
    setSched((prev) => prev.map((row) => {
      if (row.id !== boatId) return row;
      const i = SCHED_ORDER.indexOf(row.stage);
      if (i <= 0) return row;
      return { ...row, stage: SCHED_ORDER[i - 1] };
    }));
  }

  const tabs = ["Production Schedule", "Boat Information", "Key Parts", "Lamination", "Finishing"];

  return (
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", background: "#EEF1F4", minHeight: "100vh", padding: 16 }}>
      {/* Device switcher */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#5F6B73", marginRight: 4 }}>Preview as:</span>
        {[
          ["computer", "💻 Computer (Ops) — interactive"],
          ["tv", "📺 TV / Shop floor — preview"],
          ["mobile", "📱 Mobile (Shop) — preview"],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setDevice(id)}
            style={{ fontSize: 12, padding: "7px 13px", borderRadius: 7, border: "none", cursor: "pointer",
              background: device === id ? NAVY : "#fff", color: device === id ? "#fff" : "#33424C", fontWeight: device === id ? 700 : 400,
              boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>{label}</button>
        ))}
        <span style={{ fontSize: 11, color: "#8A969E", marginLeft: "auto" }}>Demo data — changes are session-only, not saved or shared</span>
      </div>

      {device === "computer" && (
        <ComputerView {...{ tab, setTab, tabs, lam, lamFlags, fin, kp, sched, advance, stepBack, toggleFlag, setGrade, toggleAsap, schedAdvance, schedBack, menu, setMenu }} />
      )}
      {device === "tv" && <TVView {...{ lam, lamFlags, fin, kp, sched }} />}
      {device === "mobile" && <MobileView {...{ fin }} />}
    </div>
  );
}

// ============================= COMPUTER (OPS) VIEW =============================
function ComputerView({ tab, setTab, tabs, lam, lamFlags, fin, kp, sched, advance, stepBack, toggleFlag, setGrade, toggleAsap, schedAdvance, schedBack, menu, setMenu }) {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative" }} onClick={() => setMenu(null)}>
      {/* Header */}
      <div style={{ background: NAVY, borderRadius: "10px 10px 0 0", padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Logo size={19} />
          <span style={{ color: "#7FB0D6", fontSize: 12, borderLeft: "1px solid #2E5275", paddingLeft: 14 }}>Production Tracker</span>
        </div>
        <span style={{ color: "#7FB0D6", fontSize: 12 }}>Ken Goldfarb · Ops</span>
      </div>
      {/* Tabs */}
      <div style={{ background: "#fff", borderLeft: "1px solid #E2E6EA", borderRight: "1px solid #E2E6EA", display: "flex", gap: 3, padding: "8px 12px 0" }}>
        {tabs.map((t) => (
          <button key={t} onClick={(e) => { e.stopPropagation(); setTab(t); }}
            style={{ fontSize: 12, padding: "8px 13px", border: "none", cursor: "pointer", borderRadius: "6px 6px 0 0", fontWeight: tab === t ? 700 : 400,
              background: tab === t ? SPLASH : "transparent", color: tab === t ? "#fff" : "#5F6B73" }}>{t}</button>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1px solid #E2E6EA", borderRadius: "0 0 10px 10px", padding: 0 }}>
        {tab === "Lamination" && <LamTable {...{ lam, lamFlags, advance, stepBack, toggleFlag, menu, setMenu }} />}
        {tab === "Finishing" && <FinTable {...{ fin, advance, stepBack, setGrade, toggleAsap, menu, setMenu }} />}
        {tab === "Key Parts" && <KPTable {...{ kp, advance, stepBack, toggleFlag, menu, setMenu }} />}
        {tab === "Production Schedule" && <SchedBoard {...{ sched, schedAdvance, schedBack }} />}
        {tab === "Boat Information" && <PlaceholderTab name="Boat Information" note="Customer, model, engines, hull color (already live in the current app)." />}
      </div>

      <p style={{ fontSize: 11, color: "#8A969E", marginTop: 10, textAlign: "center" }}>
        Tip: click any colored cell to open the Ops action menu — Advance, Step Back, set flags, grade, etc. Watch the cell change.
      </p>
    </div>
  );
}

function PlaceholderTab({ name, note }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 8 }}>{name}</div>
      <div style={{ fontSize: 13, color: "#5F6B73", maxWidth: 440, margin: "0 auto" }}>{note}</div>
      <div style={{ fontSize: 12, color: "#A9B4BC", marginTop: 14 }}>Open the <b>Lamination</b>, <b>Finishing</b>, or <b>Key Parts</b> tab to try the interactive trackers.</div>
    </div>
  );
}

// ---------- Production Schedule (interactive) ----------
function SchedBoard({ sched, schedAdvance, schedBack }) {
  const boatById = (id) => BOATS.find((b) => b.id === id);
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: "#5F6B73", marginBottom: 12 }}>
        Build order, top to bottom. Each boat shows its current production stage — click <b>Advance</b> to move it forward through the line. Stages: Backlog → Pre-Production → Glass Shop → Back Line → Front Line → QC → Delivered.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sched.map((row, idx) => {
          const b = boatById(row.id);
          const st = SCHED_STATUS[row.stage];
          const stageIdx = SCHED_ORDER.indexOf(row.stage);
          return (
            <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #E2E6EA", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: NAVY, color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{idx + 1}</div>
              <div style={{ flex: "0 0 150px" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{b.id}</div>
                <div style={{ fontSize: 11, color: "#5F6B73" }}>{b.cust} · {b.model} · {b.hull}</div>
              </div>
              {/* stage progress pips */}
              <div style={{ flex: 1, display: "flex", gap: 3, alignItems: "center" }}>
                {SCHED_ORDER.map((s, i) => (
                  <div key={s} title={SCHED_STATUS[s].t} style={{ flex: 1, height: 7, borderRadius: 3, background: i <= stageIdx ? SCHED_STATUS[row.stage].tv : "#E6E9EC" }} />
                ))}
              </div>
              <div style={{ flex: "0 0 150px", textAlign: "center" }}>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 14, background: st.bg, color: st.fg }}>{st.t}</span>
                {row.d && row.stage !== "BL" && <div style={{ fontSize: 10, color: "#8A969E", marginTop: 3 }}>since {row.d}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
                <button onClick={() => schedBack(row.id)} disabled={stageIdx <= 0}
                  style={{ padding: "7px 10px", fontSize: 12, borderRadius: 7, border: "1px solid #D6DBE0", background: "#fff", cursor: stageIdx <= 0 ? "default" : "pointer", opacity: stageIdx <= 0 ? 0.4 : 1 }}>‹</button>
                <button onClick={() => schedAdvance(row.id)} disabled={stageIdx >= SCHED_ORDER.length - 1}
                  style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, borderRadius: 7, border: "none", background: SPLASH, color: "#fff", cursor: stageIdx >= SCHED_ORDER.length - 1 ? "default" : "pointer", opacity: stageIdx >= SCHED_ORDER.length - 1 ? 0.4 : 1 }}>Advance ›</button>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "#8A969E", marginTop: 12 }}>In the full app, you can also drag rows to reorder the build sequence. Once a boat is marked Delivered, it drops off the shop-floor TV automatically.</div>
    </div>
  );
}


function TableFrame({ cols, children }) {
  return (
    <div style={{ overflow: "auto", maxHeight: 460, borderRadius: "0 0 10px 10px" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 11, width: "100%" }}>
        <thead>
          <tr>
            <th style={{ position: "sticky", left: 0, top: 0, zIndex: 3, background: NAVY, color: "#fff", textAlign: "left", padding: "11px 12px", minWidth: 132, borderRight: "1px solid #C7CDD2", fontWeight: 700, fontSize: 12 }}>Boat</th>
            {cols.map((c) => (
              <th key={c} style={{ position: "sticky", top: 0, zIndex: 2, padding: "11px 5px", fontWeight: 600, fontSize: 10, minWidth: 92, background: NAVY, color: "#cfe0ee", borderRight: "1px solid #2E5275" }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
const tdBase = { position: "relative", padding: "7px 4px", textAlign: "center", borderRight: "1px solid #E6E9EC", borderBottom: "1px solid #E6E9EC", cursor: "pointer" };
function BoatCell({ b }) {
  return (
    <td style={{ position: "sticky", left: 0, zIndex: 1, background: "#fff", textAlign: "left", padding: "8px 12px", borderRight: "1px solid #C7CDD2", borderBottom: "1px solid #E6E9EC" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#1c1c1c" }}>{b.id}</div>
      <div style={{ fontSize: 11, color: "#5F6B73" }}>{b.cust} · {b.model}</div>
      <div style={{ fontSize: 11, color: SPLASH, fontStyle: "italic" }}>{b.hull}</div>
    </td>
  );
}

// ---------- Lamination table ----------
function LamTable({ lam, lamFlags, advance, stepBack, toggleFlag, menu, setMenu }) {
  return (
    <>
      <TableFrame cols={LAM_TASKS}>
        {BOATS.map((b) => (
          <tr key={b.id}>
            <BoatCell b={b} />
            {LAM_TASKS.map((task) => {
              const cell = lam[b.id][task] || { s: "MU" };
              const st = LAM_STATUS[cell.s];
              const fls = lamFlags[b.id + "|" + task] || [];
              return (
                <td key={task} style={{ ...tdBase, background: st.bg, color: st.fg }}
                  onClick={(e) => { e.stopPropagation(); setMenu({ tracker: "Lamination", boatId: b.id, task, x: e.clientX, y: e.clientY }); }}>
                  <div style={{ position: "absolute", top: 2, right: 3, display: "flex" }}>
                    {fls.map((f) => <span key={f} style={{ width: 7, height: 7, borderRadius: 2, background: LAM_FLAGS[f].c, marginLeft: 1 }} />)}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.2, marginTop: fls.length ? 6 : 0 }}>{st.t}</div>
                  {cell.d && <div style={{ fontSize: 9, marginTop: 1 }}>{cell.d}</div>}
                  {cell.color && cell.color !== "White" && cell.s !== "NA" && <div style={{ fontSize: 9, fontStyle: "italic", marginTop: 1 }}>{cell.color}</div>}
                </td>
              );
            })}
          </tr>
        ))}
      </TableFrame>
      <Legend status={LAM_STATUS} order={[...LAM_ORDER, "NA"]} flags={LAM_FLAGS} flagShape="dot" />
      {menu && menu.tracker === "Lamination" && (
        <ActionMenu menu={menu} onClose={() => setMenu(null)}>
          <MenuBtn label="Advance ›" primary onClick={() => advance("Lamination", menu.boatId, menu.task)} />
          <MenuBtn label="‹ Step back" onClick={() => stepBack("Lamination", menu.boatId, menu.task)} />
          <MenuLabel>Flags</MenuLabel>
          {Object.entries(LAM_FLAGS).map(([k, v]) => {
            const active = (lamFlags[menu.boatId + "|" + menu.task] || []).includes(k);
            return <MenuToggle key={k} label={v.t} color={v.c} active={active} onClick={() => toggleFlag("Lamination", menu.boatId, menu.task, k)} />;
          })}
          <MenuNote>Ops-only: N/A and Color also live here in the full app.</MenuNote>
        </ActionMenu>
      )}
    </>
  );
}

// ---------- Finishing table ----------
function FinTable({ fin, advance, stepBack, setGrade, toggleAsap, menu, setMenu }) {
  return (
    <>
      <TableFrame cols={FIN_TASKS}>
        {BOATS.map((b) => (
          <tr key={b.id}>
            <BoatCell b={b} />
            {FIN_TASKS.map((task) => {
              const cell = fin[b.id][task] || { s: "NA" };
              const st = FIN_STATUS[cell.s];
              return (
                <td key={task} style={{ ...tdBase, background: st.bg, color: st.fg }}
                  onClick={(e) => { e.stopPropagation(); setMenu({ tracker: "Finishing", boatId: b.id, task, x: e.clientX, y: e.clientY }); }}>
                  <div style={{ position: "absolute", top: 2, left: 3 }}><Face grade={cell.grade} size={14} /></div>
                  {cell.asap && <div style={{ position: "absolute", top: 2, right: 3, fontSize: 8, fontWeight: 700, color: "#fff", background: "#A32D2D", borderRadius: 3, padding: "0 3px" }}>ASAP</div>}
                  <div style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.2, marginTop: (cell.grade || cell.asap) ? 9 : 0 }}>{st.t}</div>
                  {cell.d && <div style={{ fontSize: 9, marginTop: 1 }}>{cell.d}</div>}
                </td>
              );
            })}
          </tr>
        ))}
      </TableFrame>
      <Legend status={FIN_STATUS} order={FIN_ORDER} grade asap />
      {menu && menu.tracker === "Finishing" && (
        <ActionMenu menu={menu} onClose={() => setMenu(null)}>
          <MenuBtn label="Advance ›" primary onClick={() => advance("Finishing", menu.boatId, menu.task)} />
          <MenuBtn label="‹ Step back" onClick={() => stepBack("Finishing", menu.boatId, menu.task)} />
          <MenuLabel>Priority</MenuLabel>
          <MenuToggle label="ASAP" color="#A32D2D" active={!!fin[menu.boatId][menu.task]?.asap} onClick={() => toggleAsap(menu.boatId, menu.task)} />
          <MenuLabel>Part grade (from lamination)</MenuLabel>
          <div style={{ display: "flex", gap: 6 }}>
            {[["good", "🙂 Good"], ["bad", "😐 Bad"], ["ugly", "🙁 Ugly"]].map(([g, label]) => {
              const active = fin[menu.boatId][menu.task]?.grade === g;
              return <button key={g} onClick={() => setGrade(menu.boatId, menu.task, g)}
                style={{ flex: 1, padding: "8px 0", fontSize: 11, borderRadius: 7, cursor: "pointer", border: active ? `1.5px solid ${SPLASH}` : "1px solid #D6DBE0", background: active ? "#EAF3FB" : "#fff", fontWeight: active ? 700 : 400 }}>{label}</button>;
            })}
          </div>
        </ActionMenu>
      )}
    </>
  );
}

// ---------- Key Parts table ----------
function KPTable({ kp, advance, stepBack, toggleFlag, menu, setMenu }) {
  return (
    <>
      <TableFrame cols={KP_PARTS}>
        {BOATS.map((b) => (
          <tr key={b.id}>
            <BoatCell b={b} />
            {KP_PARTS.map((task) => {
              const cell = kp[b.id][task] || { s: "NO" };
              const st = KP_STATUS[cell.s];
              const fls = cell.flags || [];
              const dateLabel = cell.s === "OR" ? (cell.d ? "exp " + cell.d : "exp —") : cell.s === "RE" ? cell.d : "";
              return (
                <td key={task} style={{ ...tdBase, background: st.bg, color: st.fg }}
                  onClick={(e) => { e.stopPropagation(); setMenu({ tracker: "Key Parts", boatId: b.id, task, x: e.clientX, y: e.clientY }); }}>
                  <div style={{ position: "absolute", top: 2, right: 3, display: "flex" }}>
                    {fls.map((f) => <span key={f} style={{ width: 7, height: 7, borderRadius: 2, background: KP_FLAGS[f].c, marginLeft: 1 }} />)}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.2, marginTop: fls.length ? 6 : 0 }}>{st.t}</div>
                  {dateLabel && <div style={{ fontSize: 9, marginTop: 1 }}>{dateLabel}</div>}
                </td>
              );
            })}
          </tr>
        ))}
      </TableFrame>
      <Legend status={KP_STATUS} order={KP_ORDER} flags={KP_FLAGS} flagShape="dot" note="Dates are delivery dates (exp = expected, plain = actual received). Ops-only tab." />
      {menu && menu.tracker === "Key Parts" && (
        <ActionMenu menu={menu} onClose={() => setMenu(null)}>
          <MenuBtn label="Advance ›" primary onClick={() => advance("Key Parts", menu.boatId, menu.task)} />
          <MenuBtn label="‹ Step back" onClick={() => stepBack("Key Parts", menu.boatId, menu.task)} />
          <MenuLabel>Flags</MenuLabel>
          {Object.entries(KP_FLAGS).map(([k, v]) => {
            const active = (kp[menu.boatId][menu.task]?.flags || []).includes(k);
            return <MenuToggle key={k} label={v.t} color={v.c} active={active} onClick={() => toggleFlag("Key Parts", menu.boatId, menu.task, k)} />;
          })}
          <MenuNote>Expected delivery date is set here when marking Ordered (date picker in full app).</MenuNote>
        </ActionMenu>
      )}
    </>
  );
}

// ---------- Legend ----------
function Legend({ status, order, flags, flagShape, grade, asap, note }) {
  return (
    <div style={{ padding: "12px 16px", borderTop: "1px solid #E6E9EC" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#5F6B73", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 }}>Status</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
        {order.map((s) => (
          <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <i style={{ width: 15, height: 15, borderRadius: 3, background: status[s].bg, border: "1px solid #D6DBE0" }} />{status[s].t}
          </span>
        ))}
      </div>
      {flags && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#5F6B73", textTransform: "uppercase", letterSpacing: 0.5, margin: "11px 0 7px" }}>Flags</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
            {Object.values(flags).map((f) => (
              <span key={f.t} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <i style={{ width: 11, height: 11, borderRadius: 2, background: f.c }} />{f.t}
              </span>
            ))}
          </div>
        </>
      )}
      {grade && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#5F6B73", textTransform: "uppercase", letterSpacing: 0.5, margin: "11px 0 7px" }}>Part grade · Priority</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
            <span style={{ fontSize: 12 }}>🙂 Good</span>
            <span style={{ fontSize: 12 }}>😐 Bad</span>
            <span style={{ fontSize: 12 }}>🙁 Ugly</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", background: "#A32D2D", borderRadius: 3, padding: "1px 5px" }}>ASAP</span>Priority
            </span>
          </div>
        </>
      )}
      {note && <div style={{ fontSize: 11, color: "#8A969E", marginTop: 10 }}>{note}</div>}
    </div>
  );
}

// ---------- Action menu (popup) ----------
function ActionMenu({ menu, onClose, children }) {
  const left = Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 240);
  const top = Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 320);
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left, top, width: 220, background: "#fff", borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.22)", border: "1px solid #E2E6EA", padding: 12, zIndex: 50 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{menu.task}</span>
        <span onClick={onClose} style={{ cursor: "pointer", color: "#9A9A9F", fontSize: 16, lineHeight: 1 }}>×</span>
      </div>
      <div style={{ fontSize: 11, color: "#8A969E", marginBottom: 10 }}>Boat {menu.boatId}</div>
      {children}
    </div>
  );
}
function MenuBtn({ label, primary, onClick }) {
  return <button onClick={onClick} style={{ width: "100%", marginBottom: 6, padding: "10px", fontSize: 13, fontWeight: primary ? 700 : 400, borderRadius: 8, cursor: "pointer", border: primary ? "none" : "1px solid #D6DBE0", background: primary ? SPLASH : "#fff", color: primary ? "#fff" : "#33424C" }}>{label}</button>;
}
function MenuLabel({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: "#8A969E", textTransform: "uppercase", letterSpacing: 0.5, margin: "10px 0 6px" }}>{children}</div>;
}
function MenuToggle({ label, color, active, onClick }) {
  return (
    <button onClick={onClick} style={{ width: "100%", marginBottom: 5, padding: "8px 10px", fontSize: 12, borderRadius: 7, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8,
      border: active ? `1.5px solid ${color}` : "1px solid #E2E6EA", background: active ? color + "14" : "#fff", color: "#33424C", fontWeight: active ? 700 : 400 }}>
      <span style={{ width: 11, height: 11, borderRadius: 2, background: color, opacity: active ? 1 : 0.35 }} />{label}{active ? " ✓" : ""}
    </button>
  );
}
function MenuNote({ children }) {
  return <div style={{ fontSize: 10, color: "#A9B4BC", marginTop: 8, lineHeight: 1.4 }}>{children}</div>;
}

// ============================= TV VIEW (static preview) =============================
function TVView({ lam, lamFlags, fin, kp, sched }) {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <p style={{ fontSize: 12, color: "#5F6B73", marginBottom: 12, textAlign: "center" }}>
        Shop-floor wall display. In the real app this auto-rotates through each board every 30 seconds; wide grids slowly scroll side-to-side. Static preview below.
      </p>
      <SchedTV sched={sched} />
      <TVBoard title="Lamination" cols={LAM_TASKS} status={LAM_STATUS}
        rows={BOATS.map((b) => ({ b, cells: LAM_TASKS.map((t) => ({ ...(lam[b.id][t] || { s: "MU" }), flags: lamFlags[b.id + "|" + t] || [] })) }))}
        flagColors={LAM_FLAGS} />
      <TVBoard title="Finishing" cols={FIN_TASKS} status={FIN_STATUS}
        rows={BOATS.map((b) => ({ b, cells: FIN_TASKS.map((t) => ({ ...(fin[b.id][t] || { s: "NA" }) })) }))} finish />
      <TVBoard title="Key Parts" cols={KP_PARTS} status={KP_STATUS}
        rows={BOATS.map((b) => ({ b, cells: KP_PARTS.map((t) => ({ ...(kp[b.id][t] || { s: "NO" }) })) }))} keyparts flagColors={KP_FLAGS} />
    </div>
  );
}
function SchedTV({ sched }) {
  const boatById = (id) => BOATS.find((b) => b.id === id);
  return (
    <div style={{ background: NAVY_DK, borderRadius: 10, overflow: "hidden", marginBottom: 18 }}>
      <div style={{ background: NAVY, padding: "13px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Logo size={18} />
          <span style={{ color: "#8FBEE0", fontSize: 15, fontWeight: 600, borderLeft: "1px solid #2E5275", paddingLeft: 14 }}>Production Schedule</span>
        </div>
        <span style={{ color: "#cfe0ee", fontSize: 13 }}>2:14 PM</span>
      </div>
      <div style={{ padding: 8 }}>
        {sched.map((row, idx) => {
          const b = boatById(row.id);
          const st = SCHED_STATUS[row.stage];
          return (
            <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderBottom: "1px solid #163a59" }}>
              <span style={{ color: "#8FBEE0", fontSize: 18, fontWeight: 700, width: 24 }}>{idx + 1}</span>
              <div style={{ flex: "0 0 200px" }}>
                <span style={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>{b.id}</span>
                <span style={{ color: "#8FBEE0", fontSize: 14, marginLeft: 10 }}>{b.cust} · {b.hull}</span>
              </div>
              <div style={{ flex: 1, display: "flex", gap: 3 }}>
                {SCHED_ORDER.map((s, i) => {
                  const stageIdx = SCHED_ORDER.indexOf(row.stage);
                  return <div key={s} style={{ flex: 1, height: 10, borderRadius: 3, background: i <= stageIdx ? st.tv : "#1d3e5c" }} />;
                })}
              </div>
              <span style={{ flex: "0 0 auto", fontSize: 18, fontWeight: 700, color: "#fff", background: st.tv, padding: "6px 16px", borderRadius: 18 }}>{st.t}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TVBoard({ title, cols, status, rows, flagColors, finish, keyparts }) {
  return (
    <div style={{ background: NAVY_DK, borderRadius: 10, overflow: "hidden", marginBottom: 18 }}>
      <div style={{ background: NAVY, padding: "13px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Logo size={18} />
          <span style={{ color: "#8FBEE0", fontSize: 15, fontWeight: 600, borderLeft: "1px solid #2E5275", paddingLeft: 14 }}>{title}</span>
        </div>
        <span style={{ color: "#cfe0ee", fontSize: 13 }}>2:14 PM</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", minWidth: "100%" }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, zIndex: 2, width: 150, background: NAVY_DK, color: "#8FBEE0", textAlign: "left", padding: "9px 12px", fontSize: 13, fontWeight: 600, borderBottom: "2px solid #2E5275" }}>Boat</th>
              {cols.map((c) => <th key={c} style={{ width: 110, background: NAVY_DK, color: "#8FBEE0", padding: "9px 3px", fontSize: 11, fontWeight: 600, borderBottom: "2px solid #2E5275", borderLeft: "1px solid #1d3e5c" }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ b, cells }) => (
              <tr key={b.id}>
                <td style={{ position: "sticky", left: 0, zIndex: 1, background: "#12354F", color: "#fff", padding: "9px 12px", borderBottom: "2px solid #0F2E4D" }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{b.id}</div>
                  <div style={{ fontSize: 11, color: "#8FBEE0" }}>{b.cust}</div>
                  <div style={{ fontSize: 11, color: "#cBe0f2", fontStyle: "italic" }}>{b.hull}</div>
                </td>
                {cells.map((cell, i) => {
                  const st = status[cell.s];
                  const dateLabel = keyparts ? (cell.s === "OR" ? (cell.d ? "exp " + cell.d : "exp —") : cell.s === "RE" ? cell.d : "") : cell.d;
                  return (
                    <td key={i} style={{ position: "relative", width: 110, height: 64, background: st.tv, color: st.s === "CM" || st.s === "IP" ? "#3a2402" : "#fff", textAlign: "center", padding: "5px 3px", borderBottom: "2px solid #0F2E4D", borderLeft: "1px solid rgba(255,255,255,0.08)", verticalAlign: "middle" }}>
                      {finish && <div style={{ position: "absolute", top: 2, left: 4 }}><Face grade={cell.grade} size={15} /></div>}
                      {finish && cell.asap && <div style={{ position: "absolute", top: 2, right: 4, fontSize: 8, fontWeight: 700, background: "#C13B3B", color: "#fff", borderRadius: 3, padding: "0 3px" }}>ASAP</div>}
                      {flagColors && (cell.flags || []).length > 0 && <div style={{ position: "absolute", top: 3, right: 4, display: "flex" }}>{cell.flags.map((f) => <span key={f} style={{ width: 8, height: 8, borderRadius: 2, background: flagColors[f].c, marginLeft: 1 }} />)}</div>}
                      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.1 }}>{st.t}</div>
                      {dateLabel && <div style={{ fontSize: 10, marginTop: 2, opacity: 0.9 }}>{dateLabel}</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================= MOBILE VIEW (static preview) =============================
function MobileView({ fin }) {
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <p style={{ fontSize: 12, color: "#5F6B73", marginBottom: 14, textAlign: "center" }}>
        Shop-floor phone tool (restricted "Shop" users). Boat-first: pick a boat → pick a tracker → tap a task to update. Static preview of the three screens.
      </p>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
        {/* Screen 1 - boat list */}
        <Phone>
          <PhoneHeader>
            <Logo size={13} /><span style={{ color: "#8FBEE0", fontSize: 16 }}>☰</span>
          </PhoneHeader>
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#5F6B73", marginBottom: 10 }}>Active boats</div>
            {BOATS.slice(0, 4).map((b) => (
              <div key={b.id} style={{ background: "#EEF1F4", borderRadius: 10, padding: 11, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div><div style={{ fontSize: 15, fontWeight: 700 }}>{b.id}</div><div style={{ fontSize: 12, color: "#5F6B73" }}>{b.cust} · {b.model} · {b.hull}</div></div>
                <span style={{ color: "#A9B4BC" }}>›</span>
              </div>
            ))}
          </div>
        </Phone>
        {/* Screen 2 - boat detail finishing */}
        <Phone>
          <PhoneHeader>
            <span style={{ color: "#8FBEE0", fontSize: 16 }}>‹</span>
            <div style={{ flex: 1, marginLeft: 8 }}><div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>28227</div><div style={{ fontSize: 11, color: "#8FBEE0" }}>7Sports · Ice Blue</div></div>
          </PhoneHeader>
          <div style={{ display: "flex", background: "#12354F", padding: "0 4px" }}>
            {["Lamination", "Finishing", "Key Parts"].map((t, i) => (
              <span key={t} style={{ flex: 1, textAlign: "center", fontSize: 11, padding: "8px 0", color: i === 1 ? "#fff" : "#8FBEE0", fontWeight: i === 1 ? 700 : 400, borderBottom: i === 1 ? `2px solid ${SPLASH}` : "none" }}>{t}</span>
            ))}
          </div>
          <div style={{ padding: 10 }}>
            {[
              { task: "Hull", s: "CO", d: "1/8", grade: "good" },
              { task: "Liner", s: "IP", d: "1/12" },
              { task: "Ring", s: "NS", asap: true },
              { task: "Hard Top", s: "NA" },
              { task: "Console", s: "NA" },
            ].map((r) => {
              const st = FIN_STATUS[r.s];
              return (
                <div key={r.task} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 12px", background: st.bg, borderRadius: 9, marginBottom: 7 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: st.fg }}>
                    {r.grade && <Face grade={r.grade} size={15} />}{r.task}
                    {r.asap && <span style={{ fontSize: 8, fontWeight: 700, color: "#fff", background: "#C13B3B", borderRadius: 3, padding: "1px 5px" }}>ASAP</span>}
                  </span>
                  <span style={{ fontSize: 12, color: st.fg }}>{st.t}{r.d ? " · " + r.d : ""}</span>
                </div>
              );
            })}
          </div>
        </Phone>
        {/* Screen 3 - action sheet */}
        <Phone>
          <div style={{ filter: "brightness(0.6)" }}>
            <PhoneHeader><span style={{ color: "#8FBEE0", fontSize: 16 }}>‹</span><span style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginLeft: 8 }}>28227</span></PhoneHeader>
            <div style={{ padding: 10 }}><div style={{ height: 42, background: "#EEF1F4", borderRadius: 9, marginBottom: 7 }} /><div style={{ height: 42, background: "#EEF1F4", borderRadius: 9 }} /></div>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: "1px solid #D6DBE0", borderRadius: "16px 16px 16px 16px", padding: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Ring</div>
            <div style={{ fontSize: 12, color: "#5F6B73", marginBottom: 12 }}>Not Started</div>
            <button style={{ width: "100%", marginBottom: 7, background: SPLASH, color: "#fff", border: "none", padding: 11, fontSize: 14, fontWeight: 700, borderRadius: 9 }}>Advance ›</button>
            <button style={{ width: "100%", marginBottom: 10, padding: 10, fontSize: 13, borderRadius: 9, border: "1px solid #D6DBE0", background: "#fff" }}>‹ Step back</button>
            <div style={{ fontSize: 11, color: "#5F6B73", marginBottom: 6 }}>Priority</div>
            <button style={{ width: "100%", marginBottom: 10, padding: 10, fontSize: 13, borderRadius: 9, background: "#FCEBEB", color: "#A32D2D", border: "1px solid #E8645F" }}>ASAP — on</button>
            <div style={{ fontSize: 11, color: "#5F6B73", marginBottom: 6 }}>Part grade</div>
            <div style={{ display: "flex", gap: 7 }}>
              {[["good", "🙂", "Good"], ["bad", "😐", "Bad"], ["ugly", "🙁", "Ugly"]].map(([g, e, l]) => (
                <button key={g} style={{ flex: 1, padding: "9px 0", fontSize: 12, borderRadius: 9, border: "1px solid #D6DBE0", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><span style={{ fontSize: 18 }}>{e}</span>{l}</button>
              ))}
            </div>
          </div>
        </Phone>
      </div>
    </div>
  );
}
function Phone({ children }) {
  return <div style={{ flex: "0 0 250px", background: "#fff", borderRadius: 20, overflow: "hidden", border: "1px solid #D6DBE0", position: "relative", minHeight: 420, boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>{children}</div>;
}
function PhoneHeader({ children }) {
  return <div style={{ background: NAVY, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>{children}</div>;
}
