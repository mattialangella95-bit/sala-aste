import React, { useState, useEffect, useMemo, useRef } from "react";
import { sha256, pulisci } from "./cripto.js";
import * as nuvola from "./nuvola.js";
import { leggiProbabili, mappaPerId, fasciaTitolarita } from "./probabili.js";
/* la libreria per leggere gli xlsx pesa parecchio e serve solo a chi importa il listone,
   quindi la carichiamo al volo solo al primo import */
let XLSX = null;
async function caricaXLSX() {
  if (XLSX) return XLSX;
  if (window.XLSX) { XLSX = window.XLSX; return XLSX; }
  await new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = ok; s.onerror = () => ko(new Error("libreria non raggiungibile"));
    document.head.appendChild(s);
  });
  XLSX = window.XLSX;
  return XLSX;
}

/* ------------------------------------------------------------------ */
/*  COSTANTI                                                           */
/* ------------------------------------------------------------------ */

/* Si parte da un campionato solo. Gli altri si aggiungono dal pannello Dati.
   Chi ha gia' i suoi campionati salvati se li ritrova come sono. */
const LEGHE_DEFAULT = [
  { id: "L1", nome: "Campionato 1", budget: 500, modalita: "classic", rosaMax: { P: 3, D: 8, C: 8, A: 6 } },
];

/* oltre questo numero la testata diventa illeggibile, e nessuno fa otto aste */
const LEGHE_MAX = 6;

/* La stagione comincia a luglio, quindi da luglio in poi l'anno corrente
   e' gia' quello della stagione nuova. */
function annoStagioneOggi() {
  const o = new Date();
  return o.getMonth() >= 6 ? o.getFullYear() : o.getFullYear() - 1;
}

/* Dal nome del file tiriamo fuori l'anno d'inizio stagione.
   Vale per Quotazioni_Fantacalcio_Stagione_2026_27 come per Statistiche 2025 26. */
function annoDalNome(nome) {
  const m = String(nome).match(/(20\d{2})/);
  return m ? parseInt(m[1], 10) : null;
}

/* In Mantra le quotazioni sono altre, e per circa un giocatore su tre
   non coincidono con quelle Classic. Se mancano ripieghiamo su quelle Classic. */
const quotaDi = (p, mantra) => (mantra && p.qtM ? p.qtM : p.qt);
const quotaInizialeDi = (p, mantra) => (mantra && p.qtIM ? p.qtIM : p.qtI);
const valoreDi = (p, mantra) => (mantra && p.fvmM ? p.fvmM : p.fvm);

/* il prossimo identificativo libero, L1 L2 L3 e cosi' via */
function prossimoIdLega(leghe) {
  let n = 1;
  const presi = new Set(leghe.map((l) => l.id));
  while (presi.has("L" + n)) n++;
  return "L" + n;
}

const RUOLI_C = ["P", "D", "C", "A"];
const RUOLI_M = ["Por", "Dc", "B", "Dd", "Ds", "E", "M", "C", "T", "W", "A", "Pc"];
const RUOLI_DIF_M = ["Dc", "B", "Dd", "Ds", "E", "M"];   // stampo difensivo, D-Factor
const RUOLI_D_PURI = ["Dc", "B", "Dd", "Ds"];            // devono essere almeno 3 nel D-Factor

const INTERESSE = [
  { k: 0, label: "Non valutato", short: "—", col: "#B9A5AA" },
  { k: 1, label: "Evita", short: "EV", col: "#8E8189" },
  { k: 2, label: "Ripiego", short: "RIP", col: "#8A6BA8" },
  { k: 3, label: "Mi piace", short: "OK", col: "#1F6B4A" },
  { k: 4, label: "Obiettivo", short: "OBB", col: "#C8892A" },
  { k: 5, label: "Must have", short: "MUST", col: "#D02E5E" },
];

const TAG_SUGGERITI = [
  "rigorista", "titolare", "scommessa", "low cost", "jolly", "fascia",
  "assist man", "clean sheet", "under", "rischio infortuni",
];

/* Moduli Classic, per linee, portiere difesa centrocampo attacco */
const MODULI_C = {
  "3-4-3": [["P"], ["D", "D", "D"], ["C", "C", "C", "C"], ["A", "A", "A"]],
  "3-5-2": [["P"], ["D", "D", "D"], ["C", "C", "C", "C", "C"], ["A", "A"]],
  "4-3-3": [["P"], ["D", "D", "D", "D"], ["C", "C", "C"], ["A", "A", "A"]],
  "4-4-2": [["P"], ["D", "D", "D", "D"], ["C", "C", "C", "C"], ["A", "A"]],
  "4-5-1": [["P"], ["D", "D", "D", "D"], ["C", "C", "C", "C", "C"], ["A"]],
  "5-3-2": [["P"], ["D", "D", "D", "D", "D"], ["C", "C", "C"], ["A", "A"]],
  "5-4-1": [["P"], ["D", "D", "D", "D", "D"], ["C", "C", "C", "C"], ["A"]],
};

/* Moduli Mantra, gli undici schemi ufficiali, per linee, dalla tabella sostituzioni Fantacalcio */
const MODULI_M = {
  "3-4-3":   [["Por"], ["Dc", "Dc", "Dc/B"], ["E", "M/C", "C", "E"], [], ["W/A", "A/Pc", "W/A"]],
  "3-4-1-2": [["Por"], ["Dc", "Dc", "Dc/B"], ["E", "M/C", "C", "E"], ["T"], ["A/Pc", "A/Pc"]],
  "3-4-2-1": [["Por"], ["Dc", "Dc", "Dc/B"], ["E", "M", "M/C", "E/W"], ["T", "T/A"], ["A/Pc"]],
  "3-5-2":   [["Por"], ["Dc", "Dc", "Dc/B"], ["E", "M", "M/C", "C", "E/W"], [], ["A/Pc", "A/Pc"]],
  "3-5-1-1": [["Por"], ["Dc", "Dc", "Dc/B"], ["E/W", "M", "M", "C", "E/W"], ["T/A"], ["A/Pc"]],
  "4-3-3":   [["Por"], ["Ds", "Dc", "Dc", "Dd"], ["M", "M/C", "C"], [], ["W/A", "A/Pc", "W/A"]],
  "4-3-1-2": [["Por"], ["Ds", "Dc", "Dc", "Dd"], ["M", "M/C", "C"], ["T"], ["T/A/Pc", "A/Pc"]],
  "4-4-2":   [["Por"], ["Ds", "Dc", "Dc", "Dd"], ["E", "M/C", "C", "E/W"], [], ["A/Pc", "A/Pc"]],
  "4-4-1-1": [["Por"], ["Ds", "Dc", "Dc", "Dd"], ["E/W", "M", "C", "E/W"], ["T/A"], ["A/Pc"]],
  "4-2-3-1": [["Por"], ["Ds", "Dc", "Dc", "Dd"], ["M", "M/C"], ["W/T", "T", "W/A"], ["A/Pc"]],
  "4-1-4-1": [["Por"], ["Ds", "Dc", "Dc", "Dd"], ["M"], ["E/W#", "C/T", "T#", "W#"], ["A/Pc"]],
};

/*
  Regole di schieramento per singola casella, dalla tabella ufficiale
  ok      calciatore nel suo ruolo
  malus   schierabile fuori posizione, meno un punto
  vietato ammesso solo dal sistema nelle sostituzioni forzate, non in fase di inserimento
  tutto il resto non è ammesso in nessun caso
  le caselle con # valgono solo per il 4-1-4-1, dove W e T non sono interscambiabili
*/
const D_TUTTI = ["Dd", "Ds", "Dc", "B"];
const REGOLE_SLOT = {
  "Por":    { ok: ["Por"], malus: [], vietato: [] },
  "Dc":     { ok: ["Dc"], malus: [], vietato: ["Dd", "Ds", "B"] },
  "Dc/B":   { ok: ["Dc", "B"], malus: [], vietato: ["Dd", "Ds"] },
  "Ds":     { ok: ["Ds"], malus: ["Dc"], vietato: ["Dd", "B"] },
  "Dd":     { ok: ["Dd"], malus: ["Dc"], vietato: ["Ds", "B"] },
  "E":      { ok: ["E"], malus: D_TUTTI, vietato: ["M"] },
  "E/W":    { ok: ["E", "W"], malus: [...D_TUTTI, "M", "C", "T"], vietato: [] },
  "M":      { ok: ["M"], malus: D_TUTTI, vietato: ["E"] },
  "M/C":    { ok: ["M", "C"], malus: [...D_TUTTI, "E"], vietato: [] },
  "C":      { ok: ["C"], malus: [...D_TUTTI, "E", "M"], vietato: [] },
  "C/T":    { ok: ["C", "T"], malus: [...D_TUTTI, "E", "M"], vietato: [] },
  "T":      { ok: ["T"], malus: [...D_TUTTI, "E", "M", "C"], vietato: ["W"] },
  "T/A":    { ok: ["T", "A"], malus: [...D_TUTTI, "E", "M", "C", "W"], vietato: [] },
  "T/A/Pc": { ok: ["T", "A", "Pc"], malus: [...D_TUTTI, "E", "M", "C", "W"], vietato: [] },
  "W/T":    { ok: ["W", "T"], malus: [...D_TUTTI, "E", "M", "C"], vietato: [] },
  "W/A":    { ok: ["W", "A"], malus: [...D_TUTTI, "E", "M", "C", "T"], vietato: [] },
  "A/Pc":   { ok: ["A", "Pc"], malus: [...D_TUTTI, "E", "M", "C", "T", "W"], vietato: [] },
  /* varianti del solo 4-1-4-1 */
  "T#":     { ok: ["T"], malus: [...D_TUTTI, "E", "M", "C"], vietato: [] },
  "E/W#":   { ok: ["E", "W"], malus: [...D_TUTTI, "M", "C"], vietato: [] },
  "W#":     { ok: ["W"], malus: [...D_TUTTI, "E", "M", "C"], vietato: [] },
};

const etichettaSlot = (s) => s.replace("#", "");

/* Quanto uno tira i rigori. La stagione in corso pesa mille volte quella scorsa,
   cosi' appena qualcuno ne batte uno quest'anno scavalca il rigorista dell'anno scorso. */
const pesoRigori = (p) => (p.rc || 0) * 1000 + (p.rcP || 0);
const etichettaRigorista = (n) => (n === 1 ? "rigorista" : "2° rigorista");

/* stato di una casella per un dato giocatore, in fase di inserimento formazione */
function esitoSlot(p, slot, mantra) {
  if (!mantra) return slot === p.r ? "ok" : "no";
  const R = REGOLE_SLOT[slot];
  if (!R) return "no";
  const ruoli = p.rm || [];
  if (ruoli.some((r) => R.ok.includes(r))) return "ok";
  if (ruoli.some((r) => R.malus.includes(r))) return "malus";
  if (ruoli.some((r) => R.vietato.includes(r))) return "vietato";
  return "no";
}

/* Modificatore difesa Classic, sei fasce ufficiali di Leghe Fantacalcio, punti modificabili */
const MD_DEFAULT = [
  { min: 0, max: 6, bonus: 0 },
  { min: 6, max: 6.25, bonus: 1 },
  { min: 6.25, max: 6.5, bonus: 2 },
  { min: 6.5, max: 6.75, bonus: 3 },
  { min: 6.75, max: 7, bonus: 4 },
  { min: 7, max: 99, bonus: 5 },
];
const SEED = [
  [1, "P", "Por", "Maignan", "Milan", 18, 22],
  [2, "P", "Por", "Di Gregorio", "Juventus", 15, 18],
  [3, "P", "Por", "Meret", "Napoli", 12, 14],
  [4, "D", "Dc", "Bastoni", "Inter", 20, 28],
  [5, "D", "Dd;E", "Dumfries", "Inter", 18, 26],
  [6, "D", "Dc", "Bremer", "Juventus", 17, 22],
  [7, "D", "Ds;E", "Dimarco", "Inter", 22, 34],
  [8, "D", "Dc", "Buongiorno", "Napoli", 14, 16],
  [9, "D", "Dd", "Cambiaso", "Juventus", 13, 15],
  [10, "D", "Dc", "Gatti", "Juventus", 11, 12],
  [11, "D", "Ds;E", "Theo Hernandez", "Milan", 21, 30],
  [12, "C", "M;C", "Barella", "Inter", 24, 32],
  [13, "C", "C;T", "Pulisic", "Milan", 30, 55],
  [14, "C", "T;W", "Zaccagni", "Lazio", 22, 28],
  [15, "C", "C;T", "Koopmeiners", "Juventus", 28, 42],
  [16, "C", "M", "Lobotka", "Napoli", 12, 12],
  [17, "C", "W;T", "Chiesa", "Napoli", 20, 24],
  [18, "C", "C", "Frattesi", "Inter", 14, 15],
  [19, "A", "Pc", "Lautaro Martinez", "Inter", 38, 78],
  [20, "A", "Pc", "Vlahovic", "Juventus", 30, 48],
  [21, "A", "A;Pc", "Lukaku", "Napoli", 28, 42],
  [22, "A", "A;W", "Leao", "Milan", 32, 60],
  [23, "A", "Pc", "Retegui", "Atalanta", 26, 40],
  [24, "A", "A;W", "Orsolini", "Bologna", 24, 34],
].map(([id, r, rm, nome, squadra, qt, fvm]) => ({
  id: String(id), r, rm: rm.split(";"), nome, squadra, qt, qtI: qt, fvm, qtM: qt, qtIM: qt, fvmM: fvm,
  pv: 0, mv: 0, fm: 0, gf: 0, ass: 0,
  amm: 0, esp: 0, rp: 0, rc: 0, gs: 0, au: 0, rPiu: 0, rMeno: 0,
  pvP: 0, mvP: 0, fmP: 0, gfP: 0, assP: 0,
  ammP: 0, espP: 0, rpP: 0, rcP: 0, gsP: 0, auP: 0, rPiuP: 0, rMenoP: 0, seed: true,
}));

/* ------------------------------------------------------------------ */
/*  PALETTE                                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  INGRESSO E PROFILI                                                 */
/* ------------------------------------------------------------------ */

/* Impronta della parola d'amministratore.
   Nel file pubblicato finisce solo questa, mai la parola in chiaro,
   cosi' chi guarda il sorgente della pagina non la trova. */
const IMPRONTA_ADMIN = "e2bed9230661a24ce3e2042a71c8f22044320e331ccbb80bd006e7b67b38f4cc";

/* dove ricordiamo l'ultima parola usata su questo dispositivo */
const CHIAVE_ULTIMO = "fanta:ultimoCodice";

/* ogni parola ha il suo cassetto di dati, separato dagli altri */
const chiaveStato = (codice) => "fanta:stato:" + codice;

/* il listone sta in un cassetto suo, uguale per tutti i profili,
   perche' e' grosso e cambia solo quando l'amministratore importa gli Excel */
const CHIAVE_LISTONE = "fanta:listone";

/* le probabili formazioni stanno in un cassetto loro, sempre uguale per tutti,
   perche' anche quelle le carica solo l'amministratore */
const CHIAVE_PROBABILI = "fanta:probabili";

/* la vecchia chiave unica, da prima che esistessero i profili.
   Alla prima entrata la travasiamo nel cassetto della parola usata. */
const CHIAVE_VECCHIA = "fanta:stato";

const C = {
  carta: "#F7E9EC",
  cartaScura: "#EEDADF",
  riga: "#DCC5CB",
  inchiostro: "#191419",
  inchiostroTenue: "#6B5B61",
  rosa: "#D02E5E",
  campo: "#1F6B4A",
  ocra: "#C8892A",
};

const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontVariantNumeric: "tabular-nums" };
const display = { fontFamily: "'Helvetica Neue', Inter, ui-sans-serif, system-ui, sans-serif", letterSpacing: "-0.03em" };

/* ------------------------------------------------------------------ */
/*  PROBABILI FORMAZIONI                                               */
/* ------------------------------------------------------------------ */

/* le tre fasce di titolarita', ognuna con il suo colore */
const COLORE_FASCIA = { titolare: C.campo, ballottaggio: C.ocra, riserva: C.inchiostroTenue };

/* la percentuale di un giocatore, zero se di lui non sappiamo niente */
const percDi = (prob, id) => prob?.[id]?.perc || 0;

/* quanti giorni sono passati da una data salvata, null se la data non c'e' */
function giorniDa(iso) {
  const t = Date.parse(iso || "");
  return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000);
}

/* data e ora in italiano, per la testata delle probabili */
function quandoLeggibile(iso) {
  const t = Date.parse(iso || "");
  if (isNaN(t)) return "";
  return new Date(t).toLocaleString("it-IT", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------------------------------------------ */
/*  UTILITY                                                            */
/* ------------------------------------------------------------------ */

const norm = (s) => String(s || "").trim();
const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; };

function mdBonus(media, tabella) {
  let b = 0;
  for (const riga of tabella) if (media >= riga.min) b = riga.bonus;
  return b;
}

/* matching bipartito slot <-> giocatori */
function assegna(slots, giocatori, ammesso) {
  const matchSlot = new Array(slots.length).fill(-1);
  const usato = new Array(giocatori.length).fill(false);

  function prova(gi, visti) {
    for (let si = 0; si < slots.length; si++) {
      if (visti[si]) continue;
      if (!ammesso(giocatori[gi], slots[si])) continue;
      visti[si] = true;
      if (matchSlot[si] === -1 || prova(matchSlot[si], visti)) {
        matchSlot[si] = gi;
        return true;
      }
    }
    return false;
  }
  for (let gi = 0; gi < giocatori.length; gi++) {
    if (usato[gi]) continue;
    prova(gi, new Array(slots.length).fill(false));
  }
  return matchSlot;
}

/* ------------------------------------------------------------------ */
/*  PRIMITIVE UI                                                       */
/* ------------------------------------------------------------------ */

function Btn({ children, onClick, attivo, piccolo, tono = "neutro", title }) {
  const toni = {
    neutro: attivo ? { bg: C.inchiostro, fg: C.carta } : { bg: "transparent", fg: C.inchiostro },
    rosa: attivo ? { bg: C.rosa, fg: "#fff" } : { bg: "transparent", fg: C.rosa },
    campo: attivo ? { bg: C.campo, fg: "#fff" } : { bg: "transparent", fg: C.campo },
  }[tono];
  return (
    <button
      title={title}
      onClick={onClick}
      className="border transition-colors"
      style={{
        ...display,
        background: toni.bg, color: toni.fg,
        borderColor: attivo ? "transparent" : C.riga,
        padding: piccolo ? "3px 8px" : "6px 12px",
        fontSize: piccolo ? 11 : 12.5,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        borderRadius: 2,
        whiteSpace: "nowrap",
      }}
    >{children}</button>
  );
}

function Pallino({ on, lettera, colore, onClick, title }) {
  return (
    <button
      onClick={onClick} title={title}
      className="flex items-center justify-center transition-all"
      style={{
        width: 19, height: 19, borderRadius: 2,
        border: `1.5px solid ${on ? colore : C.riga}`,
        background: on ? colore : "transparent",
        color: on ? "#fff" : C.inchiostroTenue,
        fontSize: 10, fontWeight: 800, ...display,
      }}
    >{lettera}</button>
  );
}

/* ------------------------------------------------------------------
   I ruoli.
   Il ruolo Classic e' uno solo e si mostra come quadratino pieno colorato.
   I ruoli Mantra sono piu' d'uno e si mostrano come pastiglie vuote.
   Forma diversa e colore diverso, cosi' non si confondono a colpo d'occhio.
------------------------------------------------------------------ */
const COLORE_R = { P: "#C8892A", D: "#1F6B4A", C: "#2E5E9E", A: "#D02E5E" };

function RuoloC({ r, grande }) {
  return (
    <span style={{
      ...mono, display: "inline-block", textAlign: "center", color: "#fff",
      background: COLORE_R[r] || C.inchiostroTenue, borderRadius: 2, fontWeight: 800,
      width: grande ? 21 : 17, height: grande ? 21 : 17,
      fontSize: grande ? 12.5 : 11, lineHeight: grande ? "21px" : "17px",
      textTransform: "none", letterSpacing: 0, flex: "0 0 auto",
    }}>{r}</span>
  );
}

function RuoliM({ rm, grande }) {
  if (!rm?.length) return null;
  return (
    <span className="inline-flex gap-1" style={{ verticalAlign: "middle" }}>
      {rm.map((x) => (
        <span key={x} style={{
          ...mono, border: `1px solid ${C.riga}`, background: "#fff", color: C.inchiostroTenue,
          borderRadius: 9, fontWeight: 700, textTransform: "none", letterSpacing: 0,
          padding: grande ? "1px 7px" : "0 5px",
          fontSize: grande ? 11.5 : 10, lineHeight: grande ? "17px" : "15px",
        }}>{x}</span>
      ))}
    </span>
  );
}

function BarraCrediti({ speso, budget }) {
  const pct = Math.min(100, (speso / budget) * 100);
  return (
    <div style={{ height: 6, background: C.cartaScura, borderRadius: 1, overflow: "hidden" }}>
      <div style={{
        width: `${pct}%`, height: "100%",
        background: pct > 90 ? C.rosa : pct > 70 ? C.ocra : C.campo,
        transition: "width .3s ease",
      }} />
    </div>
  );
}

/* Di quale listino sono i numeri che stai leggendo. Le quotazioni Mantra
   sono altre, e per circa un giocatore su tre sono diverse da quelle Classic.
   Il consiglio esce solo se un campionato Mantra ce l'hai davvero. */
function Listino({ mantraAttivo, leghe }) {
  const haMantra = leghe.some((l) => l.modalita === "mantra");
  return (
    <span style={{ ...mono, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".1em",
      color: mantraAttivo ? C.rosa : C.inchiostroTenue }}>
      quote {mantraAttivo ? "mantra" : "classic"}
      {!mantraAttivo && haMantra && (
        <span style={{ textTransform: "none", letterSpacing: 0, color: C.inchiostroTenue }}>
          {", per le mantra metti la "}
          <b style={{ color: C.rosa }}>★</b>
          {" su un campionato mantra"}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  SCHERMATA D'INGRESSO                                               */
/* ------------------------------------------------------------------ */

function Ingresso({ onEntra }) {
  const [parola, setParola] = useState("");
  const [avviso, setAvviso] = useState("");

  function conferma(e) {
    e.preventDefault();
    const c = pulisci(parola);
    if (c.length < 3) { setAvviso("Serve una parola di almeno tre lettere"); return; }
    onEntra(c);
  }

  return (
    <div style={{ background: C.carta, color: C.inchiostro, minHeight: "100vh", ...display,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onSubmit={conferma} style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.05em" }}>SALA ASTE</div>
        <div style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, textTransform: "uppercase",
          letterSpacing: "0.12em", marginTop: 2 }}>
          un solo giudizio, tutte le tue aste
        </div>

        <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: 14, marginTop: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>La tua parola</div>
          <div style={{ fontSize: 12.5, color: C.inchiostroTenue, marginTop: 4, lineHeight: 1.45 }}>
            Scegli una parola tua e usa sempre quella. I dati di ogni parola restano separati,
            quindi due persone sullo stesso dispositivo non si pestano i piedi.
          </div>
          <input
            value={parola}
            onChange={(e) => { setParola(e.target.value); setAvviso(""); }}
            autoFocus
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder="scrivi qui"
            style={{ width: "100%", marginTop: 12, padding: "11px 10px", border: `1.5px solid ${C.riga}`,
              borderRadius: 2, ...mono, fontSize: 16 }}
          />
          {avviso && <div style={{ ...mono, fontSize: 11.5, color: C.rosa, marginTop: 8 }}>{avviso}</div>}
          <button type="submit"
            style={{ width: "100%", marginTop: 12, padding: "11px 10px", borderRadius: 2,
              border: `1.5px solid ${C.inchiostro}`, background: C.inchiostro, color: C.carta,
              fontSize: 14, fontWeight: 700 }}>
            entra
          </button>
        </div>

        <div style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, marginTop: 12, lineHeight: 1.6 }}>
          La parola viene ricordata su questo dispositivo. Per cambiarla c'e' un tasto in alto a destra.
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  IMPOSTAZIONE INIZIALE                                              */
/*  Compare una volta sola, la prima volta che una parola entra.       */
/* ------------------------------------------------------------------ */

function Impostazione({ codice, onFatto }) {
  const vuota = (i) => ({
    id: "L" + (i + 1), nome: "Campionato " + (i + 1), budget: 500,
    modalita: "classic", rosaMax: { P: 3, D: 8, C: 8, A: 6 },
  });
  const [righe, setRighe] = useState([vuota(0)]);

  const cambia = (i, patch) => setRighe(righe.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const piu = () => righe.length < LEGHE_MAX && setRighe([...righe, vuota(righe.length)]);
  const meno = () => righe.length > 1 && setRighe(righe.slice(0, -1));

  return (
    <div style={{ background: C.carta, color: C.inchiostro, minHeight: "100vh", ...display, padding: "22px 16px 40px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.05em" }}>SALA ASTE</div>
        <div style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 2 }}>
          ciao {codice}
        </div>

        <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: 14, marginTop: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Quante aste fai quest'anno</div>
          <div style={{ fontSize: 13, color: C.inchiostroTenue, marginTop: 4, lineHeight: 1.45 }}>
            Una riga per ogni campionato. Metti il nome vero della lega, i crediti che avete deciso
            e il regolamento con cui giocate.
          </div>

          <div className="flex items-center gap-2 mt-3">
            <Btn onClick={meno}>−</Btn>
            <span style={{ ...mono, fontSize: 22, fontWeight: 700, minWidth: 26, textAlign: "center" }}>{righe.length}</span>
            <Btn onClick={piu}>+</Btn>
            <span style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".08em" }}>
              {righe.length === 1 ? "campionato" : "campionati"}
            </span>
          </div>

          {righe.map((r, i) => (
            <div key={i} className="flex items-center gap-2 mt-2">
              <input
                value={r.nome}
                onChange={(e) => cambia(i, { nome: e.target.value })}
                style={{ flex: 1, minWidth: 0, padding: "8px", border: `1px solid ${C.riga}`, borderRadius: 2, fontSize: 13.5, ...display }}
              />
              <input
                value={r.budget} inputMode="numeric"
                onChange={(e) => cambia(i, { budget: parseInt(e.target.value || 0, 10) })}
                style={{ width: 64, padding: "8px", border: `1px solid ${C.riga}`, borderRadius: 2, ...mono, fontSize: 13.5, textAlign: "center" }}
              />
              <Btn piccolo tono="rosa" attivo={r.modalita === "mantra"}
                onClick={() => cambia(i, { modalita: r.modalita === "mantra" ? "classic" : "mantra" })}>
                {r.modalita}
              </Btn>
            </div>
          ))}

          <button
            onClick={() => onFatto(righe.map((r, i) => ({ ...r, id: "L" + (i + 1), budget: r.budget || 500 })))}
            style={{
              width: "100%", marginTop: 16, padding: "12px", borderRadius: 2,
              border: `1.5px solid ${C.inchiostro}`, background: C.inchiostro, color: C.carta,
              fontSize: 14.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", ...display,
            }}>
            comincia
          </button>
        </div>

        <div style={{ background: "rgba(200,137,42,.14)", border: `1px solid ${C.ocra}`, borderRadius: 3, padding: "10px 12px", marginTop: 12, fontSize: 13, lineHeight: 1.45 }}>
          Niente di tutto questo è definitivo. Nomi, crediti, regolamento e numero di campionati
          si cambiano quando vuoi dal pannello <b>Dati</b>, anche a asta iniziata.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  APP                                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  const [avviato, setAvviato] = useState(false);   // ho gia' guardato se c'era una parola ricordata
  const [codice, setCodice] = useState(null);      // la parola con cui sono entrato
  const [pronto, setPronto] = useState(false);
  const [daConfigurare, setDaConfigurare] = useState(false);
  const [players, setPlayers] = useState(SEED);
  const [meta, setMeta] = useState({});       // id -> { interesse, tags, max{L1..}, note, leghe{} }
  const [aste, setAste] = useState({});       // legaId -> { rosa:[{id,prezzo}], altrui:[{id,prezzo,team}] }
  const [leghe, setLeghe] = useState(LEGHE_DEFAULT);
  const [mdTab, setMdTab] = useState(MD_DEFAULT);
  const [formazioni, setFormazioni] = useState({}); // legaId -> { modo, modulo, slots[] }
  const [probabili, setProbabili] = useState(null);  // { giornata, aggiornata, squadre[], aggiornatoIl }

  const [vista, setVista] = useState("listone");
  const [legaAttiva, setLegaAttiva] = useState("L1");
  const [sel, setSel] = useState(null);
  const [rinomina, setRinomina] = useState(null);   // id del campionato che stai rinominando dalla testata
  /* Quali campionati sono accesi in testata. Quasi ovunque ne vale uno solo,
     cioe' legaAttiva. Solo dentro Papabili se ne possono accendere piu' di uno. */
  const [legheScelte, setLegheScelte] = useState(["L1"]);

  const [q, setQ] = useState("");
  const [filtroRuolo, setFiltroRuolo] = useState("TUTTI");
  const [soloInteresse, setSoloInteresse] = useState(false);
  const [nascondiPresi, setNascondiPresi] = useState(true);
  const [soloTitolari, setSoloTitolari] = useState(false);
  const [ordine, setOrdine] = useState("priorita");

  /* ---------- chi sono ---------- */
  /* all'apertura guardo se su questo dispositivo era gia' rimasta una parola */
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(CHIAVE_ULTIMO);
        if (r && r.value) setCodice(r.value);
      } catch (e) { /* nessuna parola ricordata, mostro l'ingresso */ }
      setAvviato(true);
    })();
  }, []);

  /* vero solo se la parola usata e' quella d'amministratore */
  const admin = useMemo(() => !!codice && sha256(codice) === IMPRONTA_ADMIN, [codice]);

  function entra(c) {
    window.storage.set(CHIAVE_ULTIMO, c).catch(() => {});
    setCodice(c);
  }

  /* per uscire ricarico la pagina, cosi' non resta in giro nulla del profilo precedente */
  function esci() {
    window.storage.delete(CHIAVE_ULTIMO).catch(() => {});
    location.reload();
  }

  /* ---------- persistenza, prima il dispositivo poi la nuvola ---------- */
  /* teniamo da parte l'ultima cosa scritta, cosi' non riscriviamo mille volte la stessa */
  const ultimoProfilo = useRef("");
  const ultimoListone = useRef("");
  const ultimoProbabili = useRef("");
  const daRimandare = useRef(false);   // c'e' qualcosa che la nuvola non ha ricevuto

  const leggiLocale = async (k) => {
    try { const r = await window.storage.get(k); return r && r.value ? JSON.parse(r.value) : null; }
    catch (e) { return null; }
  };

  useEffect(() => {
    if (!codice) return;
    setPronto(false);
    (async () => {
      /* 1. quello che c'e' gia' su questo dispositivo, cosi' l'app parte subito anche senza rete */
      let profilo = await leggiLocale(chiaveStato(codice));
      let listone = await leggiLocale(CHIAVE_LISTONE);
      let probab = await leggiLocale(CHIAVE_PROBABILI);

      /* travaso dalla vecchia chiave unica, per chi arriva dalla versione precedente */
      if (!profilo || !listone) {
        const v = await leggiLocale(CHIAVE_VECCHIA);
        if (v) {
          if (!profilo) profilo = { meta: v.meta, aste: v.aste, leghe: v.leghe, formazioni: v.formazioni, mdTab: v.mdTab, aggiornatoIl: v.aggiornatoIl || "" };
          if (!listone && v.players?.length) listone = { players: v.players, aggiornatoIl: v.aggiornatoIl || "" };
        }
      }

      /* 2. quello che c'e' nella nuvola, se e' piu' recente vince */
      if (nuvola.nuvolaAccesa()) {
        nuvola.spia("cerco la nuvola");
        /* chiediamo le due righe insieme, e teniamo conto di quale delle due
           non ha risposto, altrimenti diremmo collegato anche quando non lo siamo */
        const esiti = await Promise.allSettled([
          nuvola.leggi(codice),
          nuvola.leggi(nuvola.RIGA_LISTONE),
          nuvola.leggi(nuvola.RIGA_PROBABILI),
        ]);
        const valore = (e) => (e.status === "fulfilled" ? e.value : null);
        const rProfilo = valore(esiti[0]), rListone = valore(esiti[1]), rProbabili = valore(esiti[2]);
        const guasto = esiti.some((e) => e.status === "rejected");

        if (rProfilo && (!profilo?.aggiornatoIl || rProfilo.aggiornato > profilo.aggiornatoIl)) {
          profilo = { ...rProfilo.dati, aggiornatoIl: rProfilo.aggiornato };
          try { await window.storage.set(chiaveStato(codice), JSON.stringify(profilo)); } catch (e) { /* memoria negata */ }
        }
        if (rListone && (!listone?.aggiornatoIl || rListone.aggiornato > listone.aggiornatoIl)) {
          listone = { ...rListone.dati, aggiornatoIl: rListone.aggiornato };
          try { await window.storage.set(CHIAVE_LISTONE, JSON.stringify(listone)); } catch (e) { /* memoria negata */ }
        }
        if (rProbabili && (!probab?.aggiornatoIl || rProbabili.aggiornato > probab.aggiornatoIl)) {
          probab = { ...rProbabili.dati, aggiornatoIl: rProbabili.aggiornato };
          try { await window.storage.set(CHIAVE_PROBABILI, JSON.stringify(probab)); } catch (e) { /* memoria negata */ }
        }

        if (guasto) {
          daRimandare.current = true;
          nuvola.spia("senza rete, lavoro qui", "avviso");
        } else {
          nuvola.spia("nuvola collegata");
        }
      }

      if (listone?.players?.length) setPlayers(listone.players);
      if (probab?.squadre?.length) setProbabili(probab);
      if (profilo) {
        setMeta(profilo.meta || {});
        setAste(profilo.aste || {});
        setLeghe(profilo.leghe || LEGHE_DEFAULT);
        setFormazioni(profilo.formazioni || {});
        setMdTab(profilo.mdTab || MD_DEFAULT);
      }

      /* segniamo cosa abbiamo appena caricato, cosi' il primo salvataggio non riparte a vuoto */
      /* nessun dato ne' qui ne' nella nuvola, e' la prima volta di questa parola */
      setDaConfigurare(!profilo);

      ultimoProfilo.current = JSON.stringify({ meta: profilo?.meta || {}, aste: profilo?.aste || {}, leghe: profilo?.leghe || LEGHE_DEFAULT, formazioni: profilo?.formazioni || {}, mdTab: profilo?.mdTab || MD_DEFAULT });
      ultimoListone.current = JSON.stringify(listone?.players?.length ? listone.players : SEED);
      ultimoProbabili.current = probab?.squadre?.length
        ? JSON.stringify({ giornata: probab.giornata || "", aggiornata: probab.aggiornata || "", squadre: probab.squadre })
        : "";
      setPronto(true);
    })();
  }, [codice]);

  /* salvataggio del profilo, roba piccola, ogni volta che tocchi qualcosa */
  const salvaRef = useRef(null);
  useEffect(() => {
    if (!pronto || !codice) return;
    const corpo = JSON.stringify({ meta, aste, leghe, formazioni, mdTab });
    if (corpo === ultimoProfilo.current) return;
    clearTimeout(salvaRef.current);
    salvaRef.current = setTimeout(async () => {
      ultimoProfilo.current = corpo;
      const quando = new Date().toISOString();
      const pacco = { meta, aste, leghe, formazioni, mdTab, aggiornatoIl: quando };
      try { await window.storage.set(chiaveStato(codice), JSON.stringify(pacco)); } catch (e) { /* memoria piena o negata */ }
      if (!nuvola.nuvolaAccesa()) return;
      try {
        await nuvola.scrivi(codice, { meta, aste, leghe, formazioni, mdTab }, quando);
        nuvola.spia("salvato nella nuvola");
      } catch (e) {
        nuvola.spia("salvato solo qui, riprovo", "avviso");
        daRimandare.current = true;
      }
    }, 700);
  }, [meta, aste, leghe, formazioni, mdTab, pronto, codice]);

  /* salvataggio del listone, roba grossa, solo quando cambia davvero.
     Nella nuvola lo manda soltanto l'amministratore. */
  const salvaListoneRef = useRef(null);
  useEffect(() => {
    if (!pronto || !codice) return;
    const corpo = JSON.stringify(players);
    if (corpo === ultimoListone.current) return;
    clearTimeout(salvaListoneRef.current);
    salvaListoneRef.current = setTimeout(async () => {
      ultimoListone.current = corpo;
      const quando = new Date().toISOString();
      try { await window.storage.set(CHIAVE_LISTONE, JSON.stringify({ players, aggiornatoIl: quando })); } catch (e) { /* memoria piena */ }
      if (!admin || !nuvola.nuvolaAccesa()) return;
      nuvola.spia("mando il listone");
      try {
        await nuvola.scrivi(nuvola.RIGA_LISTONE, { players }, quando);
        nuvola.spia("listone pubblicato");
      } catch (e) {
        nuvola.spia("listone non spedito, riprovo", "avviso");
        daRimandare.current = true;
      }
    }, 1200);
  }, [players, pronto, codice, admin]);

  /* Salvataggio delle probabili, come il listone. Nella nuvola le manda
     soltanto l'amministratore, tutti gli altri le leggono e basta. */
  const salvaProbabiliRef = useRef(null);
  useEffect(() => {
    if (!pronto || !codice || !probabili?.squadre?.length) return;
    const dati = { giornata: probabili.giornata || "", aggiornata: probabili.aggiornata || "", squadre: probabili.squadre };
    const corpo = JSON.stringify(dati);
    if (corpo === ultimoProbabili.current) return;
    clearTimeout(salvaProbabiliRef.current);
    salvaProbabiliRef.current = setTimeout(async () => {
      ultimoProbabili.current = corpo;
      /* questa e' solo la data tecnica della riga, serve alla nuvola per capire
         quale versione e' la piu' recente. La data che si vede nell'app e'
         un'altra, la dice la pagina di Fantacalcio.it. */
      const quando = probabili.aggiornatoIl || new Date().toISOString();
      try { await window.storage.set(CHIAVE_PROBABILI, JSON.stringify({ ...dati, aggiornatoIl: quando })); } catch (e) { /* memoria piena */ }
      if (!admin || !nuvola.nuvolaAccesa()) return;
      nuvola.spia("mando le probabili");
      try {
        await nuvola.scrivi(nuvola.RIGA_PROBABILI, dati, quando);
        nuvola.spia("probabili pubblicate");
      } catch (e) {
        nuvola.spia("probabili non spedite, riprovo", "avviso");
        daRimandare.current = true;
      }
    }, 1200);
  }, [probabili, pronto, codice, admin]);

  /* se la rete torna, riproviamo a spedire quello che era rimasto qui */
  useEffect(() => {
    const alRitorno = async () => {
      if (!daRimandare.current || !codice || !nuvola.nuvolaAccesa()) return;
      daRimandare.current = false;
      const quando = new Date().toISOString();
      try {
        await nuvola.scrivi(codice, { meta, aste, leghe, formazioni, mdTab }, quando);
        if (admin) await nuvola.scrivi(nuvola.RIGA_LISTONE, { players }, quando);
        if (admin && probabili?.squadre?.length) {
          await nuvola.scrivi(
            nuvola.RIGA_PROBABILI,
            { giornata: probabili.giornata || "", aggiornata: probabili.aggiornata || "", squadre: probabili.squadre },
            probabili.aggiornatoIl || quando,
          );
        }
        nuvola.spia("rimesso in pari");
      } catch (e) { daRimandare.current = true; }
    };
    window.addEventListener("online", alRitorno);
    return () => window.removeEventListener("online", alRitorno);
  }, [codice, admin, meta, aste, leghe, formazioni, mdTab, players, probabili]);

  /* Fuori da Papabili il campionato acceso e' sempre e solo uno, quindi
     uscendo dal pannello la testata torna com'era. */
  useEffect(() => {
    if (vista !== "papabili") setLegheScelte([legaAttiva]);
  }, [vista, legaAttiva]);

  /* Il campionato principale e' quello che decide le quote, classic oppure
     mantra, e vale anche per le altre schede. Si sceglie con la stella. */
  function scegliPrincipale(lid) {
    setLegaAttiva(lid);
    /* se lo eleggi da Papabili mentre era spento, lo accendiamo, altrimenti
       comanderebbe le quote un campionato che non stai neanche guardando */
    if (vista === "papabili" && !legheScelte.includes(lid)) setLegheScelte([...legheScelte, lid]);
  }

  /* Il tocco sulle carte dei campionati. Nelle altre schede sceglie e basta,
     in Papabili accende e spegne, cosi' se ne guardano due o tre insieme. */
  function toccaLega(lid) {
    if (vista !== "papabili") { setLegaAttiva(lid); return; }
    const on = legheScelte.includes(lid);
    const nuove = on ? legheScelte.filter((x) => x !== lid) : [...legheScelte, lid];
    setLegheScelte(nuove);
    /* la lega principale resta una sola, la usano le altre schede e le quotazioni Mantra */
    if (nuove.length && !nuove.includes(legaAttiva)) {
      setLegaAttiva(leghe.find((l) => nuove.includes(l.id)).id);
    }
  }

  /* ---------- helper stato ---------- */
  const m = (id) => meta[id] || { interesse: 0, tags: [], max: {}, note: "", leghe: {} };
  const setM = (id, patch) => setMeta((p) => ({ ...p, [id]: { ...m(id), ...patch } }));

  const asta = (lid) => aste[lid] || { rosa: [], altrui: [] };
  const setAsta = (lid, patch) => setAste((p) => ({ ...p, [lid]: { ...asta(lid), ...patch } }));

  const statoIn = (id, lid) => {
    const a = asta(lid);
    if (a.rosa.find((x) => x.id === id)) return "mio";
    if (a.altrui.find((x) => x.id === id)) return "altrui";
    return "libero";
  };
  const prezzoIn = (id, lid) => {
    const a = asta(lid);
    return (a.rosa.find((x) => x.id === id) || a.altrui.find((x) => x.id === id))?.prezzo ?? null;
  };

  const nLeghe = (id) => leghe.filter((l) => m(id).leghe[l.id]).length;

  /* ---------- rigoristi ----------
     Non c'e' una colonna che lo dica, si ricava dai rigori calciati. Dentro ogni
     squadra vince chi ne ha battuti di piu', prima guardando la stagione in corso
     e poi quella scorsa. Primo e secondo, gli altri non contano. */
  const rigoristi = useMemo(() => {
    const perSquadra = new Map();
    for (const g of players) {
      const peso = pesoRigori(g);
      if (!peso) continue;
      const l = perSquadra.get(g.squadra) || [];
      l.push(g);
      perSquadra.set(g.squadra, l);
    }
    const out = {};
    for (const l of perSquadra.values()) {
      l.sort((a, b) => pesoRigori(b) - pesoRigori(a) || (b.fvm || 0) - (a.fvm || 0));
      if (l[0]) out[l[0].id] = 1;
      if (l[1]) out[l[1].id] = 2;
    }
    return out;
  }, [players]);

  /* ---------- probabili formazioni ----------
     Dalla pagina salvata ricaviamo una mappa Id -> titolarita'. L'aggancio e'
     sull'Id, lo stesso degli Excel, quindi non confrontiamo mai i nomi. */
  const probPerId = useMemo(() => mappaPerId(probabili), [probabili]);

  /* se la lega che stai guardando e' Mantra, mostriamo le quotazioni Mantra */
  const mantraAttivo = (leghe.find((l) => l.id === legaAttiva)?.modalita) === "mantra";

  const speso = (lid) => asta(lid).rosa.reduce((s, x) => s + x.prezzo, 0);
  const lega = (lid) => leghe.find((l) => l.id === lid);

  /* ---------- azioni asta ---------- */
  function assegnaGiocatore(id, lid, prezzo, aChi, team = "") {
    const a = asta(lid);
    const rosa = a.rosa.filter((x) => x.id !== id);
    const altrui = a.altrui.filter((x) => x.id !== id);
    if (aChi === "mio") rosa.push({ id, prezzo });
    /* team e' l'identificativo dell'avversario che se l'e' aggiudicato.
       Vuoto vuol dire che non lo sappiamo, e va bene lo stesso. */
    if (aChi === "altrui") altrui.push({ id, prezzo, team });
    setAsta(lid, { rosa, altrui });
  }

  /* ---------- gli altri della lega ----------
     Stanno dentro la configurazione del campionato, perche' cambiano da lega a lega.
     Sono solo un nome con un identificativo che non cambia mai, cosi' rinominare
     una squadra non stacca i giocatori che le avevi assegnato. */
  const rivaliDi = (lid) => (leghe.find((l) => l.id === lid)?.rivali) || [];

  function aggiungiRivale(lid, nome) {
    const puliti = String(nome || "").trim();
    if (!puliti) return null;
    const gia = rivaliDi(lid);
    /* il primo identificativo libero, S1 S2 S3 e cosi' via */
    let n = 1;
    while (gia.some((r) => r.id === "S" + n)) n++;
    const nuovo = { id: "S" + n, nome: puliti };
    setLeghe(leghe.map((l) => l.id === lid ? { ...l, rivali: [...gia, nuovo] } : l));
    return nuovo.id;
  }

  function rinominaRivale(lid, rid, nome) {
    setLeghe(leghe.map((l) => l.id === lid
      ? { ...l, rivali: rivaliDi(lid).map((r) => r.id === rid ? { ...r, nome } : r) }
      : l));
  }

  /* Togliendo una squadra i suoi acquisti restano, ma senza padrone.
     Meglio cosi' che cancellarli, i prezzi visti all'asta sono comunque utili. */
  function togliRivale(lid, rid) {
    setLeghe(leghe.map((l) => l.id === lid
      ? { ...l, rivali: rivaliDi(lid).filter((r) => r.id !== rid) }
      : l));
  }
  function liberaGiocatore(id, lid) {
    const a = asta(lid);
    setAsta(lid, { rosa: a.rosa.filter((x) => x.id !== id), altrui: a.altrui.filter((x) => x.id !== id) });
  }

  /* ---------- import ---------- */
  async function importaFile(file, stagione = "corrente") {
    const buf = await file.arrayBuffer();
    await caricaXLSX();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const grezzo = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    const hi = grezzo.findIndex((r) => r.some((c) => /^id$/i.test(norm(c))));
    if (hi === -1) return { ok: false, msg: "Nessuna colonna Id trovata nel file" };

    const head = grezzo[hi].map((c) => norm(c).toLowerCase().replace(/\./g, ""));
    const idx = (...nomi) => { for (const n of nomi) { const i = head.indexOf(n); if (i > -1) return i; } return -1; };

    const cId = idx("id"), cR = idx("r"), cRM = idx("rm"), cNome = idx("nome"), cSq = idx("squadra");
    const cQt = idx("qta", "qt a"), cQtI = idx("qti", "qt i"), cFvm = idx("fvm");
    /* le colonne Mantra, nel file si chiamano Qt.A M, Qt.I M e FVM M */
    const cQtM = idx("qta m", "qt a m"), cQtIM = idx("qti m", "qt i m"), cFvmM = idx("fvm m");
    const cPv = idx("pv"), cMv = idx("mv"), cFm = idx("fm"), cGf = idx("gf"),
      cAss = idx("ass"), cAmm = idx("amm"), cEsp = idx("esp"), cRp = idx("rp"), cRc = idx("rc"),
      cGs = idx("gs"), cAu = idx("au"), cRPiu = idx("r+"), cRMeno = idx("r-");

    const righe = grezzo.slice(hi + 1).filter((r) => norm(r[cId]));
    const isStat = cPv > -1 && cMv > -1;

    /* Le quotazioni di una stagione passata non devono sovrascrivere quelle buone.
       Le statistiche vecchie invece servono, finiscono nei campi con la P. */
    if (!isStat && stagione === "precedente") {
      return { ok: false, msg: `${file.name} sono quotazioni vecchie, saltate` };
    }

    let ignorate = 0;
    setPlayers((prev) => {
      const mappa = new Map(prev.filter((p) => !p.seed).map((p) => [p.id, p]));
      const visti = new Set();
      for (const r of righe) {
        const id = norm(r[cId]);
        /* Chi c'e' nel listone lo dicono le quotazioni. I file di statistiche
           contengono anche chi ha lasciato la serie A, e quelli non ci servono. */
        if (isStat && !mappa.has(id)) { ignorate++; continue; }
        const base = mappa.get(id) || {
          id, nome: norm(r[cNome]), squadra: norm(r[cSq]),
          r: norm(r[cR]) || "C", rm: norm(r[cRM]).split(";").map(norm).filter(Boolean),
          qt: 0, qtI: 0, fvm: 0, qtM: 0, qtIM: 0, fvmM: 0,
          pv: 0, mv: 0, fm: 0, gf: 0, ass: 0,
          amm: 0, esp: 0, rp: 0, rc: 0, gs: 0, au: 0, rPiu: 0, rMeno: 0,
          pvP: 0, mvP: 0, fmP: 0, gfP: 0, assP: 0,
          ammP: 0, espP: 0, rpP: 0, rcP: 0, gsP: 0, auP: 0, rPiuP: 0, rMenoP: 0,
        };
        /* Nome, squadra e ruoli li decide solo la stagione in corso. Anche i file di
           statistiche hanno queste colonne, ma quelli dell'anno scorso portano la
           squadra vecchia e a volte un ruolo diverso, e riscriverebbero i dati buoni. */
        if (stagione !== "precedente") {
          if (cNome > -1 && norm(r[cNome])) base.nome = norm(r[cNome]);
          if (cSq > -1 && norm(r[cSq])) base.squadra = norm(r[cSq]);
          if (cR > -1 && norm(r[cR])) base.r = norm(r[cR]);
          if (cRM > -1 && norm(r[cRM])) base.rm = norm(r[cRM]).split(";").map(norm).filter(Boolean);
        }

        if (isStat) {
          const dest = stagione === "precedente" ? "P" : "";
          base["pv" + dest] = num(r[cPv]); base["mv" + dest] = num(r[cMv]);
          base["fm" + dest] = num(r[cFm]); base["gf" + dest] = num(r[cGf]);
          base["ass" + dest] = num(r[cAss]);
          /* anche i numeri di contorno, per tutte e due le stagioni */
          base["amm" + dest] = num(r[cAmm]); base["esp" + dest] = num(r[cEsp]);
          base["rp" + dest] = num(r[cRp]); base["rc" + dest] = num(r[cRc]);
          base["gs" + dest] = num(r[cGs]); base["au" + dest] = num(r[cAu]);
          base["rPiu" + dest] = num(r[cRPiu]); base["rMeno" + dest] = num(r[cRMeno]);
        } else {
          if (cQt > -1) base.qt = num(r[cQt]);
          if (cQtI > -1) base.qtI = num(r[cQtI]);
          if (cFvm > -1) base.fvm = num(r[cFvm]);
          base.qtM = cQtM > -1 ? num(r[cQtM]) : base.qt;
          base.qtIM = cQtIM > -1 ? num(r[cQtIM]) : base.qtI;
          base.fvmM = cFvmM > -1 ? num(r[cFvmM]) : base.fvm;
        }
        visti.add(id);
        mappa.set(id, base);
      }
      /* Le quotazioni della stagione in corso dicono chi c'e' in serie A quest'anno.
         Chi non e' in quel file ha cambiato campionato, e se lo lasciassimo dentro
         resterebbe per sempre con la squadra dell'anno scorso. Lo togliamo.
         La soglia serve a non svuotare il listone per colpa di un file monco. */
      if (!isStat && stagione !== "precedente" && righe.length >= 100) {
        for (const id of [...mappa.keys()]) {
          if (!visti.has(id)) mappa.delete(id);
        }
      }
      return [...mappa.values()];
    });
    /* il conteggio degli scarti lo sapremmo solo dopo, quindi qui diciamo
       le righe lette e il totale vero lo mostra il contatore qui sotto */
    const quali = stagione === "precedente" ? ", stagione scorsa" : "";
    /* il conteggio dei tolti si saprebbe solo dopo, quindi diciamo la cosa
       che e' sempre vera, cioe' che il listone e' stato riallineato a questo file */
    const fuori = !isStat && stagione !== "precedente" && righe.length >= 100
      ? ", listone riallineato a questo file" : "";
    return { ok: true, msg: `${righe.length} righe lette da ${file.name}${quali}${fuori}` };
  }

  /* ---------- import delle probabili ----------
     Si parte dalla pagina di Fantacalcio.it salvata dal browser come
     Pagina web solo HTML. La data e la giornata le dice la pagina stessa,
     non le inventiamo noi. Se non ci sono, non si mostra niente. */
  async function importaProbabili(file) {
    let letto;
    try {
      letto = leggiProbabili(await file.text());
    } catch (e) {
      return { ok: false, msg: `Non sono riuscito a leggere ${file.name}` };
    }
    if (!letto.squadre.length) {
      return { ok: false, msg: `In ${file.name} non ho trovato nessuna squadra. Serve la pagina delle probabili salvata come Pagina web solo HTML` };
    }

    /* chi c'e' nel listone lo dicono le quotazioni, quindi l'aggancio si conta su quelli */
    const noti = new Set(players.filter((p) => !p.seed).map((p) => p.id));
    const tutti = letto.squadre.flatMap((sq) => sq.giocatori);
    const fuori = noti.size ? tutti.filter((g) => !noti.has(g.id)) : [];

    setProbabili({
      giornata: letto.giornata,
      aggiornata: letto.aggiornata,
      squadre: letto.squadre,
      aggiornatoIl: new Date().toISOString(),
    });

    return {
      ok: true,
      squadre: letto.squadre.length,
      giocatori: tutti.length,
      titolari: tutti.filter((g) => g.titolare).length,
      giornata: letto.giornata,
      aggiornata: letto.aggiornata,
      senzaListone: !noti.size,
      fuori: fuori.map((g) => `${g.nome} (${g.id})`),
    };
  }

  /* ---------- lista filtrata ---------- */
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    let out = players.filter((p) => {
      if (t && !(p.nome.toLowerCase().includes(t) || p.squadra.toLowerCase().includes(t))) return false;
      if (filtroRuolo === "RIG") { if (!rigoristi[p.id]) return false; }
      else if (filtroRuolo !== "TUTTI" && p.r !== filtroRuolo) return false;
      /* "solo target" tiene chi hai giudicato da Mi piace in su, ma anche chi hai
         semplicemente segnato per un campionato, perche' anche quello e' un target */
      if (soloInteresse && m(p.id).interesse < 3 && nLeghe(p.id) === 0) return false;
      if (nascondiPresi && statoIn(p.id, legaAttiva) !== "libero") return false;
      /* solo titolari, cioe' chi nelle probabili sta dall'ottanta per cento in su */
      if (soloTitolari && fasciaTitolarita(percDi(probPerId, p.id)) !== "titolare") return false;
      return true;
    });
    const cmp = {
      priorita: (a, b) => (nLeghe(b.id) - nLeghe(a.id)) || (m(b.id).interesse - m(a.id).interesse) || (b.fvm - a.fvm),
      quota: (a, b) => quotaDi(b, mantraAttivo) - quotaDi(a, mantraAttivo),
      fvm: (a, b) => valoreDi(b, mantraAttivo) - valoreDi(a, mantraAttivo),
      fm: (a, b) => (b.fmP || b.fm) - (a.fmP || a.fm),
      rigori: (a, b) => pesoRigori(b) - pesoRigori(a) || (rigoristi[a.id] || 9) - (rigoristi[b.id] || 9),
      nome: (a, b) => a.nome.localeCompare(b.nome),
    }[filtroRuolo === "RIG" ? "rigori" : ordine];
    return out.sort(cmp);
  }, [players, meta, aste, q, filtroRuolo, soloInteresse, nascondiPresi, soloTitolari, ordine, legaAttiva, leghe, mantraAttivo, rigoristi, probPerId]);

  /* prima di tutto, chi sei */
  if (!avviato) return <div style={{ padding: 40, ...mono, background: C.carta, minHeight: "100vh" }}>Un attimo</div>;
  if (!codice) return <Ingresso onEntra={entra} />;
  if (!pronto) return <div style={{ padding: 40, ...mono, background: C.carta, minHeight: "100vh" }}>Carico i dati salvati</div>;

  if (daConfigurare) return (
    <Impostazione
      codice={codice}
      onFatto={(nuove) => {
        setLeghe(nuove);
        setLegaAttiva(nuove[0].id);
        setDaConfigurare(false);
      }}
    />
  );

  /* ================================================================ */
  return (
    <div style={{ background: C.carta, color: C.inchiostro, minHeight: "100vh", ...display }}>
      {/* TESTATA */}
      <header style={{ borderBottom: `2px solid ${C.inchiostro}`, padding: "10px 14px" }}>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.05em" }}>SALA ASTE</span>
          <span style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            {leghe.length === 1 ? "un campionato" : leghe.length + " campionati"}, un solo giudizio
          </span>

          {/* chi sta usando l'app, con il tasto per cambiare parola */}
          <button onClick={() => { if (confirm("Esco da " + codice + " e torno alla schermata d'ingresso")) esci(); }}
            title="cambia parola"
            style={{ marginLeft: "auto", ...mono, fontSize: 10.5, textTransform: "uppercase",
              letterSpacing: "0.08em", color: C.inchiostroTenue, border: `1px solid ${C.riga}`,
              borderRadius: 2, padding: "3px 7px", background: "#fff" }}>
            {codice}{admin ? " ✦" : ""} <span style={{ opacity: .55 }}>cambia</span>
          </button>
        </div>

        {/* selettore lega con crediti */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {leghe.map((l) => {
            const sp = speso(l.id);
            /* in Papabili sono accesi quelli scelti, altrove solo quello attivo */
            const att = vista === "papabili" ? legheScelte.includes(l.id) : l.id === legaAttiva;
            const inModifica = rinomina === l.id;
            return (
              <div key={l.id} role="button" tabIndex={0}
                title={vista === "papabili" ? (att ? "spegni " + l.nome : "accendi " + l.nome) : l.nome}
                onClick={() => !inModifica && toccaLega(l.id)}
                onKeyDown={(e) => { if (!inModifica && (e.key === "Enter" || e.key === " ")) toccaLega(l.id); }}
                style={{
                  flex: "1 1 150px", textAlign: "left", padding: "7px 9px", borderRadius: 3,
                  border: `1.5px solid ${att ? C.inchiostro : C.riga}`,
                  background: att ? "#fff" : "transparent",
                  cursor: "pointer",
                }}>
                <div className="flex justify-between items-baseline gap-1">
                  {inModifica ? (
                    <input
                      autoFocus
                      value={l.nome}
                      onChange={(e) => setLeghe(leghe.map((x) => x.id === l.id ? { ...x, nome: e.target.value } : x))}
                      onBlur={() => setRinomina(null)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setRinomina(null); }}
                      style={{ flex: 1, minWidth: 0, padding: "2px 5px", border: `1px solid ${C.rosa}`, borderRadius: 2, fontSize: 12.5, fontWeight: 700, ...display }}
                    />
                  ) : (
                    <span className="flex items-baseline gap-1 min-w-0" style={{ flex: 1 }}>
                      {/* la stella dice qual e' il principale, e sugli altri serve per eleggerlo */}
                      <button
                        title={l.id === legaAttiva
                          ? "campionato principale, decide se le quote sono classic o mantra"
                          : "scegli " + l.nome + " come campionato principale"}
                        onClick={(e) => { e.stopPropagation(); scegliPrincipale(l.id); }}
                        style={{ fontSize: 12, lineHeight: 1, padding: "0 1px", flex: "0 0 auto",
                          color: l.id === legaAttiva ? C.rosa : C.inchiostroTenue,
                          opacity: l.id === legaAttiva ? 1 : .5 }}>
                        {l.id === legaAttiva ? "★" : "☆"}
                      </button>
                      {/* Il nome si rinomina toccandolo, ma solo sul campionato principale.
                          Sugli altri il tocco deve restare quello della carta, cioe' sceglierlo,
                          altrimenti chi vuole cambiare campionato si ritrova a scrivere il nome. */}
                      <span
                        title={l.id === legaAttiva ? "tocca il nome per rinominare " + l.nome : l.nome}
                        onClick={(e) => { if (l.id !== legaAttiva) return; e.stopPropagation(); setRinomina(l.id); }}
                        style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis",
                          whiteSpace: "nowrap", cursor: l.id === legaAttiva ? "text" : "pointer",
                          borderBottom: l.id === legaAttiva ? `1px dotted ${C.riga}` : "none" }}>
                        {l.nome}
                      </span>
                    </span>
                  )}
                  <span style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, textTransform: "uppercase" }}>
                    {l.modalita}
                  </span>
                </div>
                <div style={{ ...mono, fontSize: 15, fontWeight: 700, margin: "2px 0 4px" }}>
                  {l.budget - sp}<span style={{ fontSize: 10, color: C.inchiostroTenue }}> /{l.budget}</span>
                  <span style={{ fontSize: 10, color: C.inchiostroTenue, marginLeft: 8 }}>{asta(l.id).rosa.length} gioc.</span>
                </div>
                <BarraCrediti speso={sp} budget={l.budget} />
              </div>
            );
          })}
        </div>

        <nav className="flex gap-1 mt-3 barra">
          {[["listone", "Listone"], ["papabili", "Papabili"], ["asta", "Asta live"], ["tracker", "Aste Tracker"], ["campo", "Campo"], ["probabili", "Probabili"], ["dati", "Dati"], ["guida", "Guida"]].map(([k, v]) => (
            <Btn key={k} attivo={vista === k} onClick={() => setVista(k)}>{v}</Btn>
          ))}
        </nav>
      </header>

      <main style={{ padding: 12, paddingBottom: 90 }}>
        {vista === "listone" && (
          <Listone {...{ lista, q, setQ, filtroRuolo, setFiltroRuolo, soloInteresse, setSoloInteresse, nascondiPresi, setNascondiPresi, soloTitolari, setSoloTitolari, ordine, setOrdine, leghe, m, setM, nLeghe, statoIn, prezzoIn, legaAttiva, mantraAttivo, rigoristi, probPerId, setSel }} />
        )}
        {vista === "papabili" && (
          <Papabili {...{ players, m, setM, leghe, legaAttiva, legheScelte, setLegheScelte, statoIn, prezzoIn, liberaGiocatore, mantraAttivo, rigoristi, probPerId, nLeghe, setSel }} />
        )}
        {vista === "asta" && (
          <AstaLive {...{ lista, q, setQ, filtroRuolo, setFiltroRuolo, leghe, lega, legaAttiva, mantraAttivo, rigoristi, probPerId, m, nLeghe, statoIn, prezzoIn, assegnaGiocatore, liberaGiocatore, asta, speso, players, setSel, rivaliDi, aggiungiRivale }} />
        )}
        {vista === "tracker" && (
          <Tracker {...{ leghe, legaAttiva, asta, speso, players, rivaliDi, setSel }} />
        )}
        {vista === "campo" && (
          <Campo {...{ lega, legaAttiva, asta, players, mdTab, setLeghe, leghe, formazioni, setFormazioni, m, statoIn }} />
        )}
        {vista === "probabili" && (
          <Probabili {...{ probabili, players, leghe, m, nLeghe, statoIn, setSel }} />
        )}
        {vista === "guida" && <Guida />}
        {vista === "dati" && (
          <Dati {...{ importaFile, importaProbabili, probabili, setProbabili, players, setPlayers, leghe, setLeghe, meta, aste, formazioni, setMeta, setAste, setFormazioni, legaAttiva, setLegaAttiva, mdTab, setMdTab, admin, codice, rivaliDi, aggiungiRivale, rinominaRivale, togliRivale }} />
        )}
      </main>

      {sel && (
        <Scheda
          p={players.find((x) => x.id === sel)}
          {...{ m, setM, leghe, statoIn, prezzoIn, assegnaGiocatore, liberaGiocatore, legaAttiva, mantraAttivo, rigoristi }}
          prob={probPerId[sel]}
          chiudi={() => setSel(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RIGA GIOCATORE                                                     */
/* ------------------------------------------------------------------ */

function Riga({ p, leghe, m, setM, nLeghe, statoIn, prezzoIn, legaAttiva, mantraAttivo, rigoristi, probPerId, onApri, compatta }) {
  const mm = m(p.id);
  const inter = INTERESSE[mm.interesse];
  const stato = statoIn(p.id, legaAttiva);
  const n = nLeghe(p.id);
  /* quanto e' dato titolare nelle probabili, zero se di lui non sappiamo niente */
  const perc = percDi(probPerId, p.id);

  return (
    <div
      className="flex items-center gap-2"
      style={{
        borderBottom: `1px solid ${C.riga}`,
        padding: "7px 6px",
        background: stato === "mio" ? "rgba(31,107,74,.09)" : stato === "altrui" ? "rgba(0,0,0,.04)" : n >= 2 ? "rgba(208,46,94,.05)" : "transparent",
        opacity: stato === "altrui" ? 0.5 : 1,
      }}
    >
      {/* barretta interesse */}
      <div style={{ width: 3, alignSelf: "stretch", background: mm.interesse ? inter.col : "transparent", borderRadius: 2 }} />

      {/* ruolo Classic, quadratino colorato */}
      <RuoloC r={p.r} />

      {/* nome */}
      <button onClick={onApri} className="flex-1 text-left min-w-0">
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.nome}
        </div>
        <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".06em" }}>
          {p.squadra}
          {perc ? <b style={{ color: COLORE_FASCIA[fasciaTitolarita(perc)] }}>{" " + perc + "%"}</b> : ""}
          {p.rm?.length ? <>{" "}<RuoliM rm={p.rm} /></> : null}
          {rigoristi?.[p.id] ? <b style={{ color: C.rosa }}>{" · rig " + rigoristi[p.id]}</b> : ""}{prezzoIn(p.id, legaAttiva) != null ? ` · pagato ${prezzoIn(p.id, legaAttiva)}` : ""}
        </div>
      </button>

      {/* numeri */}
      {!compatta && (
        <div style={{ ...mono, fontSize: 11, textAlign: "right", minWidth: 52, color: C.inchiostroTenue }}>
          <div><b style={{ color: C.inchiostro, fontSize: 12.5 }}>{quotaDi(p, mantraAttivo)}</b> qt</div>
          <div>{valoreDi(p, mantraAttivo)} fvm</div>
        </div>
      )}

      {/* tre bollini lega, elemento firma */}
      <div className="flex gap-1">
        {leghe.map((l, i) => (
          <Pallino
            key={l.id}
            lettera={i + 1}
            on={!!mm.leghe[l.id]}
            colore={statoIn(p.id, l.id) === "mio" ? C.campo : statoIn(p.id, l.id) === "altrui" ? "#9C8F94" : C.rosa}
            title={`${l.nome}, ${statoIn(p.id, l.id)}`}
            onClick={() => setM(p.id, { leghe: { ...mm.leghe, [l.id]: !mm.leghe[l.id] } })}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  VISTA LISTONE                                                      */
/* ------------------------------------------------------------------ */

function Listone(props) {
  const { lista, q, setQ, filtroRuolo, setFiltroRuolo, soloInteresse, setSoloInteresse, nascondiPresi, setNascondiPresi, soloTitolari, setSoloTitolari, ordine, setOrdine, probPerId, setSel } = props;
  /* il filtro dei titolari ha senso solo se le probabili sono state caricate */
  const conProbabili = Object.keys(probPerId || {}).length > 0;
  return (
    <>
      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Cerca giocatore o squadra"
        style={{ width: "100%", padding: "9px 11px", border: `1.5px solid ${C.riga}`, background: "#fff", borderRadius: 3, fontSize: 15, ...display }}
      />
      <div className="flex gap-1 mt-2 flex-wrap">
        {["TUTTI", ...RUOLI_C].map((r) => (
          <Btn key={r} piccolo attivo={filtroRuolo === r} onClick={() => setFiltroRuolo(r)}>{r}</Btn>
        ))}
        {/* i rigoristi non sono un ruolo, ma qui e' il posto dove uno li cerca */}
        <Btn piccolo tono="rosa" attivo={filtroRuolo === "RIG"}
          onClick={() => setFiltroRuolo(filtroRuolo === "RIG" ? "TUTTI" : "RIG")}>rigoristi</Btn>
        <Btn piccolo tono="rosa" attivo={soloInteresse} onClick={() => setSoloInteresse(!soloInteresse)}>solo target</Btn>
        <Btn piccolo attivo={nascondiPresi} onClick={() => setNascondiPresi(!nascondiPresi)}>nascondi presi</Btn>
        {conProbabili && (
          <Btn piccolo tono="campo" attivo={soloTitolari} onClick={() => setSoloTitolari(!soloTitolari)}>solo titolari</Btn>
        )}
      </div>
      <div className="flex gap-1 mt-1 flex-wrap items-center">
        <span style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, textTransform: "uppercase" }}>ordina</span>
        {filtroRuolo === "RIG" ? (
          <span style={{ ...mono, fontSize: 10.5, color: C.rosa, textTransform: "uppercase", letterSpacing: ".06em" }}>
            per rigori battuti
          </span>
        ) : (
          [["priorita", "priorità"], ["quota", "quota"], ["fvm", "fvm"], ["fm", "fantamedia"], ["nome", "nome"]].map(([k, v]) => (
            <Btn key={k} piccolo attivo={ordine === k} onClick={() => setOrdine(k)}>{v}</Btn>
          ))
        )}
      </div>

      <div className="flex items-baseline gap-2 flex-wrap" style={{ margin: "10px 0 2px" }}>
        <span style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".1em" }}>
          {lista.length} giocatori
        </span>
        <Listino mantraAttivo={props.mantraAttivo} leghe={props.leghe} />
      </div>
      <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3 }}>
        {lista.slice(0, 300).map((p) => (
          <Riga key={p.id} p={p} {...props} onApri={() => setSel(p.id)} />
        ))}
        {!lista.length && (
          <div style={{ padding: 26, textAlign: "center", ...mono, fontSize: 12, color: C.inchiostroTenue }}>
            Nessun giocatore con questi filtri. Allarga la ricerca o importa il listone da Dati.
          </div>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------
   VISTA PAPABILI
   Squadra per squadra, con i giudizi in chiaro sotto ogni nome.
   Serve a fare la sgrossata prima dell'asta senza aprire una scheda
   alla volta. Un tocco mette il giudizio, ritoccando lo stesso lo toglie.
------------------------------------------------------------------ */
function Papabili({ players, m, setM, leghe, legaAttiva, legheScelte, setLegheScelte, statoIn, prezzoIn, liberaGiocatore, mantraAttivo, rigoristi, probPerId, nLeghe, setSel }) {
  /* Quali campionati stiamo guardando lo dicono le carte in testata, che qui
     dentro accendono e spengono invece di sceglierne una sola. */
  /* Quali squadre di serie A. Tutte spente vuol dire tutte quante, ed e' cosi' che si parte. */
  const [squadreScelte, setSquadreScelte] = useState([]);
  const [nascondiPresi, setNascondiPresi] = useState(false);
  /* gli stessi filtri del Listone, perche' quando i segnati sono tanti servono anche qui */
  const [cerca, setCerca] = useState("");
  const [filtroRuolo, setFiltroRuolo] = useState("TUTTI");
  const [ordine, setOrdine] = useState("ruolo");
  /* una tendina aperta alla volta, altrimenti la pagina diventa illeggibile */
  const [aperto, setAperto] = useState(null);
  const [tagNuovo, setTagNuovo] = useState("");

  /* qui teniamo anche i giocatori di prova, come fa il listone, altrimenti
     chi apre l'app prima dell'import trova la scheda vuota */
  const veri = players;

  const legheAccese = leghe.filter((l) => legheScelte.includes(l.id));
  /* il numero del quadratino nel Listone, uno due tre */
  const numeroLega = (id) => leghe.findIndex((l) => l.id === id) + 1;

  /* In quali dei campionati accesi lo hai segnato. Sono i pin del Listone. */
  const legheDi = (id) => legheAccese.filter((l) => m(id).leghe?.[l.id]);
  const segnato = (id) => legheDi(id).length > 0;

  /* preso vuol dire che in tutti i campionati accesi dove lo volevi e' gia' andato a qualcuno */
  const tuttoPreso = (id) => {
    const sue = legheDi(id);
    return sue.length > 0 && sue.every((l) => statoIn(id, l.id) !== "libero");
  };

  const squadre = useMemo(() => {
    const o = new Map();
    for (const p of veri) {
      const s = p.squadra || "senza squadra";
      if (!o.has(s)) o.set(s, { nome: s, tot: 0, segnati: 0 });
      const v = o.get(s);
      v.tot++;
      if (segnato(p.id)) v.segnati++;
    }
    return [...o.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [players, m, legheScelte, leghe]);

  const ordineRuolo = { P: 0, D: 1, C: 2, A: 3 };
  const elenco = useMemo(() => {
    const t = cerca.trim().toLowerCase();
    /* A parita' si scende sempre allo stesso spareggio, prima la quota e poi il
       nome, cosi' l'ordine e' stabile e non balla tra un ridisegno e l'altro. */
    const perNome = (a, b) => (a.nome || "").localeCompare(b.nome || "");
    const perQuota = (a, b) => quotaDi(b, mantraAttivo) - quotaDi(a, mantraAttivo) || perNome(a, b);
    const perRuolo = (a, b) => (ordineRuolo[a.r] ?? 9) - (ordineRuolo[b.r] ?? 9) || perQuota(a, b);
    const come = {
      ruolo: perRuolo,
      squadra: (a, b) => (a.squadra || "").localeCompare(b.squadra || "") || perRuolo(a, b),
      quota: perQuota,
      fvm: (a, b) => valoreDi(b, mantraAttivo) - valoreDi(a, mantraAttivo) || perQuota(a, b),
      titolarita: (a, b) => percDi(probPerId, b.id) - percDi(probPerId, a.id) || perQuota(a, b),
      nome: perNome,
    }[ordine] || perRuolo;
    return veri
      .filter((p) => !squadreScelte.length || squadreScelte.includes(p.squadra || "senza squadra"))
      .filter((p) => segnato(p.id))
      .filter((p) => !nascondiPresi || !tuttoPreso(p.id))
      .filter((p) => filtroRuolo === "TUTTI" || p.r === filtroRuolo)
      .filter((p) => !t || (p.nome || "").toLowerCase().includes(t) || (p.squadra || "").toLowerCase().includes(t))
      .sort(come);
  }, [veri, squadreScelte, nascondiPresi, legheScelte, leghe, mantraAttivo, m, cerca, filtroRuolo, ordine, probPerId]);

  if (!veri.length) {
    return (
      <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Nessun giocatore</div>
        <div style={{ fontSize: 13, color: C.inchiostroTenue, marginTop: 6 }}>
          Il listone lo carica l'amministratore dal pannello Dati.
        </div>
      </div>
    );
  }

  const totSegnati = squadre.reduce((n, s) => n + s.segnati, 0);
  const tutteAccese = leghe.length > 0 && legheAccese.length === leghe.length;
  const nomiAccesi = legheAccese.map((l) => l.nome).join(", ");

  const etichettaLeghe = () => {
    if (!legheAccese.length) return "nessun campionato acceso";
    if (tutteAccese) return leghe.length === 1 ? nomiAccesi : "tutti i campionati, " + nomiAccesi;
    return nomiAccesi;
  };

  return (
    <>
      <div style={{ background: C.inchiostro, color: C.carta, borderRadius: 3, padding: "10px 12px" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>I tuoi segnati, squadra per squadra</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 4, opacity: .9 }}>
          {!legheAccese.length
            ? "Accendi almeno un campionato dalle carte qui sopra, altrimenti non c'è niente da mostrare."
            : totSegnati === 0
              ? `Non hai ancora segnato nessuno per ${etichettaLeghe()}. Vai nel Listone e accendi il quadratino accanto ai giocatori che ti interessano.`
              : `Hai ${totSegnati} giocatori segnati per ${etichettaLeghe()}. I campionati si accendono e si spengono dalle carte qui sopra, e solo in questa scheda puoi tenerne accesi più di uno.`}
        </div>
      </div>

      {/* i singoli campionati si accendono dalle carte in testata.
          Qui resta solo la scorciatoia per accenderli tutti in un colpo. */}
      {leghe.length > 1 && (
        <div className="flex gap-1 flex-wrap items-center" style={{ marginTop: 10 }}>
          <span style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".1em", marginRight: 2 }}>
            campionati
          </span>
          <Btn piccolo attivo={tutteAccese}
            title={tutteAccese ? "torna a uno solo" : "accendili tutti"}
            onClick={() => setLegheScelte(tutteAccese ? [legaAttiva] : leghe.map((l) => l.id))}>
            tutti
          </Btn>
          <span style={{ ...mono, fontSize: 10, color: C.inchiostroTenue }}>
            {legheAccese.length ? "accesi " + legheAccese.map((l) => l.nome).join(", ") : "nessuno acceso"}
          </span>
        </div>
      )}

      {/* le venti squadre, tutte a vista. Spente vuol dire tutte */}
      <div className="flex gap-1 flex-wrap items-center" style={{ marginTop: 8 }}>
        <span style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".1em", marginRight: 2 }}>
          squadre
        </span>
        {squadre.map((s) => {
          const on = squadreScelte.includes(s.nome);
          return (
            <Btn key={s.nome} piccolo attivo={on}
              onClick={() => setSquadreScelte(on ? squadreScelte.filter((x) => x !== s.nome) : [...squadreScelte, s.nome])}
              title={`${s.segnati} segnati su ${s.tot} giocatori`}>
              <span style={{ opacity: s.segnati || on ? 1 : .45 }}>{s.nome}</span>
              <span style={{ ...mono, fontSize: 9.5, marginLeft: 4, fontWeight: 800,
                color: on ? "inherit" : (s.segnati ? C.rosa : C.inchiostroTenue),
                opacity: s.segnati ? 1 : .45 }}>
                {s.segnati}
              </span>
            </Btn>
          );
        })}
      </div>

      {/* gli stessi filtri del Listone */}
      <input
        value={cerca} onChange={(e) => setCerca(e.target.value)}
        placeholder="Cerca tra i tuoi segnati"
        style={{ width: "100%", marginTop: 10, padding: "8px 10px", border: `1.5px solid ${C.riga}`, background: "#fff", borderRadius: 3, fontSize: 14.5, ...display }}
      />
      <div className="flex gap-1 mt-2 flex-wrap">
        {["TUTTI", ...RUOLI_C].map((r) => (
          <Btn key={r} piccolo attivo={filtroRuolo === r} onClick={() => setFiltroRuolo(r)}>{r}</Btn>
        ))}
      </div>
      <div className="flex gap-1 mt-1 flex-wrap items-center">
        <span style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, textTransform: "uppercase" }}>ordina</span>
        {[["ruolo", "ruolo"], ["squadra", "squadra"], ["quota", "quota"], ["fvm", "fvm"], ["titolarita", "titolarità"], ["nome", "nome"]].map(([k, v]) => (
          <Btn key={k} piccolo attivo={ordine === k} onClick={() => setOrdine(k)}>{v}</Btn>
        ))}
      </div>

      <div className="flex gap-1 items-center flex-wrap" style={{ margin: "10px 0 4px" }}>
        <Btn piccolo attivo={nascondiPresi} onClick={() => setNascondiPresi(!nascondiPresi)}>nascondi presi</Btn>
        {squadreScelte.length > 0 && (
          <Btn piccolo onClick={() => setSquadreScelte([])}>spegni le squadre</Btn>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".1em" }}>
          {elenco.length} giocatori
        </span>
      </div>
      <div style={{ marginBottom: 4 }}><Listino mantraAttivo={mantraAttivo} leghe={leghe} /></div>

      <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3 }}>
        {!elenco.length && (
          <div style={{ padding: 20, textAlign: "center", ...mono, fontSize: 12, color: C.inchiostroTenue }}>
            {!legheAccese.length
              ? "Accendi un campionato dalle carte in testata"
              : cerca.trim() || filtroRuolo !== "TUTTI"
                ? "Nessun segnato con questi filtri"
                : squadreScelte.length
                  ? "Nessun segnato in queste squadre"
                  : "Nessun segnato per " + etichettaLeghe()}
          </div>
        )}
        {elenco.map((p) => {
          const mm = m(p.id);
          const sue = legheDi(p.id);
          const perc = percDi(probPerId, p.id);
          const tags = mm.tags || [];
          return (
            <div key={p.id} style={{ borderBottom: `1px solid ${C.riga}`, padding: "8px 8px 9px" }}>
              <div className="flex items-center gap-2">
                <RuoloC r={p.r} />
                <button onClick={() => setSel(p.id)} className="flex-1 text-left min-w-0">
                  <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.nome}
                  </div>
                  <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, marginTop: 1 }}>
                    <span style={{ textTransform: "uppercase", letterSpacing: ".05em" }}>{p.squadra}</span>
                    {p.rm?.length ? <span style={{ marginLeft: 5 }}><RuoliM rm={p.rm} /></span> : null}
                    {perc ? <b style={{ color: COLORE_FASCIA[fasciaTitolarita(perc)], marginLeft: 5 }}>{perc + "%"}</b> : null}
                    {rigoristi?.[p.id] ? <b style={{ color: C.rosa, marginLeft: 5 }}>{"rig " + rigoristi[p.id]}</b> : null}
                    {nLeghe(p.id) > 0 ? <b style={{ color: C.rosa, marginLeft: 5 }}>{"in " + nLeghe(p.id)}</b> : null}
                  </div>
                </button>
                <div style={{ ...mono, fontSize: 12.5, fontWeight: 700, textAlign: "right", lineHeight: 1.25 }}>
                  {quotaDi(p, mantraAttivo)}
                  <div style={{ fontSize: 10, fontWeight: 400, color: C.inchiostroTenue }}>{valoreDi(p, mantraAttivo)} fvm</div>
                  {/* una riga per ogni campionato acceso in cui lo vuoi, col tetto o col prezzo pagato */}
                  {sue.map((l) => {
                    const st = statoIn(p.id, l.id);
                    const mx = mm.max?.[l.id];
                    if (st === "libero" && !mx) return null;
                    return (
                      <div key={l.id} style={{ fontSize: 10.5, fontWeight: 700, color: st === "mio" ? C.campo : st === "altrui" ? C.inchiostroTenue : C.rosa }}>
                        {numeroLega(l.id)} {st === "libero" ? "max " + mx : (st === "mio" ? "tuo " : "preso ") + prezzoIn(p.id, l.id)}
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => { setAperto(aperto === p.id ? null : p.id); setTagNuovo(""); }}
                  title="tutto quello che hai scritto su di lui"
                  style={{ ...mono, fontSize: 13, color: C.inchiostroTenue, padding: "4px 6px" }}>
                  {aperto === p.id ? "▾" : "▸"}
                </button>
              </div>

              {/* i giudizi, in chiaro, senza aprire la tendina */}
              <div className="flex gap-1 flex-wrap" style={{ marginTop: 6 }}>
                {INTERESSE.filter((i) => i.k > 0).map((i) => {
                  const on = mm.interesse === i.k;
                  return (
                    <button key={i.k}
                      onClick={() => setM(p.id, { interesse: on ? 0 : i.k })}
                      style={{
                        ...display, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em",
                        padding: "5px 9px", borderRadius: 3, border: `1.5px solid ${on ? i.col : C.riga}`,
                        background: on ? i.col : "#fff", color: on ? "#fff" : C.inchiostroTenue,
                      }}>
                      {i.label}
                    </button>
                  );
                })}
              </div>

              {/* etichette e note in chiaro, senza aprire niente, perche' sono
                  la ragione per cui uno se l'era segnato */}
              {(tags.length > 0 || (mm.note || "").trim()) && (
                <div style={{ marginTop: 6 }}>
                  {tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {tags.map((t) => (
                        <span key={t} style={{
                          padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, ...display,
                          border: `1px solid ${C.inchiostro}`, background: C.inchiostro, color: C.carta,
                        }}>{t}</span>
                      ))}
                    </div>
                  )}
                  {(mm.note || "").trim() && (
                    <div style={{ fontSize: 12.5, lineHeight: 1.4, marginTop: tags.length ? 5 : 0,
                      whiteSpace: "pre-wrap", borderLeft: `2px solid ${C.riga}`, paddingLeft: 7, color: C.inchiostro }}>
                      {mm.note}
                    </div>
                  )}
                </div>
              )}

              {/* la tendina, cioe' la scheda del giocatore, per cambiare o togliere */}
              {aperto === p.id && (
                <div style={{ marginTop: 8, padding: 9, background: C.cartaScura, borderRadius: 3 }}>
                  <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".1em" }}>
                    in quali aste lo voglio
                  </div>
                  {/* tutti i campionati, non solo quelli accesi, cosi' da qui si toglie e si aggiunge ovunque */}
                  {leghe.map((l, i) => {
                    const on = !!mm.leghe[l.id];
                    const s2 = statoIn(p.id, l.id);
                    const acceso = legheScelte.includes(l.id);
                    return (
                      <div key={l.id} className="flex items-center gap-2" style={{ padding: "3px 0", opacity: acceso ? 1 : .6 }}>
                        <button onClick={() => setM(p.id, { leghe: { ...mm.leghe, [l.id]: !on } })}
                          style={{ width: 20, height: 20, borderRadius: 2, border: `1.5px solid ${on ? C.rosa : C.riga}`, background: on ? C.rosa : "#fff", color: "#fff", fontSize: 12, fontWeight: 800, flex: "0 0 auto" }}>
                          {on ? "✓" : ""}
                        </button>
                        <span style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, fontWeight: 700 }}>{i + 1}</span>
                        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nome}</span>
                        {s2 === "libero" ? (
                          <>
                            <span style={{ ...mono, fontSize: 10, color: C.inchiostroTenue }}>max</span>
                            <input
                              value={mm.max?.[l.id] || ""} inputMode="numeric"
                              onChange={(e) => setM(p.id, { max: { ...mm.max, [l.id]: e.target.value.replace(/\D/g, "") } })}
                              style={{ width: 48, padding: "4px", border: `1px solid ${C.riga}`, borderRadius: 2, ...mono, fontSize: 13, fontWeight: 700, textAlign: "center" }}
                            />
                          </>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: s2 === "mio" ? C.campo : C.inchiostroTenue }}>
                              {s2 === "mio" ? "tuo" : "preso"} a {prezzoIn(p.id, l.id)}
                            </span>
                            <Btn piccolo title="rimuovi l'acquisto" onClick={() => liberaGiocatore(p.id, l.id)}>−</Btn>
                          </span>
                        )}
                      </div>
                    );
                  })}

                  <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, margin: "10px 0 4px", textTransform: "uppercase", letterSpacing: ".1em" }}>etichette</div>
                  <div className="flex gap-1 flex-wrap">
                    {[...new Set([...TAG_SUGGERITI, ...tags])].map((t) => {
                      const on = tags.includes(t);
                      return (
                        <button key={t} onClick={() => setM(p.id, { tags: on ? tags.filter((x) => x !== t) : [...tags, t] })}
                          style={{
                            padding: "3px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, ...display,
                            border: `1px solid ${on ? C.inchiostro : C.riga}`,
                            background: on ? C.inchiostro : "#fff", color: on ? C.carta : C.inchiostroTenue,
                          }}>{t}</button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <input value={tagNuovo} onChange={(e) => setTagNuovo(e.target.value)} placeholder="Nuova etichetta"
                      style={{ flex: 1, minWidth: 0, padding: "5px 7px", border: `1px solid ${C.riga}`, borderRadius: 2, fontSize: 12, ...display }} />
                    <Btn piccolo onClick={() => { if (tagNuovo.trim()) { setM(p.id, { tags: [...tags, tagNuovo.trim()] }); setTagNuovo(""); } }}>aggiungi</Btn>
                  </div>

                  <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, margin: "10px 0 4px", textTransform: "uppercase", letterSpacing: ".1em" }}>note</div>
                  <textarea
                    value={mm.note || ""} onChange={(e) => setM(p.id, { note: e.target.value })}
                    rows={2} placeholder="Cosa ti sei detto su di lui"
                    style={{ width: "100%", padding: 8, border: `1px solid ${C.riga}`, borderRadius: 3, fontSize: 13, ...display, resize: "vertical" }}
                  />

                  {/* in fondo, i meno. Uno per ogni campionato acceso in cui lo hai segnato */}
                  {sue.length > 0 && (
                    <div style={{ borderTop: `1px solid ${C.riga}`, marginTop: 10, paddingTop: 8 }}>
                      <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".1em" }}>
                        toglilo dai campionati accesi
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {sue.map((l) => (
                          <Btn key={l.id} piccolo tono="rosa" title={"togli " + p.nome + " da " + l.nome}
                            onClick={() => setM(p.id, { leghe: { ...mm.leghe, [l.id]: false } })}>
                            {"− " + numeroLega(l.id) + " " + l.nome}
                          </Btn>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  VISTA ASTA LIVE                                                    */
/* ------------------------------------------------------------------ */

function AstaLive(props) {
  const { mantraAttivo, q, setQ, filtroRuolo, setFiltroRuolo, leghe, lega, legaAttiva, m, nLeghe, statoIn, prezzoIn, assegnaGiocatore, liberaGiocatore, asta, speso, players, setSel, rivaliDi, aggiungiRivale } = props;
  const [target, setTarget] = useState(null);
  const [prezzo, setPrezzo] = useState("");
  /* quando dici che l'ha preso un altro, chiediamo di chi e' */
  const [chiedoChi, setChiedoChi] = useState(false);
  const [rivaleNuovo, setRivaleNuovo] = useState("");
  /* la rosa si puo' richiudere, e si puo' sbirciare quella di un altro campionato
     senza cambiare campionato attivo, perche' all'asta serve sapere cosa hai gia' altrove */
  const [rosaAperta, setRosaAperta] = useState(true);
  const [rosaLega, setRosaLega] = useState(legaAttiva);
  useEffect(() => { setRosaLega(legaAttiva); }, [legaAttiva]);
  const L = lega(legaAttiva);
  const a = asta(legaAttiva);
  const residuo = L.budget - speso(legaAttiva);
  const rosaCorrente = asta(rosaLega).rosa;
  const perRuolo = RUOLI_C.map((r) => ({
    r,
    presi: a.rosa.filter((x) => players.find((p) => p.id === x.id)?.r === r).length,
    max: L.rosaMax[r],
  }));
  const slotResidui = perRuolo.reduce((s, x) => s + (x.max - x.presi), 0);
  const maxOfferta = Math.max(0, residuo - Math.max(0, slotResidui - 1));

  /* Chi in questo campionato non e' piu' libero. Serve solo quando cerchi un nome,
     perche' l'elenco normale i presi li nasconde e senza questo non si torna indietro. */
  const cercato = q.trim().toLowerCase();
  const gia = cercato.length < 2 ? [] : players
    .filter((p) => statoIn(p.id, legaAttiva) !== "libero")
    .filter((p) => (p.nome || "").toLowerCase().includes(cercato) || (p.squadra || "").toLowerCase().includes(cercato))
    .slice(0, 12);

  /* La lista qui dentro se la fa l'asta. Prima si appoggiava a quella del Listone,
     e cosi' si portava dietro filtri che in questa scheda non si vedono, tipo solo
     target o solo titolari, piu' l'ordinamento scelto la' dentro. Qui contano solo
     la ricerca e i tasti dei ruoli, che sono gli unici due comandi a vista. */
  const disponibili = useMemo(() => {
    const voluto = (p) => (m(p.id).leghe?.[legaAttiva] ? 1 : 0);
    return players
      .filter((p) => statoIn(p.id, legaAttiva) === "libero")
      .filter((p) => filtroRuolo === "TUTTI" || p.r === filtroRuolo)
      .filter((p) => !cercato
        || (p.nome || "").toLowerCase().includes(cercato)
        || (p.squadra || "").toLowerCase().includes(cercato))
      /* prima chi hai segnato per questa asta, poi chi ti piace di piu', poi chi vale di piu' */
      .sort((a, b) =>
        voluto(b) - voluto(a) ||
        (m(b.id).interesse || 0) - (m(a.id).interesse || 0) ||
        valoreDi(b, mantraAttivo) - valoreDi(a, mantraAttivo) ||
        (a.nome || "").localeCompare(b.nome || ""));
  }, [players, legaAttiva, filtroRuolo, cercato, m, statoIn, mantraAttivo]);

  /* Obiettivi di questa asta, cioe' chi hai segnato proprio per questo campionato
     oppure chi ti piace da Mi piace in su, che vale per tutti i campionati. */
  const obiettivi = disponibili.filter((p) => m(p.id).leghe?.[legaAttiva] || m(p.id).interesse >= 3);
  const idObiettivi = new Set(obiettivi.map((p) => p.id));
  const altri = disponibili.filter((p) => !idObiettivi.has(p.id)).slice(0, 40);

  const rivali = rivaliDi(legaAttiva);

  function conferma(aChi, team = "") {
    const pz = parseInt(prezzo || "0", 10);
    if (!target || !pz) return;
    assegnaGiocatore(target.id, legaAttiva, pz, aChi, team);
    setTarget(null); setPrezzo(""); setQ(""); setChiedoChi(false); setRivaleNuovo("");
  }

  /* Il tasto a un altro chiede sempre di chi e'. Se per questo campionato le
     squadre non le hai ancora registrate te lo dice, invece di assegnare al buio. */
  function aUnAltro() {
    const pz = parseInt(prezzo || "0", 10);
    if (!target || !pz) return;
    setChiedoChi(true);
  }

  /* squadra scritta al volo mentre l'asta va, capita di scoprirne una all'ultimo */
  function confermaNuovo() {
    const nome = rivaleNuovo.trim();
    if (!nome) return;
    const rid = aggiungiRivale(legaAttiva, nome);
    conferma("altrui", rid || "");
  }

  const altreLeghe = target ? leghe.filter((l) => l.id !== legaAttiva && m(target.id).leghe[l.id]) : [];

  /* Le rose stanno subito sotto la ricerca, prima dei giocatori, perche'
     e' la prima cosa che vuoi vedere quando sei all'asta. */
  const bloccoRose = (
    <>
      {/* Le rose. Quella del campionato attivo e' la prima, ma con i tastini
        si guardano anche le altre senza uscire dall'asta. Tutto richiudibile,
        perche' mentre cerchi un giocatore lo spazio serve alla ricerca. */}
    <div className="flex items-center gap-2" style={{ margin: "16px 0 4px" }}>
      <button onClick={() => setRosaAperta(!rosaAperta)}
        style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".1em" }}>
        {rosaAperta ? "▾" : "▸"} le tue rose
      </button>
      <div style={{ flex: 1, height: 1, background: C.riga }} />
      <span style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue }}>
        {rosaCorrente.length} gioc. · {speso(rosaLega)} spesi
      </span>
    </div>

    {rosaAperta && (
      <>
        {leghe.length > 1 && (
          <div className="flex gap-1 flex-wrap" style={{ marginBottom: 6 }}>
            {leghe.map((l) => (
              <Btn key={l.id} piccolo attivo={rosaLega === l.id} onClick={() => setRosaLega(l.id)}>
                {l.nome}
              </Btn>
            ))}
          </div>
        )}
        <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3 }}>
          {rosaCorrente.length === 0 && (
            <div style={{ padding: 18, textAlign: "center", ...mono, fontSize: 12, color: C.inchiostroTenue }}>
              Ancora nessun acquisto in {lega(rosaLega).nome}
            </div>
          )}
          {RUOLI_C.map((r) => rosaCorrente
            .map((x) => ({ ...x, p: players.find((pp) => pp.id === x.id) }))
            .filter((x) => x.p?.r === r)
            .sort((u, v) => v.prezzo - u.prezzo)
            .map((x) => (
              <div key={x.id} className="flex items-center gap-2" style={{ borderBottom: `1px solid ${C.riga}`, padding: "6px" }}>
                <RuoloC r={r} />
                <button className="flex-1 text-left min-w-0" onClick={() => setSel(x.id)}
                  style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {x.p.nome}
                </button>
                <span style={{ ...mono, fontSize: 13, fontWeight: 700 }}>{x.prezzo}</span>
                <Btn piccolo title="rimuovi l'acquisto" onClick={() => liberaGiocatore(x.id, rosaLega)}>−</Btn>
              </div>
            ))
          )}
        </div>
        {rosaLega !== legaAttiva && (
          <div style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, marginTop: 5, lineHeight: 1.5 }}>
            Stai guardando {lega(rosaLega).nome}. L'asta che stai facendo resta {L.nome}.
          </div>
        )}
      </>
    )}
    </>
  );

  return (
    <>
      {/* pannello stato */}
      <div style={{ background: C.inchiostro, color: C.carta, padding: "10px 12px", borderRadius: 3 }}>
        <div className="flex justify-between items-end">
          <div>
            <div style={{ ...mono, fontSize: 10, opacity: .6, textTransform: "uppercase", letterSpacing: ".12em" }}>crediti residui</div>
            <div style={{ ...mono, fontSize: 30, fontWeight: 700, lineHeight: 1 }}>{residuo}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ ...mono, fontSize: 10, opacity: .6, textTransform: "uppercase", letterSpacing: ".12em" }}>offerta max</div>
            <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: "#F5A9C0" }}>{maxOfferta}</div>
          </div>
        </div>
        <div className="flex gap-3 mt-2">
          {perRuolo.map((x) => (
            <div key={x.r} style={{ ...mono, fontSize: 11 }}>
              <span style={{ opacity: .55 }}>{x.r}</span> {x.presi}<span style={{ opacity: .45 }}>/{x.max}</span>
            </div>
          ))}
        </div>
      </div>

      {/* selezione giocatore */}
      {!target ? (
        <>
          <input
            value={q} onChange={(e) => setQ(e.target.value)} autoFocus
            placeholder="Chi è all'asta"
            style={{ width: "100%", marginTop: 10, padding: "11px", border: `2px solid ${C.inchiostro}`, background: "#fff", borderRadius: 3, fontSize: 17, fontWeight: 600, ...display }}
          />
          <div className="flex gap-1 mt-2 flex-wrap">
            {["TUTTI", ...RUOLI_C].map((r) => (
              <Btn key={r} piccolo attivo={filtroRuolo === r} onClick={() => setFiltroRuolo(r)}>{r}</Btn>
            ))}
          </div>

          {bloccoRose}

          {/* Cercando, una lista sola coi risultati. A ricerca vuota due elenchi,
              prima i tuoi obiettivi e poi, sotto, i primi del listone, cosi' se un
              giocatore non te l'eri segnato lo trovi lo stesso senza cercarlo. */}
          {cercato ? (
            <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, marginTop: 8 }}>
              {disponibili.slice(0, 40).map((p) => (
                <Riga key={p.id} p={p} {...props} compatta onApri={() => { setTarget(p); setPrezzo(String(m(p.id).max?.[legaAttiva] || "")); }} />
              ))}
              {!disponibili.length && (
                <div style={{ padding: 16, textAlign: "center", ...mono, fontSize: 11.5, color: C.inchiostroTenue }}>
                  Nessuno con questo nome tra i liberi. Se l'hai già segnato lo trovi qui sotto.
                </div>
              )}
            </div>
          ) : (
            <>
              {obiettivi.length > 0 && (
                <>
                  <div style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, margin: "14px 0 4px", textTransform: "uppercase", letterSpacing: ".1em" }}>
                    i tuoi obiettivi ancora liberi in {L.nome}, {obiettivi.length}
                  </div>
                  <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3 }}>
                    {obiettivi.map((p) => (
                      <Riga key={p.id} p={p} {...props} compatta onApri={() => { setTarget(p); setPrezzo(String(m(p.id).max?.[legaAttiva] || "")); }} />
                    ))}
                  </div>
                </>
              )}
              {altri.length > 0 && (
                <>
                  <div style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, margin: "14px 0 4px", textTransform: "uppercase", letterSpacing: ".1em" }}>
                    i primi del listone
                  </div>
                  <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3 }}>
                    {altri.map((p) => (
                      <Riga key={p.id} p={p} {...props} compatta onApri={() => { setTarget(p); setPrezzo(String(m(p.id).max?.[legaAttiva] || "")); }} />
                    ))}
                  </div>
                </>
              )}
              {!disponibili.length && (
                <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: 16, textAlign: "center", ...mono, fontSize: 11.5, color: C.inchiostroTenue, marginTop: 14 }}>
                  Nessun giocatore libero con questo ruolo
                </div>
              )}
            </>
          )}

          {/* Chi e' gia' stato assegnato non compare qui sopra, perche' l'elenco
              nasconde i presi. Se hai sbagliato a segnare devi poterlo ritrovare,
              quindi cercandolo per nome ricompare qui sotto con il tasto per
              rimetterlo libero. */}
          {gia.length > 0 && (
            <>
              <div style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, margin: "16px 0 4px", textTransform: "uppercase", letterSpacing: ".1em" }}>
                già assegnati in {L.nome}
              </div>
              <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3 }}>
                {gia.map((p) => {
                  const st = statoIn(p.id, legaAttiva);
                  return (
                    <div key={p.id} className="flex items-center gap-2" style={{ borderBottom: `1px solid ${C.riga}`, padding: "6px" }}>
                      <RuoloC r={p.r} />
                      <button className="flex-1 text-left min-w-0" onClick={() => setSel(p.id)}
                        style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.nome}
                      </button>
                      <span style={{ ...mono, fontSize: 11.5, fontWeight: 700, color: st === "mio" ? C.campo : C.inchiostroTenue }}>
                        {st === "mio" ? "tuo" : "preso"} a {prezzoIn(p.id, legaAttiva)}
                      </span>
                      <Btn piccolo title="rimuovi l'acquisto" onClick={() => liberaGiocatore(p.id, legaAttiva)}>−</Btn>
                    </div>
                  );
                })}
              </div>
              <div style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, marginTop: 5, lineHeight: 1.5 }}>
                Il meno lo rimette libero e ti ridà i crediti. Non tocca gli altri campionati.
              </div>
            </>
          )}
        </>
      ) : (
        <div style={{ marginTop: 10, background: "#fff", border: `2px solid ${C.inchiostro}`, borderRadius: 3, padding: 12 }}>
          <div className="flex justify-between items-start">
            <div>
              <div style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.1 }}>{target.nome}</div>
              <div style={{ ...mono, fontSize: 11, color: C.inchiostroTenue, textTransform: "uppercase" }}>
                {target.squadra}
                <span className="inline-flex items-center gap-1" style={{ marginLeft: 8, verticalAlign: "middle" }}>
                  <RuoloC r={target.r} />
                  <RuoliM rm={target.rm} />
                </span>
              </div>
            </div>
            <Btn piccolo onClick={() => { setTarget(null); setPrezzo(""); setChiedoChi(false); setRivaleNuovo(""); }}>annulla</Btn>
          </div>

          <div className="flex gap-4 mt-2" style={{ ...mono, fontSize: 12 }}>
            <span>qt <b>{quotaDi(target, mantraAttivo)}</b></span>
            <span>fvm <b>{valoreDi(target, mantraAttivo)}</b></span>
            <span>mio max <b style={{ color: C.rosa }}>{m(target.id).max?.[legaAttiva] || "—"}</b></span>
          </div>

          {altreLeghe.length > 0 && (
            <div style={{ marginTop: 9, padding: "7px 9px", background: "rgba(208,46,94,.09)", border: `1px solid ${C.rosa}`, borderRadius: 3, fontSize: 12.5, fontWeight: 600 }}>
              Lo vuoi anche in {altreLeghe.map((l) => l.nome).join(" e ")}. Se te lo prendi qui, valuta quanto ti resta là.
            </div>
          )}

          <input
            value={prezzo} onChange={(e) => setPrezzo(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric" placeholder="Prezzo finale" autoFocus
            style={{ width: "100%", marginTop: 10, padding: "12px", border: `2px solid ${C.riga}`, borderRadius: 3, ...mono, fontSize: 26, fontWeight: 700, textAlign: "center" }}
          />
          {parseInt(prezzo || 0, 10) > maxOfferta && (
            <div style={{ ...mono, fontSize: 11, color: C.rosa, marginTop: 4 }}>
              Oltre il massimo sostenibile, ti restano {maxOfferta} crediti spendibili
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <button onClick={() => conferma("mio")} style={{ flex: 2, padding: 13, background: C.campo, color: "#fff", border: "none", borderRadius: 3, fontSize: 14, fontWeight: 800, textTransform: "uppercase", ...display }}>
              preso io
            </button>
            <button onClick={aUnAltro} style={{ flex: 1, padding: 13, background: "transparent", color: C.inchiostro, border: `1.5px solid ${C.riga}`, borderRadius: 3, fontSize: 13, fontWeight: 700, textTransform: "uppercase", ...display }}>
              a un altro
            </button>
          </div>

          {/* di chi e'. Compare solo dopo aver premuto a un altro */}
          {chiedoChi && (
            <div style={{ marginTop: 10, padding: 10, background: C.cartaScura, borderRadius: 3 }}>
              <div className="flex items-baseline justify-between gap-2">
                <span style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".1em" }}>
                  chi se l'è preso
                </span>
                <button onClick={() => { setChiedoChi(false); setRivaleNuovo(""); }}
                  style={{ ...mono, fontSize: 10, color: C.rosa, textTransform: "uppercase", letterSpacing: ".08em" }}>
                  annulla
                </button>
              </div>
              {/* se non ne hai registrata nessuna, lo diciamo invece di lasciarti al buio */}
              {rivali.length === 0 && (
                <div style={{ background: "rgba(200,137,42,.16)", border: `1px solid ${C.ocra}`,
                  borderRadius: 3, padding: "8px 10px", marginTop: 6, fontSize: 12.5, lineHeight: 1.45 }}>
                  Per <b>{L.nome}</b> non hai ancora registrato nessuna squadra avversaria.
                  Le scrivi nel pannello <b>Dati</b>, riquadro <b>Gli altri della lega</b>, oppure
                  qui sotto una alla volta mentre l'asta va.
                </div>
              )}

              <div className="flex gap-1 flex-wrap" style={{ marginTop: 6 }}>
                {rivali.map((r) => {
                  const suo = asta(legaAttiva).altrui.filter((x) => x.team === r.id);
                  const sp = suo.reduce((n, x) => n + (x.prezzo || 0), 0);
                  return (
                    <Btn key={r.id} piccolo tono="rosa" onClick={() => conferma("altrui", r.id)}
                      title={`${r.nome}, ${suo.length} giocatori e ${sp} crediti spesi`}>
                      {r.nome}
                      <span style={{ ...mono, fontSize: 9.5, marginLeft: 4, opacity: .7 }}>{L.budget - sp}</span>
                    </Btn>
                  );
                })}
                <Btn piccolo onClick={() => conferma("altrui")}>non so chi</Btn>
              </div>
              <div className="flex gap-2 mt-2">
                <input value={rivaleNuovo} onChange={(e) => setRivaleNuovo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confermaNuovo(); }}
                  placeholder="Una squadra che non c'è"
                  style={{ flex: 1, minWidth: 0, padding: "6px 8px", border: `1px solid ${C.riga}`, borderRadius: 2, fontSize: 12.5, ...display }} />
                <Btn piccolo attivo={!!rivaleNuovo.trim()} onClick={confermaNuovo}>aggiungi e assegna</Btn>
              </div>
              <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, marginTop: 6, lineHeight: 1.45 }}>
                Il numero accanto al nome è quanto gli resta. Tutto finisce nella scheda Aste Tracker.
              </div>
            </div>
          )}
        </div>
      )}

      {/* mentre metti il prezzo le rose restano sotto, servono proprio in quel momento */}
      {target && bloccoRose}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  VISTA ASTE TRACKER                                                 */
/*  Come stanno messi gli altri. Quanto hanno speso, quanto gli resta  */
/*  e quali caselle hanno gia' riempito, ruolo per ruolo.              */
/* ------------------------------------------------------------------ */

function Tracker({ leghe, legaAttiva, asta, speso, players, rivaliDi, setSel }) {
  /* si guarda un campionato alla volta, ma senza cambiare quello attivo */
  const [quale, setQuale] = useState(legaAttiva);
  useEffect(() => { setQuale(legaAttiva); }, [legaAttiva]);
  const [aperta, setAperta] = useState(null);

  /* la mappa Id -> giocatore sta prima di ogni uscita anticipata,
     altrimenti l'ordine degli hook cambierebbe da un giro all'altro */
  const perId = useMemo(() => {
    const o = {};
    for (const p of players) o[p.id] = p;
    return o;
  }, [players]);

  const L = leghe.find((l) => l.id === quale) || leghe[0];
  if (!L) return null;
  const a = asta(L.id);
  const rivali = rivaliDi(L.id);

  const ruoloDi = (id) => perId[id]?.r || "?";

  /* Una scheda per ognuno, la tua per prima. Gli acquisti senza padrone
     finiscono in fondo, in un mucchio a parte. */
  const senzaNome = a.altrui.filter((x) => !x.team || !rivali.some((r) => r.id === x.team));
  const squadre = [
    { id: "__mia__", nome: "La tua rosa", mia: true, presi: a.rosa },
    ...rivali.map((r) => ({ id: r.id, nome: r.nome, mia: false, presi: a.altrui.filter((x) => x.team === r.id) })),
    ...(senzaNome.length ? [{ id: "__ignoti__", nome: "Presi da non so chi", ignoti: true, presi: senzaNome }] : []),
  ];

  const conto = (presi) => presi.reduce((n, x) => n + (x.prezzo || 0), 0);

  return (
    <>
      <div style={{ background: C.inchiostro, color: C.carta, borderRadius: 3, padding: "10px 12px" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Come stanno messi gli altri</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 4, opacity: .9 }}>
          {rivali.length === 0
            ? "Non hai ancora scritto chi sono gli altri di questa lega. Vai nel pannello Dati, riquadro Gli altri della lega, e mettici i loro nomi. Poi all'asta, quando segni un giocatore preso da un altro, ti chiede di chi è."
            : `${rivali.length} avversari in ${L.nome}. Quando all'asta segni un giocatore preso da un altro, ti viene chiesto di chi è, e da lì si riempie tutto questo.`}
        </div>
      </div>

      {leghe.length > 1 && (
        <div className="flex gap-1 flex-wrap" style={{ marginTop: 10 }}>
          {leghe.map((l) => (
            <Btn key={l.id} piccolo attivo={l.id === quale} onClick={() => setQuale(l.id)}>{l.nome}</Btn>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap" style={{ alignItems: "flex-start", marginTop: 4 }}>
        {squadre.map((sq) => {
          const sp = conto(sq.presi);
          const resta = L.budget - sp;
          const apertaQui = aperta === sq.id;
          return (
            <div key={sq.id} style={{
              flex: "1 1 250px", background: "#fff", borderRadius: 3, marginTop: 8,
              border: sq.mia ? `2px solid ${C.campo}` : `1px solid ${C.riga}`,
            }}>
              <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.riga}` }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: sq.mia ? C.campo : C.inchiostro,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sq.nome}
                  </span>
                  <span style={{ ...mono, fontSize: 10, color: C.inchiostroTenue }}>
                    {sq.presi.length} gioc.
                  </span>
                </div>
                {/* i crediti, come nella testata */}
                {sq.ignoti ? (
                  <div style={{ ...mono, fontSize: 12, color: C.inchiostroTenue, margin: "3px 0 4px" }}>
                    {sp} crediti spesi in tutto
                  </div>
                ) : (
                  <>
                    <div style={{ ...mono, fontSize: 16, fontWeight: 700, margin: "2px 0 4px" }}>
                      {resta}
                      <span style={{ fontSize: 10, color: C.inchiostroTenue }}> /{L.budget}</span>
                      <span style={{ fontSize: 10, color: C.inchiostroTenue, marginLeft: 8 }}>{sp} spesi</span>
                    </div>
                    <BarraCrediti speso={sp} budget={L.budget} />
                  </>
                )}
              </div>

              {/* le caselle per ruolo, quante ne ha riempite su quante ne servono */}
              {!sq.ignoti && (
                <div className="flex" style={{ borderBottom: `1px solid ${C.riga}` }}>
                  {RUOLI_C.map((r) => {
                    const n = sq.presi.filter((x) => ruoloDi(x.id) === r).length;
                    const max = L.rosaMax?.[r] || 0;
                    const pieno = max > 0 && n >= max;
                    return (
                      <div key={r} style={{ flex: 1, textAlign: "center", padding: "6px 2px",
                        borderRight: r === "A" ? "none" : `1px solid ${C.riga}` }}>
                        <div style={{ ...mono, fontSize: 9, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".08em" }}>{r}</div>
                        <div style={{ ...mono, fontSize: 13.5, fontWeight: 700, color: pieno ? C.campo : C.inchiostro }}>
                          {n}<span style={{ fontSize: 9.5, fontWeight: 400, color: C.inchiostroTenue }}>/{max}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* chi ha preso, si apre e si chiude */}
              <button onClick={() => setAperta(apertaQui ? null : sq.id)}
                style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, textTransform: "uppercase",
                  letterSpacing: ".1em", padding: "6px 10px", width: "100%", textAlign: "left" }}>
                {apertaQui ? "▾" : "▸"} chi ha preso
              </button>
              {apertaQui && (
                sq.presi.length === 0 ? (
                  <div style={{ ...mono, fontSize: 11, color: C.inchiostroTenue, padding: "0 10px 9px" }}>
                    ancora nessuno
                  </div>
                ) : (
                  <div style={{ paddingBottom: 4 }}>
                    {[...sq.presi]
                      .sort((x, y) => (RUOLI_C.indexOf(ruoloDi(x.id)) - RUOLI_C.indexOf(ruoloDi(y.id))) || (y.prezzo - x.prezzo))
                      .map((x) => {
                        const p = perId[x.id];
                        return (
                          <div key={x.id} className="flex items-center gap-2" style={{ padding: "3px 10px" }}>
                            <RuoloC r={ruoloDi(x.id)} />
                            <button onClick={() => p && setSel(x.id)} className="flex-1 text-left min-w-0"
                              style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {p ? p.nome : "giocatore " + x.id}
                              <span style={{ ...mono, fontSize: 9.5, color: C.inchiostroTenue, marginLeft: 5, textTransform: "uppercase" }}>
                                {p?.squadra || ""}
                              </span>
                            </button>
                            <span style={{ ...mono, fontSize: 12, fontWeight: 700 }}>{x.prezzo}</span>
                          </div>
                        );
                      })}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>

      <div style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, marginTop: 12, lineHeight: 1.5 }}>
        I crediti che restano sono il budget del campionato meno quello che ognuno ha speso.
        Vale lo stesso budget per tutti, perché è quello della lega.
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  VISTA CAMPO                                                        */
/* ------------------------------------------------------------------ */

const NOME_LINEA = ["portiere", "difesa", "centrocampo", "trequarti", "attacco"];

/* appiattisce il modulo in caselle numerate mantenendo la linea di appartenenza */
function caselleDelModulo(modulo, mantra) {
  const linee = (mantra ? MODULI_M : MODULI_C)[modulo] || [];
  const out = [];
  linee.forEach((linea, li) => linea.forEach((slot) => out.push({ slot, linea: li })));
  return out;
}

function Campo({ lega, legaAttiva, asta, players, mdTab, setLeghe, leghe, formazioni, setFormazioni, m, statoIn }) {
  const L = lega(legaAttiva);
  const mantra = L.modalita === "mantra";
  const moduli = mantra ? Object.keys(MODULI_M) : Object.keys(MODULI_C);

  const F = formazioni[legaAttiva] || { modo: "auto", modulo: mantra ? "3-5-2" : "3-4-3", slots: [] };
  const setF = (patch) => setFormazioni((p) => ({ ...p, [legaAttiva]: { ...F, ...patch } }));

  useEffect(() => {
    if (!moduli.includes(F.modulo)) setF({ modulo: moduli[0], slots: [] });
  }, [mantra, legaAttiva]);

  const modulo = moduli.includes(F.modulo) ? F.modulo : moduli[0];
  const manuale = F.modo === "manuale";
  const caselle = caselleDelModulo(modulo, mantra);
  const slots = caselle.map((c) => c.slot);

  const val = (p) => p.fm || p.fmP || p.mv || p.mvP || 0;
  const mediaVoto = (p) => p.mv || p.mvP || 0;

  /* ---------- chi si puo' schierare ----------
     Di norma solo chi hai comprato. In simulazione si aggiungono i giocatori
     ancora liberi con il giudizio che hai scelto, cosi' prima dell'asta vedi
     che squadra verrebbe fuori se li prendessi tutti. */
  const comprati = asta(legaAttiva).rosa.map((x) => players.find((p) => p.id === x.id)).filter(Boolean);
  const simula = !!F.simula;
  const livelli = F.livelli || [5, 4];
  const soloMiei = F.soloMiei !== false;

  const presi = new Set(comprati.map((p) => p.id));
  const simulati = simula
    ? players.filter((p) =>
        !presi.has(p.id) &&
        !p.seed &&
        statoIn(p.id, legaAttiva) === "libero" &&
        livelli.includes(m(p.id).interesse) &&
        (!soloMiei || !!m(p.id).leghe[legaAttiva]))
    : [];

  const rosa = [...comprati, ...simulati];
  const finto = (p) => simula && !presi.has(p.id);
  const ordinata = [...rosa].sort((a, b) => val(b) - val(a));

  const esito = (p, slot) => esitoSlot(p, slot, mantra);
  const piazzabile = (p, slot) => ["ok", "malus"].includes(esito(p, slot));
  const perfetto = (p, slot) => esito(p, slot) === "ok";

  /* ---------- undici ---------- */
  let xi;
  if (manuale) {
    const posti = Array.from({ length: slots.length }, (_, i) => (F.slots || [])[i] || null);
    xi = caselle.map((c, i) => ({ ...c, i, p: posti[i] ? rosa.find((x) => x.id === posti[i]) || null : null }));
  } else {
    const match = assegna(slots, ordinata, perfetto);   // l'automatico non usa mai adattamenti
    xi = caselle.map((c, i) => ({ ...c, i, p: match[i] > -1 ? ordinata[match[i]] : null }));
  }

  const inCampo = new Set(xi.filter((s) => s.p).map((s) => s.p.id));
  const panchina = ordinata.filter((p) => !inCampo.has(p.id));
  const schierati = xi.filter((s) => s.p);
  const buchi = xi.length - schierati.length;
  const adattati = schierati.filter((s) => esito(s.p, s.slot) === "malus");

  /* ---------- copertura dei ruoli ----------
     Per ogni tipo di casella del modulo, quanti giocatori della rosa ci starebbero,
     nel loro ruolo o adattati. Confrontato con quante caselle di quel tipo chiede
     il modulo, dice dove sei scoperto e dove sei senza riserve. */
  const copertura = (() => {
    const tipi = [];
    for (const c of caselle) {
      const t = tipi.find((x) => x.slot === c.slot);
      if (t) t.caselle++;
      else tipi.push({ slot: c.slot, caselle: 1 });
    }
    return tipi.map((t) => {
      const quanti = rosa.filter((p) => piazzabile(p, t.slot)).length;
      return {
        ...t, quanti,
        stato: quanti < t.caselle ? "scarso" : quanti === t.caselle ? "giusto" : "coperto",
      };
    });
  })();

  /* Per ogni casella rimasta vuota adesso, cosa si puo' fare. */
  const rimedi = xi
    .filter((c) => !c.p)
    .map((c) => {
      const candidati = panchina
        .filter((p) => piazzabile(p, c.slot))
        .sort((a, b) => (perfetto(b, c.slot) - perfetto(a, c.slot)) || (val(b) - val(a)));
      const chi = candidati[0] || null;
      return {
        slot: c.slot,
        chi,
        adattato: chi ? !perfetto(chi, c.slot) : false,
        inRosa: rosa.filter((p) => piazzabile(p, c.slot)).length,
      };
    });

  /* ---------- bonus difensivo ---------- */
  let bonus = 0, mediaBonus = 0, bonusAttivo = false, spiegaBonus = "";
  if (mantra) {
    /* D-Factor, i 5 uomini difensivi, almeno 3 con lettera D o B */
    const difensivi = schierati.filter((s) => (s.p.rm || []).some((r) => RUOLI_DIF_M.includes(r))).map((s) => s.p);
    const scelti = [...difensivi].sort((a, b) => mediaVoto(b) - mediaVoto(a)).slice(0, 5);
    const puri = scelti.filter((p) => (p.rm || []).some((r) => RUOLI_D_PURI.includes(r))).length;
    const conPortiere = L.dFactorPortiere !== false;
    const por = schierati.find((s) => (s.p.rm || []).includes("Por"))?.p;
    bonusAttivo = scelti.length === 5 && puri >= 3 && (!conPortiere || !!por);
    if (bonusAttivo) {
      const voti = scelti.map(mediaVoto).concat(conPortiere ? [mediaVoto(por)] : []);
      mediaBonus = voti.reduce((s, v) => s + v, 0) / voti.length;
      bonus = mdBonus(mediaBonus, mdTab);
    }
    spiegaBonus = bonusAttivo
      ? `media ${mediaBonus.toFixed(2)} su ${conPortiere ? "portiere e 5" : "5"} uomini difensivi`
      : scelti.length < 5 ? "servono 5 uomini di stampo difensivo" : `servono almeno 3 tra Dc B Dd Ds, ora sono ${puri}`;
  } else {
    /* modificatore difesa Classic, portiere e i 3 migliori difensori, almeno 4 difensori */
    const por = schierati.find((s) => s.p.r === "P")?.p;
    const difs = schierati.filter((s) => s.p.r === "D").map((s) => s.p);
    bonusAttivo = !!por && difs.length >= 4;
    if (bonusAttivo) {
      const tre = [...difs].sort((a, b) => mediaVoto(b) - mediaVoto(a)).slice(0, 3);
      mediaBonus = (mediaVoto(por) + tre.reduce((s, p) => s + mediaVoto(p), 0)) / 4;
      bonus = mdBonus(mediaBonus, mdTab);
    }
    spiegaBonus = bonusAttivo ? `media ${mediaBonus.toFixed(2)} su portiere e 3 difensori` : "servono portiere e almeno 4 difensori";
  }

  const totale = schierati.reduce((s, x) => s + val(x.p), 0) + bonus - adattati.length;

  /* ---------- trascinamento ---------- */
  const [drag, setDrag] = useState(null);

  function posiziona(id, daIndice, aIndice) {
    const posti = Array.from({ length: slots.length }, (_, i) => (F.slots || [])[i] || null);
    if (daIndice != null) posti[daIndice] = null;
    const giaAltrove = posti.indexOf(id);
    if (giaAltrove > -1) posti[giaAltrove] = null;
    if (aIndice != null) {
      const sloggiato = posti[aIndice];
      posti[aIndice] = id;
      if (sloggiato && daIndice != null) posti[daIndice] = sloggiato;
    }
    setF({ slots: posti, modo: "manuale" });
  }

  function slotSotto(x, y) {
    const box = document.elementFromPoint(x, y)?.closest?.("[data-slot]");
    return box ? parseInt(box.getAttribute("data-slot"), 10) : null;
  }
  function avvioDrag(e, id, da) {
    if (!manuale) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id, da, x: e.clientX, y: e.clientY, sopra: null });
  }
  function muoviDrag(e) {
    if (!drag) return;
    e.preventDefault();
    setDrag((d) => d && { ...d, x: e.clientX, y: e.clientY, sopra: slotSotto(e.clientX, e.clientY) });
  }
  function fineDrag(e) {
    if (!drag) return;
    const dest = slotSotto(e.clientX, e.clientY);
    const g = rosa.find((p) => p.id === drag.id);
    if (dest != null && g && piazzabile(g, slots[dest])) posiziona(drag.id, drag.da, dest);
    else if (dest == null && drag.da != null) posiziona(drag.id, drag.da, null);
    setDrag(null);
  }

  /* ---------- tocco singolo ---------- */
  const [scelto, setScelto] = useState(null);
  function tocca(id, da) { if (manuale) setScelto((s) => (s && s.id === id ? null : { id, da })); }
  function toccaSlot(i) {
    if (!manuale) return;
    if (scelto) {
      const g = rosa.find((p) => p.id === scelto.id);
      if (g && piazzabile(g, slots[i])) posiziona(scelto.id, scelto.da, i);
      setScelto(null);
      return;
    }
    if (xi[i]?.p) setScelto({ id: xi[i].p.id, da: i });
  }

  const gAttivo = drag ? rosa.find((p) => p.id === drag.id) : (scelto ? rosa.find((p) => p.id === scelto.id) : null);
  const statoCasella = (i) => gAttivo ? esito(gAttivo, slots[i]) : null;

  const linee = [0, 1, 2, 3, 4].map((n) => xi.filter((s) => s.linea === n));

  return (
    <div onPointerMove={muoviDrag} onPointerUp={fineDrag} onPointerCancel={fineDrag}>
      {/* regolamento */}
      <div className="flex items-center gap-2 flex-wrap">
        <span style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".1em" }}>regolamento</span>
        <Btn piccolo attivo={!mantra} onClick={() => setLeghe(leghe.map((l) => l.id === legaAttiva ? { ...l, modalita: "classic" } : l))}>classic</Btn>
        <Btn piccolo tono="rosa" attivo={mantra} onClick={() => setLeghe(leghe.map((l) => l.id === legaAttiva ? { ...l, modalita: "mantra" } : l))}>mantra</Btn>
      </div>

      {/* modo formazione */}
      <div className="flex items-center gap-2 flex-wrap mt-2">
        <span style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".1em" }}>formazione</span>
        <Btn piccolo tono="campo" attivo={!manuale} onClick={() => setF({ modo: "auto" })}>automatica</Btn>
        <Btn piccolo tono="campo" attivo={manuale} onClick={() => setF({ modo: "manuale" })}>a mano</Btn>
        {manuale && (
          <>
            <Btn piccolo onClick={() => {
              const match = assegna(slots, ordinata, perfetto);
              setF({ slots: slots.map((_, i) => (match[i] > -1 ? ordinata[match[i]].id : null)) });
            }}>riempi da sola</Btn>
            <Btn piccolo onClick={() => setF({ slots: [] })}>svuota</Btn>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-2">
        <span style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".1em" }}>simulazione</span>
        <Btn piccolo tono="rosa" attivo={simula} onClick={() => setF({ simula: !simula, slots: [] })}>
          {simula ? "attiva" : "spenta"}
        </Btn>
        {simula && (
          <Btn piccolo attivo={soloMiei} onClick={() => setF({ soloMiei: !soloMiei, slots: [] })}>
            {soloMiei ? "solo questo campionato" : "tutti i campionati"}
          </Btn>
        )}
      </div>

      {simula && (
        <>
          <div className="flex gap-1 mt-2 flex-wrap">
            {[5, 4, 3, 2].map((k) => {
              const liv = INTERESSE[k];
              const on = livelli.includes(k);
              return (
                <button key={k}
                  onClick={() => setF({ livelli: on ? livelli.filter((x) => x !== k) : [...livelli, k], slots: [] })}
                  style={{
                    padding: "5px 9px", borderRadius: 2, fontSize: 11, fontWeight: 700, ...display,
                    textTransform: "uppercase", letterSpacing: ".03em",
                    border: `1.5px solid ${on ? liv.col : C.riga}`,
                    background: on ? liv.col : "transparent",
                    color: on ? "#fff" : C.inchiostroTenue,
                  }}>{liv.label}</button>
              );
            })}
          </div>
          <div style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, marginTop: 6, lineHeight: 1.5 }}>
            {comprati.length} {comprati.length === 1 ? "comprato" : "comprati"} più {simulati.length} da prendere.
            I simulati hanno il bordo tratteggiato, i crediti non vengono toccati.
          </div>
        </>
      )}

      <div className="flex gap-1 mt-2 flex-wrap">
        {moduli.map((k) => (
          <Btn key={k} piccolo attivo={modulo === k} onClick={() => setF({ modulo: k, slots: [] })}>{k}</Btn>
        ))}
      </div>

      {/* riepilogo */}
      <div className="flex gap-2 mt-3">
        <div style={{ flex: 1, background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: "8px 10px" }}>
          <div style={{ ...mono, fontSize: 9.5, color: simula ? C.rosa : C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".1em" }}>
            {simula ? "fantapunti simulati" : "fantapunti stimati"}
          </div>
          <div style={{ ...mono, fontSize: 26, fontWeight: 700 }}>{totale.toFixed(1)}</div>
          {adattati.length > 0 && (
            <div style={{ ...mono, fontSize: 10, color: C.ocra }}>{adattati.length} fuori posizione, meno {adattati.length}</div>
          )}
        </div>
        <div style={{ flex: 1, background: bonusAttivo ? C.campo : "#fff", color: bonusAttivo ? "#fff" : C.inchiostro, border: `1px solid ${bonusAttivo ? C.campo : C.riga}`, borderRadius: 3, padding: "8px 10px" }}>
          <div style={{ ...mono, fontSize: 9.5, opacity: .7, textTransform: "uppercase", letterSpacing: ".1em" }}>
            {mantra ? "fattore difensivo" : "modificatore difesa"}
          </div>
          <div style={{ ...mono, fontSize: 26, fontWeight: 700 }}>{bonusAttivo ? `+${bonus}` : "off"}</div>
          <div style={{ ...mono, fontSize: 10, opacity: .75 }}>{spiegaBonus}</div>
        </div>
      </div>

      {buchi > 0 && (
        <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(200,137,42,.14)", border: `1px solid ${C.ocra}`, borderRadius: 3, fontSize: 12.5 }}>
          <div style={{ fontWeight: 700 }}>
            Scoperto in {[...new Set(rimedi.map((r) => etichettaSlot(r.slot)))].join(", ")}
          </div>
          {rimedi.map((r, i) => (
            <div key={i} style={{ ...mono, fontSize: 11, marginTop: 3 }}>
              {etichettaSlot(r.slot)}
              {r.chi
                ? <> · lo copri con <b>{r.chi.nome}</b>{r.adattato ? ", adattato, meno un punto" : ", nel suo ruolo"}</>
                : r.inRosa > 0
                  ? <> · ne hai {r.inRosa} in rosa, ma sono già tutti in campo</>
                  : <> · nessuno in rosa ci sta, serve comprarlo</>}
            </div>
          ))}
        </div>
      )}

      {/* copertura dei ruoli */}
      <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: "9px 11px", marginTop: 8 }}>
        <div className="flex items-baseline justify-between">
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>Copertura dei ruoli</div>
          <div style={{ ...mono, fontSize: 9.5, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".08em" }}>
            in rosa / caselle
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {copertura.map((c, i) => {
            const colore = c.stato === "scarso" ? C.rosa : c.stato === "giusto" ? C.ocra : C.riga;
            const sfondo = c.stato === "coperto" ? "transparent" : c.stato === "giusto" ? "rgba(200,137,42,.12)" : "rgba(208,46,94,.10)";
            return (
              <div key={i} title={`${c.quanti} in rosa ci stanno, il modulo chiede ${c.caselle} ${c.caselle === 1 ? "casella" : "caselle"} di questo tipo`}
                style={{ border: `1.5px solid ${colore}`, background: sfondo, borderRadius: 2, padding: "4px 8px", minWidth: 62 }}>
                <div style={{ ...mono, fontSize: 9.5, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".05em" }}>
                  {etichettaSlot(c.slot)}
                </div>
                <div style={{ ...mono, fontSize: 13.5, fontWeight: 700 }}>
                  {c.quanti}<span style={{ fontSize: 10, color: C.inchiostroTenue }}>/{c.caselle}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, marginTop: 7, lineHeight: 1.5 }}>
          Il numero è quanti ne hai in rosa per quel tipo di casella, adattamenti compresi.
          Bordo rosso non bastano, bordo arancio ci arrivi esatto senza riserve, bordo chiaro hai margine.
        </div>
      </div>

      {manuale && (
        <div style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, marginTop: 8, lineHeight: 1.5 }}>
          Trascina un giocatore sulla casella, oppure toccalo e poi tocca dove metterlo.
          Bordo verde casella nel ruolo, bordo arancio schieramento adattato con meno un punto, nessun bordo non ammesso.
        </div>
      )}

      {/* campo */}
      <div style={{ marginTop: 8, background: C.campo, borderRadius: 4, padding: "14px 8px", backgroundImage: "repeating-linear-gradient(180deg,rgba(255,255,255,.05) 0 26px,transparent 26px 52px)" }}>
        {linee.map((linea, li) => linea.length === 0 ? null : (
          <div key={li} className="flex justify-center gap-1.5 flex-wrap" style={{ marginBottom: 10 }}>
            {linea.map((s) => {
              const st = statoCasella(s.i);
              const evidenziata = st === "ok" || st === "malus";
              const suSotto = drag && drag.sopra === s.i;
              const adattato = s.p && esito(s.p, s.slot) === "malus";
              const selezionata = scelto && s.p && scelto.id === s.p.id;
              return (
                <div
                  key={s.i}
                  data-slot={s.i}
                  onPointerDown={(e) => s.p && avvioDrag(e, s.p.id, s.i)}
                  onClick={() => toccaSlot(s.i)}
                  style={{
                    minWidth: 70, maxWidth: 96, borderRadius: 3, padding: "5px 4px", textAlign: "center",
                    background: s.p
                      ? (drag?.id === s.p.id ? "rgba(255,255,255,.4)" : "rgba(255,255,255,.94)")
                      : evidenziata ? (suSotto ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.4)") : "rgba(255,255,255,.16)",
                    border: selezionata ? `2px solid ${C.rosa}`
                      : evidenziata ? `2px solid ${st === "ok" ? "#8FE3B4" : C.ocra}`
                        : adattato ? `2px solid ${C.ocra}`
                          : s.p ? (finto(s.p) ? `2px dashed ${C.rosa}` : "2px solid transparent")
                          : "1px dashed rgba(255,255,255,.5)",
                    touchAction: manuale ? "none" : "auto",
                    cursor: manuale ? "grab" : "default",
                  }}
                >
                  <div style={{ ...mono, fontSize: 8.5, letterSpacing: ".06em", color: s.p ? C.inchiostroTenue : "rgba(255,255,255,.85)", textTransform: "uppercase" }}>
                    {etichettaSlot(s.slot)}{adattato ? " ⚠" : ""}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: s.p ? C.inchiostro : "rgba(255,255,255,.9)", lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.p ? s.p.nome.split(" ")[0] : "vuota"}
                  </div>
                  {s.p && <div style={{ ...mono, fontSize: 10, color: C.campo, fontWeight: 700 }}>{val(s.p).toFixed(2)}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* panchina */}
      <div style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, margin: "12px 0 4px", textTransform: "uppercase", letterSpacing: ".1em" }}>
        panchina, {panchina.length}{simula && panchina.filter(finto).length > 0 ? `, di cui ${panchina.filter(finto).length} da prendere` : ""}
      </div>
      <div className="flex flex-wrap gap-1.5" style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: 8, minHeight: 50 }}>
        {panchina.length === 0 && (
          <div style={{ ...mono, fontSize: 11.5, color: C.inchiostroTenue, padding: 6 }}>Nessun giocatore fuori dagli undici</div>
        )}
        {panchina.map((p) => {
          const preso = scelto?.id === p.id;
          return (
            <div
              key={p.id}
              onPointerDown={(e) => avvioDrag(e, p.id, null)}
              onClick={() => tocca(p.id, null)}
              style={{
                border: finto(p) ? `1.5px dashed ${preso ? C.rosa : C.riga}` : `1.5px solid ${preso ? C.rosa : C.riga}`,
                background: preso ? "rgba(208,46,94,.1)" : drag?.id === p.id ? C.cartaScura : "transparent",
                borderRadius: 3, padding: "4px 7px", minWidth: 74,
                touchAction: manuale ? "none" : "auto",
                cursor: manuale ? "grab" : "default",
                opacity: manuale ? 1 : .75,
              }}
            >
              <div style={{ ...mono, fontSize: 8.5, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".05em" }}>
                {mantra ? (p.rm || []).join("/") : p.r}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.15, maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</div>
              <div style={{ ...mono, fontSize: 9.5, color: C.inchiostroTenue }}>{val(p).toFixed(2)}</div>
            </div>
          );
        })}
      </div>

      <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, marginTop: 8, lineHeight: 1.5 }}>
        Fantapunti stimati sulla fantamedia, bonus difensivo stimato sulla media voto pura, come da regolamento.
        {mantra && " In Mantra i modificatori Classic non si applicano, al loro posto c'è il D-Factor."}
      </div>

      {drag && gAttivo && (
        <div style={{
          position: "fixed", left: drag.x, top: drag.y, transform: "translate(-50%,-140%)",
          pointerEvents: "none", zIndex: 60,
          background: C.inchiostro, color: C.carta, borderRadius: 3, padding: "5px 9px",
          boxShadow: "0 6px 18px rgba(0,0,0,.35)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, ...display }}>{gAttivo.nome}</div>
          <div style={{ ...mono, fontSize: 9, opacity: .7, textTransform: "uppercase" }}>
            {mantra ? (gAttivo.rm || []).join("/") : gAttivo.r}
          </div>
        </div>
      )}
    </div>
  );
}
/* ------------------------------------------------------------------ */
/*  VISTA DATI                                                         */
/* ------------------------------------------------------------------ */

function Dati({ importaFile, importaProbabili, probabili, setProbabili, players, setPlayers, leghe, setLeghe, meta, aste, formazioni, setMeta, setAste, setFormazioni, legaAttiva, setLegaAttiva, mdTab, setMdTab, admin, codice, rivaliDi, aggiungiRivale, rinominaRivale, togliRivale }) {
  const [msg, setMsg] = useState("");
  /* il nome che stai scrivendo, uno per campionato */
  const [nuovoRivale, setNuovoRivale] = useState({});
  const [esitoProb, setEsitoProb] = useState(null);
  /* quale campionato stai rinominando da questo pannello */
  const [rinominaQui, setRinominaQui] = useState(null);
  const ref = useRef();
  const refProb = useRef();
  const rifBackup = useRef();

  /* la pagina delle probabili, una sola alla volta, salvata dal browser */
  async function onProbabili(e) {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setEsitoProb({ attesa: true });
    setEsitoProb(await importaProbabili(f));
  }

  async function onFiles(e) {
    /* Prima le quotazioni, che stabiliscono chi fa parte del listone,
       poi le statistiche, che si limitano ad arricchire chi c'e' gia'. */
    const files = [...e.target.files].sort((a, b) => {
      const q = (f) => (/quotazion/i.test(f.name) ? 0 : 1);
      return q(a) - q(b);
    });
    /* Qual e' la stagione in corso. Di norma la dice il calendario, ma se carichi
       file di una stagione ancora piu' avanti vince quella. */
    const anni = files.map((f) => annoDalNome(f.name)).filter(Boolean);
    const corrente = Math.max(annoStagioneOggi(), ...(anni.length ? anni : [0]));
    const esiti = [];
    for (const f of files) {
      const a = annoDalNome(f.name);
      const stagione = a === null || a >= corrente ? "corrente" : "precedente";
      esiti.push((await importaFile(f, stagione)).msg);
    }
    setMsg(esiti.join(" · "));
    e.target.value = "";
  }

  /* un campionato in piu', con il primo identificativo libero */
  function aggiungiCampionato() {
    if (leghe.length >= LEGHE_MAX) return;
    const id = prossimoIdLega(leghe);
    setLeghe([...leghe, {
      id, nome: "Campionato " + id.slice(1), budget: 500,
      modalita: "classic", rosaMax: { P: 3, D: 8, C: 8, A: 6 },
    }]);
  }

  /* togliendo un campionato spariscono i suoi acquisti e la sua formazione.
     I giudizi sui giocatori restano, quelli valgono per tutti i campionati. */
  function togliCampionato(l) {
    if (leghe.length <= 1) return;
    if (!confirm(`Tolgo ${l.nome} con i suoi acquisti e la sua formazione. I giudizi sui giocatori restano.`)) return;
    setLeghe(leghe.filter((x) => x.id !== l.id));
    setAste((p) => { const q = { ...p }; delete q[l.id]; return q; });
    setFormazioni((p) => { const q = { ...p }; delete q[l.id]; return q; });
    setMeta((p) => {
      const q = {};
      for (const [gid, v] of Object.entries(p)) {
        const inLeghe = { ...(v.leghe || {}) }; delete inLeghe[l.id];
        const massimi = { ...(v.max || {}) }; delete massimi[l.id];
        q[gid] = { ...v, leghe: inLeghe, max: massimi };
      }
      return q;
    });
    if (legaAttiva === l.id) setLegaAttiva(leghe.find((x) => x.id !== l.id).id);
  }

  return (
    <>
      {/* il pannello import lo vede solo chi entra con la parola d'amministratore */}
      {!admin && (
        <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Listone</div>
          <div style={{ fontSize: 12.5, color: C.inchiostroTenue, marginTop: 4, lineHeight: 1.45 }}>
            Il listone lo aggiorna l'amministratore. Qui trovi sempre l'ultima versione caricata.
          </div>
          <div style={{ ...mono, fontSize: 11, color: C.inchiostroTenue, marginTop: 8 }}>
            {players.filter((p) => !p.seed).length} giocatori importati, {players.length} in elenco
          </div>
          <div style={{ ...mono, fontSize: 11, color: C.inchiostroTenue, marginTop: 4 }}>
            {probabili?.squadre?.length
              ? `probabili di ${probabili.squadre.length} squadre${probabili.aggiornata ? ", aggiornate al " + quandoLeggibile(probabili.aggiornata) : ""}`
              : "probabili formazioni non ancora caricate"}
          </div>
        </div>
      )}

      {admin && (
      <div style={{ background: "#fff", border: `2px solid ${C.rosa}`, borderRadius: 3, padding: 12 }}>
        <div className="flex items-baseline gap-2">
          <div style={{ fontSize: 15, fontWeight: 800 }}>Importa da FantaGazzetta</div>
          <span style={{ ...mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.1em",
            color: C.rosa, border: `1px solid ${C.rosa}`, borderRadius: 2, padding: "1px 5px" }}>riservato</span>
        </div>
        <div style={{ fontSize: 12.5, color: C.inchiostroTenue, marginTop: 4, lineHeight: 1.45 }}>
          Carica i file xlsx di quotazioni e statistiche. L'aggancio avviene sull'Id, quindi etichette, prezzi massimi e note restano al loro posto a ogni aggiornamento.
        </div>
        <input ref={ref} type="file" accept=".xlsx,.xls" multiple onChange={onFiles} style={{ display: "none" }} />
        <div className="mt-3"><Btn attivo onClick={() => ref.current.click()}>scegli i file</Btn></div>
        {msg && <div style={{ ...mono, fontSize: 11.5, color: C.campo, marginTop: 8 }}>{msg}</div>}
        <div style={{ ...mono, fontSize: 11, color: C.inchiostroTenue, marginTop: 8 }}>
          {players.filter((p) => !p.seed).length} giocatori importati, {players.length} in elenco
        </div>
      </div>
      )}

      {admin && (
      <div style={{ background: "#fff", border: `2px solid ${C.rosa}`, borderRadius: 3, padding: 12, marginTop: 10 }}>
        <div className="flex items-baseline gap-2">
          <div style={{ fontSize: 15, fontWeight: 800 }}>Probabili formazioni</div>
          <span style={{ ...mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.1em",
            color: C.rosa, border: `1px solid ${C.rosa}`, borderRadius: 2, padding: "1px 5px" }}>riservato</span>
        </div>
        <div style={{ fontSize: 12.5, color: C.inchiostroTenue, marginTop: 4, lineHeight: 1.45 }}>
          Apri le probabili formazioni su Fantacalcio.it e salva la pagina con File,
          Salva con nome, Pagina web solo HTML. Poi carica qui quel file. Anche qui l'aggancio
          avviene sull'Id, quindi non conta come sono scritti i nomi.
        </div>
        <input ref={refProb} type="file" accept=".html,.htm,text/html" onChange={onProbabili} style={{ display: "none" }} />
        <div className="mt-3"><Btn attivo onClick={() => refProb.current.click()}>scegli la pagina salvata</Btn></div>

        {esitoProb?.attesa && (
          <div style={{ ...mono, fontSize: 11.5, color: C.inchiostroTenue, marginTop: 8 }}>leggo la pagina</div>
        )}
        {esitoProb && !esitoProb.attesa && !esitoProb.ok && (
          <div style={{ ...mono, fontSize: 11.5, color: C.rosa, marginTop: 8, lineHeight: 1.5 }}>{esitoProb.msg}</div>
        )}
        {esitoProb?.ok && (
          <div style={{ ...mono, fontSize: 11.5, marginTop: 8, lineHeight: 1.6 }}>
            <div style={{ color: C.campo }}>
              {esitoProb.squadre} squadre e {esitoProb.giocatori} giocatori letti, {esitoProb.titolari} titolari
              {esitoProb.giornata ? `, giornata ${esitoProb.giornata}` : ""}
              {esitoProb.aggiornata ? `, la pagina dice ${quandoLeggibile(esitoProb.aggiornata)}` : ", la pagina non dice quando è stata aggiornata"}
            </div>
            {esitoProb.senzaListone ? (
              <div style={{ color: C.ocra }}>
                Il listone non c'è ancora, quindi l'aggancio non l'ho potuto controllare. Importa prima gli Excel.
              </div>
            ) : esitoProb.fuori.length ? (
              <div style={{ color: C.ocra }}>
                {esitoProb.fuori.length} senza riscontro nel listone, {esitoProb.fuori.slice(0, 24).join(", ")}
                {esitoProb.fuori.length > 24 ? " e altri " + (esitoProb.fuori.length - 24) : ""}
              </div>
            ) : (
              <div style={{ color: C.campo }}>Tutti agganciati al listone</div>
            )}
          </div>
        )}

        <div style={{ ...mono, fontSize: 11, color: C.inchiostroTenue, marginTop: 8 }}>
          {probabili?.squadre?.length
            ? `in memoria ${probabili.squadre.length} squadre${probabili.aggiornata ? ", aggiornate al " + quandoLeggibile(probabili.aggiornata) : ""}`
            : "nessuna pagina caricata finora"}
        </div>
      </div>
      )}

      <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: 12, marginTop: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>I tuoi campionati</div>
        <div style={{ fontSize: 12.5, color: C.inchiostroTenue, marginTop: 4, lineHeight: 1.45 }}>
          Crediti a disposizione e regolamento. Puoi tenerne uno solo oppure fino a {LEGHE_MAX},
          il giudizio sui giocatori resta comunque uno e vale per tutti.
          Il <b>nome</b> si cambia con la pennina qui sotto, oppure dalla testata toccando
          il nome del campionato con la stella.
        </div>
        {leghe.map((l) => (
          <div key={l.id} className="flex items-center gap-2 mt-2">
            {rinominaQui === l.id ? (
              <input
                autoFocus
                value={l.nome}
                onChange={(e) => setLeghe(leghe.map((x) => x.id === l.id ? { ...x, nome: e.target.value } : x))}
                onBlur={() => setRinominaQui(null)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setRinominaQui(null); }}
                style={{ flex: 1, minWidth: 0, padding: "6px 8px", border: `1px solid ${C.rosa}`, borderRadius: 2, fontSize: 13, ...display }}
              />
            ) : (
              <span className="flex items-center gap-1 min-w-0" style={{ flex: 1 }}>
                <span style={{ minWidth: 0, fontSize: 13.5, fontWeight: 700,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.nome}
                </span>
                <button onClick={() => setRinominaQui(l.id)} title={"rinomina " + l.nome}
                  style={{ fontSize: 12, lineHeight: 1, color: C.rosa, padding: "0 3px", flex: "0 0 auto" }}>
                  ✎
                </button>
              </span>
            )}
            <input
              value={l.budget} inputMode="numeric"
              onChange={(e) => setLeghe(leghe.map((x) => x.id === l.id ? { ...x, budget: parseInt(e.target.value || 0, 10) } : x))}
              style={{ width: 62, padding: "6px 8px", border: `1px solid ${C.riga}`, borderRadius: 2, ...mono, fontSize: 13, textAlign: "center" }}
            />
            <Btn piccolo tono="rosa" attivo={l.modalita === "mantra"}
              onClick={() => setLeghe(leghe.map((x) => x.id === l.id ? { ...x, modalita: x.modalita === "mantra" ? "classic" : "mantra" } : x))}>
              {l.modalita}
            </Btn>
            {leghe.length > 1 && (
              <button onClick={() => togliCampionato(l)} title={"togli " + l.nome}
                style={{ ...mono, fontSize: 15, lineHeight: 1, color: C.inchiostroTenue,
                  border: `1px solid ${C.riga}`, borderRadius: 2, padding: "4px 9px", background: "#fff" }}>
                −
              </button>
            )}
          </div>
        ))}
        <div className="mt-3">
          {leghe.length < LEGHE_MAX
            ? <Btn onClick={aggiungiCampionato}>+ aggiungi campionato</Btn>
            : <span style={{ ...mono, fontSize: 11, color: C.inchiostroTenue }}>
                sei campionati sono il massimo
              </span>}
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: 12, marginTop: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Gli altri della lega</div>
        <div style={{ fontSize: 12.5, color: C.inchiostroTenue, marginTop: 4, lineHeight: 1.45 }}>
          I nomi delle squadre con cui giochi. Servono all'asta, perché quando segni un giocatore
          preso da un altro ti viene chiesto di chi è. Da lì la scheda Aste Tracker tiene il conto
          di quanto ha speso ognuno e di quali caselle ha già riempito.
        </div>
        {leghe.map((l) => {
          const rivali = rivaliDi(l.id);
          const scritto = nuovoRivale[l.id] || "";
          const metti = () => {
            if (!scritto.trim()) return;
            aggiungiRivale(l.id, scritto);
            setNuovoRivale({ ...nuovoRivale, [l.id]: "" });
          };
          return (
            <div key={l.id} style={{ borderTop: `1px solid ${C.riga}`, marginTop: 10, paddingTop: 8 }}>
              <div className="flex items-baseline justify-between gap-2">
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{l.nome}</span>
                <span style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".08em" }}>
                  {rivali.length === 0 ? "nessuna squadra" : rivali.length === 1 ? "1 squadra" : rivali.length + " squadre"}
                </span>
              </div>
              {rivali.map((r) => (
                <div key={r.id} className="flex items-center gap-2 mt-2">
                  <input
                    value={r.nome}
                    onChange={(e) => rinominaRivale(l.id, r.id, e.target.value)}
                    style={{ flex: 1, minWidth: 0, padding: "6px 8px", border: `1px solid ${C.riga}`, borderRadius: 2, fontSize: 13, ...display }}
                  />
                  <Btn piccolo tono="rosa" title={"togli " + r.nome}
                    onClick={() => {
                      const suoi = (aste[l.id]?.altrui || []).filter((x) => x.team === r.id).length;
                      const avviso = suoi
                        ? `Tolgo ${r.nome}. I ${suoi} giocatori che gli avevi assegnato restano, ma finiscono tra quelli presi da non so chi.`
                        : `Tolgo ${r.nome} da ${l.nome}`;
                      if (confirm(avviso)) togliRivale(l.id, r.id);
                    }}>
                    − togli
                  </Btn>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input
                  value={scritto}
                  onChange={(e) => setNuovoRivale({ ...nuovoRivale, [l.id]: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") metti(); }}
                  placeholder="Nome di una squadra avversaria"
                  style={{ flex: 1, minWidth: 0, padding: "6px 8px", border: `1px solid ${C.riga}`, borderRadius: 2, fontSize: 13, ...display }}
                />
                <Btn piccolo attivo={!!scritto.trim()} onClick={metti}>aggiungi</Btn>
              </div>
            </div>
          );
        })}
        <div style={{ ...mono, fontSize: 11, color: C.inchiostroTenue, marginTop: 10, lineHeight: 1.5 }}>
          Il nome si corregge scrivendoci sopra, e il tasto <b>togli</b> la elimina.
          Il budget è lo stesso per tutti, è quello del campionato qui sopra. Rinominare una squadra
          non stacca i giocatori che le avevi assegnato.
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: 12, marginTop: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Fasce del bonus difensivo</div>
        <div style={{ fontSize: 12.5, color: C.inchiostroTenue, marginTop: 4, lineHeight: 1.45 }}>
          Sono le sei fasce di Leghe Fantacalcio. I punti li decide ogni lega, quindi metti qui i vostri.
          Valgono sia per il modificatore difesa Classic sia per il fattore difensivo Mantra.
        </div>
        {mdTab.map((f, i) => (
          <div key={i} className="flex items-center gap-2 mt-2">
            <span style={{ ...mono, flex: 1, fontSize: 12.5 }}>
              {i === 0 ? "sotto 6" : i === mdTab.length - 1 ? "da 7 in su" : `da ${String(f.min).replace(".", ",")} a ${String(f.max).replace(".", ",")}`}
            </span>
            <input
              value={f.bonus} inputMode="decimal"
              onChange={(e) => setMdTab(mdTab.map((x, j) => j === i ? { ...x, bonus: num(e.target.value) } : x))}
              style={{ width: 60, padding: "5px", border: `1px solid ${C.riga}`, borderRadius: 2, ...mono, fontSize: 14, fontWeight: 700, textAlign: "center" }}
            />
          </div>
        ))}
        <div className="flex items-center gap-2 mt-3">
          <span style={{ flex: 1, fontSize: 13 }}>Portiere incluso nel fattore difensivo Mantra</span>
          <Btn piccolo tono="campo" attivo={leghe.every((l) => l.dFactorPortiere !== false)}
            onClick={() => {
              const acceso = leghe.every((l) => l.dFactorPortiere !== false);
              setLeghe(leghe.map((l) => ({ ...l, dFactorPortiere: !acceso })));
            }}>
            {leghe.every((l) => l.dFactorPortiere !== false) ? "sì, media su 6" : "no, media su 5"}
          </Btn>
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: 12, marginTop: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Backup</div>
        <div style={{ fontSize: 12.5, color: C.inchiostroTenue, marginTop: 4, lineHeight: 1.45 }}>
          Scarica un file con tutto il tuo lavoro. Serve per passare da un dispositivo all'altro e per rimettere le cose a posto se il browser cancella i dati.
        </div>
        <div className="flex gap-2 mt-2 flex-wrap">
          <Btn piccolo attivo onClick={async () => {
            const b = new Blob([JSON.stringify({ players, meta, aste, leghe, formazioni, mdTab, aggiornatoIl: new Date().toISOString() })], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(b);
            a.download = `sala-aste-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
          }}>scarica backup</Btn>
          <Btn piccolo onClick={() => rifBackup.current.click()}>ripristina backup</Btn>
        </div>
        <input ref={rifBackup} type="file" accept=".json" style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            const testo = await f.text();
            const v = JSON.parse(testo);
            const quando = new Date().toISOString();
            /* il backup vecchio teneva tutto insieme, quello nuovo pure, quindi lo dividiamo qui */
            await window.storage.set(chiaveStato(codice), JSON.stringify({
              meta: v.meta || {}, aste: v.aste || {}, leghe: v.leghe, formazioni: v.formazioni || {},
              mdTab: v.mdTab, aggiornatoIl: quando,
            }));
            if (v.players?.length) await window.storage.set(CHIAVE_LISTONE, JSON.stringify({ players: v.players, aggiornatoIl: quando }));
            location.reload();
          }} />
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: 12, marginTop: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Azzera</div>
        <div className="flex gap-2 mt-2 flex-wrap">
          <Btn piccolo onClick={() => { if (confirm("Cancello gli acquisti di tutti i campionati")) setAste({}); }}>svuota le aste</Btn>
          <Btn piccolo onClick={() => { if (confirm("Cancello etichette, prezzi massimi e note")) setMeta({}); }}>svuota i giudizi</Btn>
          {admin && <Btn piccolo onClick={() => { if (confirm("Cancello il listone importato")) setPlayers(SEED); }}>svuota il listone</Btn>}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  VISTA PROBABILI                                                    */
/*  Le probabili formazioni dell'ultima giornata, squadra per squadra. */
/*  Le squadre restano nell'ordine della pagina, cosi' le due di ogni  */
/*  partita si leggono una accanto all'altra.                          */
/* ------------------------------------------------------------------ */

function Probabili({ probabili, players, leghe, m, nLeghe, statoIn, setSel }) {
  /* dal listone ricaviamo Id -> giocatore, serve per aprire la scheda
     e per sapere se e' uno che ti riguarda */
  const perId = useMemo(() => {
    const o = {};
    for (const p of players) if (!p.seed) o[p.id] = p;
    return o;
  }, [players]);

  /* Chi ti interessa davvero. Prima chi hai gia' in una rosa, poi chi hai
     segnato come target, cioe' da Mi piace in su oppure marcato per un campionato. */
  const tuo = (id) => {
    if (!perId[id]) return null;
    if (leghe.some((l) => statoIn(id, l.id) === "mio")) return "rosa";
    if (m(id).interesse >= 3 || nLeghe(id) > 0) return "target";
    return null;
  };

  if (!probabili?.squadre?.length) {
    return (
      <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Ancora nessuna probabile formazione</div>
        <div style={{ fontSize: 13, color: C.inchiostroTenue, marginTop: 6, lineHeight: 1.5 }}>
          Le carica l'amministratore dal pannello Dati, prendendo la pagina delle probabili
          di Fantacalcio.it salvata dal browser. Appena le carica compaiono anche qui.
        </div>
      </div>
    );
  }

  /* La data la dice la pagina di Fantacalcio.it. Se in quella pagina non c'era,
     non mostriamo nessuna data, perche' una data inventata da noi non vale niente. */
  const giorni = giorniDa(probabili.aggiornata);
  const vecchie = giorni != null && giorni > 7;
  const soprattitolo = probabili.aggiornata
    ? (probabili.giornata ? `giornata ${probabili.giornata}, aggiornate al` : "aggiornate al")
    : "probabili formazioni";
  const titolo = probabili.aggiornata
    ? quandoLeggibile(probabili.aggiornata)
    : (probabili.giornata ? `Giornata ${probabili.giornata}` : "Probabili formazioni");

  /* quanti dei tuoi sono dati titolari, e' il motivo per cui guardi questa scheda */
  const miei = [];
  for (const sq of probabili.squadre) for (const g of sq.giocatori) if (tuo(g.id)) miei.push(g);
  const mieiTitolari = miei.filter((g) => fasciaTitolarita(g.perc) === "titolare").length;

  const voce = (g) => {
    const q = tuo(g.id);
    const col = COLORE_FASCIA[fasciaTitolarita(g.perc)];
    return (
      <div key={g.id} className="flex items-center gap-2"
        style={{
          borderBottom: `1px solid ${C.riga}`, padding: "5px 6px",
          background: q === "rosa" ? "rgba(31,107,74,.10)" : q === "target" ? "rgba(208,46,94,.07)" : "transparent",
        }}>
        <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2,
          background: q === "rosa" ? C.campo : q === "target" ? C.rosa : "transparent" }} />
        <div style={{ ...mono, width: 14, fontSize: 11, fontWeight: 700, color: C.inchiostroTenue }}>{g.ruolo}</div>
        {perId[g.id] ? (
          <button onClick={() => setSel(g.id)} className="flex-1 text-left min-w-0"
            style={{ fontSize: 13, fontWeight: q ? 800 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {g.nome}
          </button>
        ) : (
          /* non sta nel listone, quindi non ha una scheda da aprire */
          <span className="flex-1 min-w-0" title="non è nel listone"
            style={{ fontSize: 13, fontWeight: 600, color: C.inchiostroTenue, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {g.nome} °
          </span>
        )}
        <div style={{ ...mono, fontSize: 12, fontWeight: 700, color: col, minWidth: 34, textAlign: "right" }}>{g.perc}%</div>
      </div>
    );
  };

  return (
    <>
      {/* testata, la data e la giornata sono la prima cosa da guardare */}
      <div style={{ background: C.inchiostro, color: C.carta, borderRadius: 3, padding: "13px 15px" }}>
        <div style={{ ...mono, fontSize: 10, textTransform: "uppercase", letterSpacing: ".14em", opacity: .7 }}>
          {soprattitolo}
        </div>
        <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1.15, marginTop: 4 }}>
          {titolo}
        </div>
        <div style={{ ...mono, fontSize: 11, marginTop: 6, opacity: .85 }}>
          {probabili.squadre.length} squadre · {mieiTitolari} dei tuoi dati titolari su {miei.length} segnati
        </div>
        {vecchie && (
          <div style={{ ...mono, fontSize: 11.5, fontWeight: 700, color: C.ocra, marginTop: 7, lineHeight: 1.45 }}>
            Fantacalcio.it le ha aggiornate {giorni} giorni fa, quasi certamente sono di una
            giornata passata. Conviene che l'amministratore ricarichi la pagina.
          </div>
        )}
      </div>

      {/* legenda, tre fasce e due evidenziazioni */}
      <div className="flex gap-2 flex-wrap items-center" style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, margin: "10px 0 2px", textTransform: "uppercase", letterSpacing: ".08em" }}>
        <span style={{ color: C.campo, fontWeight: 700 }}>titolare da 80</span>
        <span style={{ color: C.ocra, fontWeight: 700 }}>ballottaggio da 45</span>
        <span>riserva sotto 45</span>
        <span style={{ marginLeft: "auto" }}>fondo verde già tuo, fondo rosa da prendere</span>
      </div>

      <div className="flex gap-2 flex-wrap" style={{ alignItems: "flex-start" }}>
        {probabili.squadre.map((sq) => (
          <div key={sq.nome} style={{ flex: "1 1 250px", background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, marginTop: 8 }}>
            <div className="flex items-baseline justify-between gap-2"
              style={{ borderBottom: `2px solid ${C.inchiostro}`, padding: "7px 9px" }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{sq.nome}</span>
              <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: C.rosa }}>{sq.modulo}</span>
            </div>
            <div style={{ ...mono, fontSize: 9, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".1em", padding: "6px 9px 2px" }}>
              undici titolari
            </div>
            {sq.giocatori.filter((g) => g.titolare).map(voce)}
            <div style={{ ...mono, fontSize: 9, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".1em", padding: "8px 9px 2px" }}>
              panchina
            </div>
            {sq.giocatori.filter((g) => !g.titolare).map(voce)}
          </div>
        ))}
      </div>

      <div style={{ ...mono, fontSize: 10.5, color: C.inchiostroTenue, marginTop: 12, lineHeight: 1.5 }}>
        Il pallino ° accanto a un nome vuol dire che quel giocatore non sta nel listone,
        di solito è un ragazzo appena salito in prima squadra.
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  GUIDA                                                              */
/*  Le istruzioni stanno dentro l'app, cosi' il giorno dell'asta       */
/*  non serve cercare un file da qualche altra parte.                  */
/* ------------------------------------------------------------------ */

function Blocco({ titolo, sotto, children }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: 12, marginTop: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{titolo}</div>
      {sotto && (
        <div style={{ ...mono, fontSize: 9.5, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".1em", marginTop: 2 }}>
          {sotto}
        </div>
      )}
      <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 7 }}>{children}</div>
    </div>
  );
}

function Elenco({ voci }) {
  return (
    <ol style={{ margin: "6px 0 0", paddingLeft: 20 }}>
      {voci.map((v, i) => <li key={i} style={{ marginBottom: 4 }}>{v}</li>)}
    </ol>
  );
}

const Sigla = ({ children }) => (
  <b style={{ ...mono, fontSize: 12.5, color: C.rosa }}>{children}</b>
);

function Voce({ sigla, children }) {
  return (
    <div className="flex gap-2" style={{ marginBottom: 5 }}>
      <div style={{ ...mono, fontSize: 12, fontWeight: 700, color: C.rosa, minWidth: 54 }}>{sigla}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function Guida() {
  return (
    <>
      <div style={{ background: C.inchiostro, color: C.carta, borderRadius: 3, padding: "13px 15px" }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.03em" }}>Cos'è Sala Aste</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 6, opacity: .92 }}>
          Un quaderno per preparare e vivere l'asta del fantacalcio. I giocatori sono già dentro,
          con quotazioni e statistiche aggiornate. Tu ci aggiungi la cosa che nessun sito può darti,
          cioè cosa ne pensi tu, e durante l'asta lui tiene il conto al posto tuo.
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 8, opacity: .92 }}>
          Se giochi più di un campionato è pensato apposta. Il giudizio su un giocatore lo dai
          <b> una volta sola</b> e vale ovunque, mentre chi l'ha comprato e a che prezzo resta
          <b> separato per ogni campionato</b>.
        </div>
      </div>

      <Blocco titolo="Da dove si comincia" sotto="la prima volta">
        <Elenco voci={[
          <>Scrivi una <b>parola</b> a tua scelta. Non è una registrazione, non servono mail né password. Quella parola è la tua chiave, usa sempre la stessa.</>,
          <>Ti viene chiesto <b>quante aste fai</b>, come si chiamano, quanti crediti avete e se giocate Classic o Mantra. Si cambia tutto quando vuoi, quindi non pensarci troppo.</>,
          <>Da lì in poi entri da solo. Il tasto in alto a destra con la tua parola serve per uscire e entrare con un'altra.</>,
        ]} />
        <div style={{ ...mono, fontSize: 11, color: C.inchiostroTenue, marginTop: 8, lineHeight: 1.5 }}>
          Segnati la parola da qualche parte. Senza quella non si entra, e nessuno può recuperarla per te.
          Con la stessa parola ritrovi tutto anche da un altro dispositivo, perché i dati stanno online.
        </div>
      </Blocco>

      <Blocco titolo="Le sette schede" sotto="a cosa serve ognuna">
        <Elenco voci={[
          <><b>Listone</b>, l'elenco di tutti i giocatori. Qui ci passi le sere prima dell'asta.</>,
          <><b>Papabili</b>, solo i giocatori che hai segnato, divisi per squadra, per sfoltire in fretta.</>,
          <><b>Asta live</b>, da usare mentre l'asta è in corso. Segni chi prendi e a quanto.</>,
          <><b>Aste Tracker</b>, come stanno messi gli altri. Quanto hanno speso e cosa gli manca.</>,
          <><b>Campo</b>, per vedere che squadra viene fuori da quello che hai comprato.</>,
          <><b>Probabili</b>, chi gioca davvero domenica, squadra per squadra.</>,
          <><b>Dati</b>, le impostazioni dei campionati e il backup.</>,
        ]} />
      </Blocco>

      <Blocco titolo="Listone" sotto="preparare l'asta">
        Tocca un giocatore per aprire la sua scheda. Da lì dici quanto ti interessa e in quali
        campionati lo vuoi. Tornando indietro, la riga cambia aspetto.
        <Elenco voci={[
          <>La <b>barretta colorata</b> a sinistra è il tuo giudizio. Più tira al rosa, più lo vuoi.</>,
          <>I <b>quadratini numerati</b> a destra sono i tuoi campionati. Acceso vuol dire che lo vuoi lì. Puoi accenderli anche da qui senza aprire la scheda.</>,
          <>Se la riga ha lo <b>sfondo rosato</b> lo vuoi in due o più campionati. Quelli sono i contesi, e sono i primi da guardare quando fai i conti col budget.</>,
          <>I due numeri a destra sono la <b>quota</b> e il <b>fvm</b>, spiegati qui sotto.</>,
        ]} />
        <div style={{ marginTop: 9, fontWeight: 600 }}>I filtri sotto la ricerca</div>
        <Elenco voci={[
          <><b>P D C A</b> mostrano un ruolo alla volta.</>,
          <><b>Rigoristi</b> lascia in lista solo il primo e il secondo rigorista di ogni squadra e li ordina per rigori battuti, quindi è già una classifica. Non è un ruolo, è una scorciatoia. Cercando una squadra nella barra sopra vedi i suoi due.</>,
          <><b>Solo target</b> lascia chi hai messo da <b>Mi piace</b> in su, e anche chi hai semplicemente segnato per un campionato, perché anche quello è un target.</>,
          <><b>Nascondi presi</b> toglie chi è già stato assegnato nel campionato che stai guardando. Tienilo acceso durante l'asta.</>,
          <><b>Solo titolari</b> compare quando le probabili sono state caricate, e lascia in lista solo chi è dato dall'80 per cento in su.</>,
          <><b>Ordina per priorità</b> mette in cima prima chi vuoi in tre campionati, poi in due, poi in uno. A parità viene prima chi ti interessa di più, e a parità di giudizio quello che vale di più. È l'ordine giusto per non arrivare impreparato.</>,
        ]} />
      </Blocco>

      <Blocco titolo="Papabili" sotto="la tua lista della spesa">
        Qui non c'è tutto il listone. Ci sono <b>solo i giocatori che hai segnato</b>, cioè quelli
        col quadratino numerato acceso nel Listone. In cima ci sono due file di tasti che decidono
        cosa vedi.
        <Elenco voci={[
          <>I campionati si accendono e si spengono <b>dalle carte in testata</b>, quelle con i crediti. Solo in questa scheda puoi tenerne accesi <b>più di uno</b>, e escono i segnati di tutti quelli accesi in una lista sola. In tutte le altre schede resta acceso uno solo, come sempre.</>,
          <>Il tasto <b>tutti</b> è la scorciatoia per accenderli in un colpo, e ripremendolo torni a uno solo. Accanto c'è scritto quali sono accesi in quel momento.</>,
          <>Sotto ci sono gli stessi <b>filtri del Listone</b>, cioè la ricerca per nome e i tasti dei ruoli.</>,
          <>L'<b>ordinamento</b> parte per ruolo, cioè portieri, difensori, centrocampisti e attaccanti, e a parità di ruolo viene prima chi costa di più. Poi ci sono squadra, quota, fvm, titolarità e nome. <b>Squadra</b> è quello di prima, che tiene insieme i giocatori della stessa squadra.</>,
          <>La fila <b>squadre</b> filtra per squadra di serie A, e accanto a ogni nome c'è quanti ne hai segnati. <b>Da spente vogliono dire tutte</b>, ed è così che si parte. Accendine due o tre se vuoi confrontarle.</>,
          <>Uscendo da questa scheda la testata torna da sola a un campionato solo, quindi non ti ritrovi selezioni strane nel Listone o in Asta live.</>,
        ]} />
        <div style={{ marginTop: 9, fontWeight: 600 }}>Cosa c'è su ogni riga</div>
        <Elenco voci={[
          <>Nome, squadra, ruoli, la <b>percentuale</b> delle probabili e i rigori, come nel listone.</>,
          <>Sotto, i <b>cinque giudizi</b>. Un tocco lo metti, ritoccando quello acceso lo togli.</>,
          <>Sotto ancora, <b>tutte le etichette e le note</b> che gli hai messo, in chiaro, senza aprire niente. Sono la ragione per cui te l'eri segnato, quindi devono stare a vista.</>,
          <>A destra quota e fvm, e poi <b>una riga per ogni campionato acceso</b>, col numero davanti. Dice il max che ti sei dato oppure, se l'hai già comprato, a quanto è andato.</>,
          <>Toccando il <b>nome</b> si apre la scheda completa, con quotazioni e statistiche.</>,
        ]} />
        <div style={{ marginTop: 9, fontWeight: 600 }}>La freccetta</div>
        <div>
          Apre la scheda del giocatore lì dentro, senza cambiare pagina. Trovi <b>tutte le aste</b>,
          non solo quelle accese, con la spunta e il max di ognuna, poi le etichette e le note da
          cambiare. In fondo ci sono i tasti <b>meno</b>, uno per ogni campionato acceso in cui l'hai
          segnato. Ognuno lo toglie da quel campionato e basta, gli altri restano e il giudizio resta.
        </div>
      </Blocco>

      <Blocco titolo="Probabili formazioni" sotto="chi gioca domenica">
        Le probabili arrivano dalla pagina di Fantacalcio.it e le carica l'amministratore,
        come il listone. Ogni giocatore ha una percentuale di titolarità, e quella percentuale
        si legge in tre posti.
        <Elenco voci={[
          <>Nella scheda <b>Probabili</b>, squadra per squadra, con il modulo, gli undici e la panchina. I tuoi hanno il fondo colorato, verde se ce l'hai già, rosa se lo vuoi.</>,
          <>Nel <b>listone</b>, come numerino accanto alla squadra.</>,
          <>Nella <b>scheda del giocatore</b>, come pastiglia sotto il nome.</>,
        ]} />
        <div style={{ marginTop: 8 }}>Le tre fasce sono sempre le stesse.</div>
        <Voce sigla="titolare">Dall'80 per cento in su. Il filtro <b>solo titolari</b> nel listone lascia in lista solo questi.</Voce>
        <Voce sigla="ballottag.">Dal 45 al 79. Se lo compri, sappi che è un rischio.</Voce>
        <Voce sigla="riserva">Sotto il 45.</Voce>
        <div style={{ ...mono, fontSize: 11, color: C.inchiostroTenue, marginTop: 8, lineHeight: 1.5 }}>
          La data e la giornata che vedi in cima le dice la pagina di Fantacalcio.it, sono le sue,
          non il momento in cui il file è stato caricato. Se in quella pagina non ci fossero,
          l'app non mostra nessuna data. Se l'ultimo aggiornamento è di più di sette giorni fa
          te lo dice in arancione, perché a quel punto sono di una giornata vecchia.
        </div>
      </Blocco>

      <Blocco titolo="La scheda del giocatore" sotto="tutti i numeri, uno per uno">
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Il riquadro del mercato</div>
        <Voce sigla="quota">Il prezzo di listino di oggi. È la base d'asta, non quello che pagherai.</Voce>
        <Voce sigla="iniziale">Il prezzo di listino a inizio stagione.</Voce>
        <Voce sigla="diff">Di quanto si è mosso. Un più grosso vuol dire che sta rendendo bene, e che all'asta ci sarà battaglia.</Voce>
        <Voce sigla="fvm">Fanta Valore di Mercato. <b>Non sono crediti.</b> È quanto vale davvero secondo Fantacalcio.it, tenendo dentro rendimento, continuità e ruolo. Va da 1 a 370.</Voce>

        <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>Le due strisce delle stagioni</div>
        <div style={{ marginBottom: 7 }}>Sopra c'è l'anno che state giocando, sotto quello scorso. A campionato appena partito la prima è quasi vuota, quindi guarda la seconda.</div>
        <Voce sigla="pres">Partite con voto. Non partite giocate, quelle in cui ha giocato abbastanza da prendere un voto. È il primo indizio sulla titolarità.</Voce>
        <Voce sigla="mv">Media voto pura, senza gol né cartellini. È quella che conta per il bonus difensivo.</Voce>
        <Voce sigla="fm">Fantamedia, la media voto con dentro gol, assist, ammonizioni e tutto il resto. È quella che dice quanti punti ti porta a settimana.</Voce>
        <Voce sigla="gol">Gol fatti.</Voce>
        <Voce sigla="assist">Assist serviti.</Voce>
        <div style={{ marginTop: 8 }}>
          Accanto alla scritta <b>stagione in corso</b> c'è <b>altri numeri</b>. Aprendolo compaiono
          ammonizioni, espulsioni, rigori calciati e segnati, e gli autogol. Per i portieri
          al loro posto trovi gol subiti e rigori parati. Si apre e si chiude per tutte e due le stagioni insieme.
        </div>

        <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>Rigorista</div>
        <div style={{ marginBottom: 8 }}>
          Sotto il nome, quando c'è, compare una pastiglia rosa che dice <b>rigorista</b> oppure
          <b> 2° rigorista</b>, con quanti ne ha battuti. Non è un dato scritto negli Excel, si ricava
          contando i rigori calciati dentro ogni squadra, prima quelli di quest'anno e poi quelli dell'anno scorso.
          Nel listone la stessa cosa compare come <b>rig 1</b> o <b>rig 2</b> accanto alla squadra.
        </div>

        <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>Quanto mi interessa</div>
        <div className="flex gap-1 flex-wrap" style={{ marginBottom: 7 }}>
          {INTERESSE.map((i) => (
            <span key={i.k} style={{ background: i.col, color: "#fff", borderRadius: 2, padding: "4px 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", ...display }}>{i.label}</span>
          ))}
        </div>
        <Elenco voci={[
          <><b>Evita</b>, non lo vuoi a nessun prezzo. Serve per non ripensarci in asta alle due di notte.</>,
          <><b>Ripiego</b>, va bene se avanza budget o se resti scoperto in un ruolo.</>,
          <><b>Mi piace</b>, lo prenderesti volentieri al prezzo giusto.</>,
          <><b>Obiettivo</b>, su questo ti spingi, vale la pena rilanciare.</>,
          <><b>Must have</b>, l'asta la fai per lui.</>,
        ]} />
        <div style={{ ...mono, fontSize: 11, color: C.inchiostroTenue, marginTop: 6, lineHeight: 1.5 }}>
          Il giudizio è uno solo e vale in tutti i campionati, perché un giocatore o ti piace o no.
        </div>

        <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>In quali aste lo voglio</div>
        <Elenco voci={[
          <>La <b>spunta</b> dice che lo vuoi in quel campionato.</>,
          <>Il campo <b>max</b> è il tetto che ti dai per quel campionato. Riappare in asta accanto al prezzo, come promemoria di quello che avevi deciso da lucido.</>,
          <>Dopo l'asta la riga dice <b>tuo a 34</b> oppure <b>preso a 34</b>, e il tasto <b>−</b> accanto annulla l'acquisto se hai sbagliato a segnare, solo per quel campionato.</>,
        ]} />

        <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>Etichette e note</div>
        <div>Le etichette sono parole brevi da appiccicare in un tocco, tipo rigorista o rischio infortuni, e puoi crearne di nuove. Le note sono testo libero, il posto giusto per scrivere <b>perché</b> avevi deciso una cosa.</div>
      </Blocco>

      <Blocco titolo="Asta live" sotto="il giorno dell'asta">
        <Elenco voci={[
          <>In alto trovi i <b>crediti residui</b> e l'<b>offerta massima</b>. La seconda è quanto puoi spingerti adesso tenendo da parte un credito per ogni casella che ti resta da riempire. Se la superi te lo dice, ma non ti blocca.</>,
          <>Scrivi il nome, tocca il giocatore, metti il prezzo finale e premi <b>preso io</b> oppure <b>a un altro</b>. La ricerca prende anche il <b>nome della squadra</b>, quindi scrivendo inter restano solo i suoi.</>,
          <>A ricerca vuota, sotto le rose, vedi due elenchi. Prima <b>i tuoi obiettivi ancora liberi</b> per questa asta, cioè chi hai segnato per questo campionato o giudicato da <b>Mi piace</b> in su. Sotto, <b>i primi del listone</b>, così un giocatore che non ti eri segnato lo trovi lo stesso.</>,
          <>I due elenchi rispondono solo alla <b>ricerca</b> e ai <b>tasti dei ruoli</b> qui sopra. I filtri e l'ordinamento del Listone non arrivano qui, altrimenti ti ritroveresti la lista tagliata da qualcosa che non vedi.</>,
          <>Segnare anche gli acquisti degli avversari conviene. Ti fa capire a che prezzi sta girando l'asta e libera la lista da chi non puoi più prendere.</>,
          <>Se lo volevi anche in un altro campionato compare un <b>riquadro rosa</b> che te lo ricorda. Vuol dire che pagandolo caro qui, là dovrai rinunciare a qualcosa.</>,
          <>Sotto ci sono <b>le tue rose</b>, divise per ruolo, con quanto hai speso su ciascuno. Accanto a ognuno il tasto <b>−</b> annulla l'acquisto.</>,
          <>La riga <b>le tue rose</b> si richiude toccandola, così mentre cerchi un giocatore lo spazio resta alla ricerca.</>,
          <>Se giochi più di un campionato, i tastini con i nomi ti fanno <b>sbirciare la rosa di un'altra lega</b> senza uscire dall'asta che stai facendo. Serve per ricordarti cosa hai già preso altrove prima di rilanciare.</>,
          <><b>Se hai segnato per sbaglio</b>, riscrivi il suo nome nella barra della ricerca. L'elenco normale nasconde chi è già stato assegnato, quindi ricompare più sotto, nel riquadro <b>già assegnati</b>, con il tasto <b>−</b>. Vale anche per quelli comprati dagli altri.</>,
          <>Il meno lo rimette libero e ti ridà i crediti, e tocca solo il campionato che stai guardando.</>,
          <>Premendo <b>a un altro</b> ti viene sempre chiesto <b>di chi è</b>, con un tasto per ogni squadra avversaria e accanto quanto le resta. Se per quel campionato non ne hai ancora registrata nessuna te lo dice, e le scrivi lì al volo. Se non hai voglia di saperlo c'è <b>non so chi</b>.</>,
        ]} />
      </Blocco>

      <Blocco titolo="Aste Tracker" sotto="come stanno messi gli altri">
        All'asta non conta solo quanto hai speso tu. Conta soprattutto <b>quanto è rimasto agli altri</b>
        e quali caselle hanno già riempito, perché è quello che decide se su un giocatore ci sarà
        battaglia oppure lo prendi a due crediti.
        <Elenco voci={[
          <>Prima scrivi i nomi delle squadre avversarie nel pannello <b>Dati</b>, riquadro <b>Gli altri della lega</b>. Una volta sola, poi restano.</>,
          <>All'asta, ogni volta che segni un giocatore <b>preso da un altro</b>, dici di chi è. È l'unico lavoro in più che ti chiede.</>,
          <>Qui trovi <b>una scheda per ognuno</b>, la tua per prima col bordo verde. Dice quanti crediti gli restano, quanti ne ha spesi e la barra come in testata.</>,
          <>Sotto, le <b>quattro caselle dei ruoli</b>. Dicono quanti portieri, difensori, centrocampisti e attaccanti ha già preso su quanti gliene servono. Quando un ruolo è pieno il numero diventa verde, e quello è il momento in cui smette di fare battaglia lì.</>,
          <><b>Chi ha preso</b> si apre e si chiude, ed elenca i suoi giocatori in ordine di ruolo, col prezzo pagato. Toccando un nome si apre la sua scheda.</>,
          <>Chi hai segnato come preso da un altro <b>senza dire di chi</b> finisce in fondo, nel mucchio <b>presi da non so chi</b>. I prezzi restano comunque utili.</>,
          <>Se giochi più campionati, i tastini in alto ti fanno guardare gli altri senza cambiare campionato attivo.</>,
        ]} />
        <div style={{ ...mono, fontSize: 11, color: C.inchiostroTenue, marginTop: 8, lineHeight: 1.5 }}>
          Il budget è lo stesso per tutti, è quello del campionato. I crediti che restano a ognuno
          sono il budget meno quello che gli hai visto spendere, quindi valgono se sei stato preciso
          nel segnare gli acquisti degli altri.
        </div>
      </Blocco>

      <Blocco titolo="Campo" sotto="che squadra è venuta fuori">
        <Elenco voci={[
          <>Scegli il <b>modulo</b> dalla fila di tasti. Cambiando modulo cambia tutto il resto.</>,
          <><b>Automatica</b> schiera da sola i migliori. Mette solo chi è nel suo ruolo esatto, non forza mai nessuno.</>,
          <><b>A mano</b> ti lascia decidere. Trascina un giocatore sulla casella, oppure toccalo e poi tocca dove metterlo.</>,
          <>Quando trascini, il <b>bordo verde</b> vuol dire casella nel suo ruolo, il <b>bordo arancio</b> vuol dire che ci sta adattato e ti costa un punto, <b>nessun bordo</b> vuol dire che lì non ci può stare.</>,
          <><b>Fantapunti stimati</b> è quanto farebbe questa formazione in una giornata media.</>,
        ]} />
        <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>Simulazione preasta</div>
        <div>Prima dell'asta la rosa è vuota e il campo non dice niente. Accendendo la <b>simulazione</b> entrano
        anche i giocatori che hai giudicato, come se li avessi già presi, e vedi che squadra verrebbe fuori.</div>
        <Elenco voci={[
          <>Scegli quali giudizi far entrare, <b>Must have</b>, <b>Obiettivo</b>, <b>Mi piace</b> e <b>Ripiego</b>. Puoi accenderne quanti vuoi insieme.</>,
          <>Partendo dai soli Must have vedi lo scheletro, aggiungendo gli altri riempi i buchi e capisci dove ti manca gente.</>,
          <>I simulati hanno il <b>bordo tratteggiato</b>, in campo e in panchina, quindi non li confondi con quelli veri.</>,
          <><b>Solo questo campionato</b> tiene dentro solo chi hai segnato per la lega che stai guardando. Spegnendolo entrano tutti quelli che ti piacciono.</>,
          <>Cambiando modulo la formazione si rifà, quindi provi in un attimo se il tuo listone regge un 3-5-2 o un 4-3-3.</>,
          <>I crediti non vengono toccati e nessun acquisto viene registrato. È solo una prova.</>,
        ]} />
        <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>Copertura dei ruoli</div>
        <div>La fila di pastiglie dice, per ogni tipo di casella del modulo, quanti giocatori della tua rosa ci starebbero.</div>
        <Elenco voci={[
          <><b>Bordo rosso</b>, non ne hai abbastanza. Sei scoperto lì.</>,
          <><b>Bordo arancio</b>, ci arrivi esatto senza riserve. Un infortunio e sei fuori.</>,
          <><b>Bordo chiaro</b>, hai margine.</>,
        ]} />
        <div style={{ marginTop: 7 }}>Se una casella resta vuota, il riquadro arancione sopra <b>ti dice quale</b> e cosa puoi farci, se qualcuno dalla panchina la coprirebbe oppure se quel ruolo ti manca proprio e va comprato.</div>
        <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>Bonus difensivo</div>
        <div>Si accende da solo quando la formazione ha le condizioni giuste, e quando è spento ti dice cosa manca. In Classic serve il portiere e almeno quattro difensori, in Mantra servono cinque uomini di stampo difensivo di cui almeno tre puri.</div>
      </Blocco>

      <Blocco titolo="Legenda dei ruoli" sotto="le sigle che trovi ovunque">
        <div style={{ marginBottom: 8 }}>
          Come si riconoscono a colpo d'occhio. Il ruolo <b>Classic</b> è un <b>quadratino pieno colorato</b>,
          uno solo per giocatore. I ruoli <b>Mantra</b> sono <b>pastiglie vuote col bordo</b>, e possono essere più d'uno.
        </div>
        <div className="flex gap-1 items-center flex-wrap" style={{ marginBottom: 10 }}>
          {RUOLI_C.map((r) => <RuoloC key={r} r={r} grande />)}
          <span style={{ ...mono, fontSize: 11, color: C.inchiostroTenue, margin: "0 6px" }}>classic</span>
          <RuoliM rm={["Dc", "E", "T"]} grande />
          <span style={{ ...mono, fontSize: 11, color: C.inchiostroTenue, marginLeft: 6 }}>mantra</span>
        </div>
        <div style={{ marginBottom: 8 }}>In <b>Classic</b> i ruoli sono quattro, e ognuno ha il suo colore.</div>
        <Voce sigla="P D C A">Portiere, difensore, centrocampista, attaccante.</Voce>
        <div style={{ margin: "12px 0 8px" }}>In <b>Mantra</b> sono dodici e un giocatore può averne più di uno. Sono quelli che decidono in quali caselle del modulo può entrare.</div>
        <Voce sigla="Por">Portiere</Voce>
        <Voce sigla="Dc">Difensore centrale</Voce>
        <Voce sigla="Dd">Difensore destro</Voce>
        <Voce sigla="Ds">Difensore sinistro</Voce>
        <Voce sigla="B">Braccetto, il laterale della difesa a tre</Voce>
        <Voce sigla="E">Esterno di centrocampo, copre tutta la fascia</Voce>
        <Voce sigla="M">Mediano, il più arretrato</Voce>
        <Voce sigla="C">Centrocampista centrale</Voce>
        <Voce sigla="W">Ala offensiva</Voce>
        <Voce sigla="T">Trequartista</Voce>
        <Voce sigla="A">Attaccante</Voce>
        <Voce sigla="Pc">Punta centrale</Voce>
        <div style={{ ...mono, fontSize: 11, color: C.inchiostroTenue, marginTop: 8, lineHeight: 1.5 }}>
          In Mantra le quotazioni sono diverse da quelle Classic per circa un giocatore su tre.
          L'app se ne accorge da sola e ti mostra sempre quelle giuste per il campionato che stai guardando.
        </div>
      </Blocco>

      <Blocco titolo="Dati" sotto="impostazioni">
        <Elenco voci={[
          <>Quando l'amministratore ricarica le <b>quotazioni</b> della stagione in corso, il listone viene riallineato a quel file. Chi ha lasciato la serie A sparisce, così non resta in giro con la squadra dell'anno prima.</>,
          <>I <b>campionati</b> si aggiungono col più e si tolgono col meno, da uno a sei. Crediti e regolamento si cambiano quando vuoi, anche a asta iniziata. Il nome si cambia con la <b>pennina</b> accanto a ognuno.</>,
          <>Il nome si cambia anche <b>dalla testata</b>. Tocca il nome del campionato principale, quello con la stella, e diventa scrivibile. Chiamali come si chiamano davvero, è più facile che Campionato 1 e Campionato 2.</>,
          <>La <b>stella</b> dice qual è il campionato principale. È quello che decide se le quote che leggi sono classic o mantra, quindi se hai un campionato mantra e vuoi le sue quote, mettici la stella.</>,
          <><b>Gli altri della lega</b> sono i nomi delle squadre con cui giochi, uno per riga e separati per campionato. Servono all'asta e alla scheda Aste Tracker. Togliendone una i suoi acquisti restano, ma finiscono tra quelli presi da non so chi.</>,
          <>Le <b>fasce del bonus difensivo</b> sono quelle ufficiali, ma quanti punti valgono lo decide ogni lega. Mettici i vostri.</>,
          <>Il <b>backup</b> scarica un file con tutto il tuo lavoro. Non serve per passare da un dispositivo all'altro, quello funziona da solo, ma è una rete di sicurezza che non costa niente.</>,
          <>In fondo ci sono i tasti per <b>azzerare</b> gli acquisti o i giudizi. Chiedono conferma, ma non si torna indietro.</>,
        ]} />
      </Blocco>

      <Blocco titolo="Se qualcosa non torna" sotto="prima di preoccuparti">
        <Elenco voci={[
          <>In alto a destra c'è una scritta piccola che dice sempre come sta andando. <b>Nuvola collegata</b> vuol dire tutto a posto, <b>salvato</b> con l'ora vuol dire che ha appena registrato quello che hai fatto.</>,
          <>Se dice <b>senza rete, lavoro qui</b> non hai perso niente. Continui a lavorare normalmente e appena la linea torna spedisce tutto da solo.</>,
          <>Non vedi una cosa che avevi fatto da un altro dispositivo, ricarica la pagina. All'apertura va a prendere la versione più recente.</>,
          <>Su iPhone e iPad conviene aggiungere il sito alla schermata Home. Tasto condividi, poi Aggiungi a Home, e si comporta come un'app.</>,
        ]} />
      </Blocco>

      <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, textAlign: "center", margin: "16px 0 10px", letterSpacing: ".08em" }}>
        versione {typeof window !== "undefined" && window.VERSIONE ? window.VERSIONE : "di sviluppo"}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  SCHEDA GIOCATORE                                                   */
/* ------------------------------------------------------------------ */

function Scheda({ p, m, setM, leghe, statoIn, prezzoIn, liberaGiocatore, mantraAttivo, rigoristi, prob, chiudi }) {
  if (!p) return null;
  const mm = m(p.id);
  const [tagNuovo, setTagNuovo] = useState("");
  /* Una tendina per stagione, indipendenti. Chiuse di partenza. */
  const [altriOra, setAltriOra] = useState(false);
  const [altriPrec, setAltriPrec] = useState(false);

  /* Sul telefono il gesto indietro deve chiudere la scheda, non uscire dal sito.
     All'apertura aggiungiamo una voce finta nella cronologia, e quando il telefono
     torna indietro la consumiamo chiudendo la scheda. Se invece chiudi col tasto,
     togliamo noi quella voce, cosi' la cronologia resta pulita. */
  useEffect(() => {
    window.history.pushState({ schedaAperta: true }, "");
    const alIndietro = () => chiudi();
    window.addEventListener("popstate", alIndietro);
    return () => {
      window.removeEventListener("popstate", alIndietro);
      if (window.history.state && window.history.state.schedaAperta) window.history.back();
    };
  }, []);

  /* Le due strisce di ogni stagione. Quella principale sta sempre in vista,
     quella di contorno si apre con la tendina. Cambiano in base al ruolo,
     perche' a un portiere non servono i rigori calciati e viceversa. */
  const q = (k, su) => p[k + su] || 0;
  const dec = (k, su) => (p[k + su] || 0).toFixed(2);

  const principali = (su) => {
    const testa = [["pres", q("pv", su)], ["mv", dec("mv", su)], ["fm", dec("fm", su)]];
    return p.r === "P"
      ? [...testa, ["gol sub", q("gs", su)], ["rig parati", q("rp", su)], ["amm", q("amm", su)], ["esp", q("esp", su)]]
      : [...testa, ["gol", q("gf", su)], ["assist", q("ass", su)], ["amm", q("amm", su)], ["esp", q("esp", su)], ["rig calc", q("rc", su)]];
  };

  const contorno = (su) =>
    p.r === "P"
      ? [["gol", q("gf", su)], ["assist", q("ass", su)], ["autogol", q("au", su)]]
      : [["rig +", q("rPiu", su)], ["rig −", q("rMeno", su)], ["autogol", q("au", su)]];

  const striscia = (su, aperta) => (
    <div style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: "8px 10px" }}>
      <div className="flex gap-2 flex-wrap">
        {principali(su).map(([k, v]) => stat(k, v))}
      </div>
      {aperta && (
        <div className="flex gap-2 flex-wrap" style={{ borderTop: `1px solid ${C.riga}`, marginTop: 8, paddingTop: 8 }}>
          {contorno(su).map(([k, v]) => stat(k, v))}
        </div>
      )}
    </div>
  );

  const stat = (etichetta, v, suff = "") => (
    <div style={{ flex: "1 1 62px" }}>
      <div style={{ ...mono, fontSize: 9, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".08em" }}>{etichetta}</div>
      <div style={{ ...mono, fontSize: 16, fontWeight: 700 }}>{v}{suff}</div>
    </div>
  );

  return (
    <div onClick={chiudi}
      style={{
        position: "fixed", inset: 0, height: "100dvh",
        background: "rgba(25,20,25,.5)", zIndex: 40, display: "flex", alignItems: "flex-end",
      }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: C.carta, width: "100%", maxHeight: "85dvh", overflowY: "auto",
          overscrollBehavior: "contain", WebkitOverflowScrolling: "touch",
          borderTop: `3px solid ${C.inchiostro}`, borderRadius: "6px 6px 0 0",
          padding: "0 14px", paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
        }}>
        {/* la testata resta appiccicata in cima mentre scorri, cosi' il tasto chiudi e' sempre li' */}
        <div className="flex justify-between items-start"
          style={{
            position: "sticky", top: 0, zIndex: 2, background: C.carta,
            margin: "0 -14px", padding: "12px 14px 9px",
            borderBottom: `1px solid ${C.riga}`,
          }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 25, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.04em" }}>{p.nome}</div>
            <div style={{ ...mono, fontSize: 11, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 2 }}>
              {p.squadra}
              <span className="inline-flex items-center gap-1" style={{ marginLeft: 8, verticalAlign: "middle" }}>
                <RuoloC r={p.r} grande />
                {p.rm?.length ? <RuoliM rm={p.rm} grande /> : null}
              </span>
            </div>
            <div className="flex gap-1 flex-wrap" style={{ marginTop: 5 }}>
              {/* quanto lo danno titolare nelle probabili dell'ultima giornata */}
              {prob && (
                <div style={{
                  borderRadius: 2, padding: "2px 7px",
                  border: `1.5px solid ${COLORE_FASCIA[fasciaTitolarita(prob.perc)]}`,
                  color: COLORE_FASCIA[fasciaTitolarita(prob.perc)],
                  ...mono, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em",
                }}>
                  {fasciaTitolarita(prob.perc)} · {prob.perc}%{prob.modulo ? " · " + prob.modulo : ""}
                </div>
              )}
              {rigoristi?.[p.id] && (
                <div style={{
                  borderRadius: 2, padding: "2px 7px",
                  border: `1.5px solid ${C.rosa}`, color: C.rosa,
                  ...mono, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em",
                }}>
                  {etichettaRigorista(rigoristi[p.id])} · {(p.rc || p.rcP || 0)} calciati
                </div>
              )}
            </div>
          </div>
          <Btn piccolo onClick={chiudi}>chiudi</Btn>
        </div>

        {/* mercato */}
        <div className="flex gap-2 mt-3" style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: "8px 10px", marginTop: 12 }}>
          {stat("quota", quotaDi(p, mantraAttivo))}
          {stat("iniziale", quotaInizialeDi(p, mantraAttivo))}
          {stat("diff", (() => {
            const d = quotaDi(p, mantraAttivo) - quotaInizialeDi(p, mantraAttivo);
            return d > 0 ? `+${d}` : d;
          })())}
          {stat("fvm", valoreDi(p, mantraAttivo))}
        </div>

        {/* stagione in corso */}
        <div className="flex items-baseline justify-between" style={{ margin: "12px 0 3px" }}>
          <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".1em" }}>stagione in corso</div>
          <button onClick={() => setAltriOra(!altriOra)}
            style={{ ...mono, fontSize: 10, color: C.rosa, textTransform: "uppercase", letterSpacing: ".08em" }}>
            {altriOra ? "meno numeri ▴" : "altri numeri ▾"}
          </button>
        </div>
        {striscia("", altriOra)}

        {/* stagione precedente */}
        <div className="flex items-baseline justify-between" style={{ margin: "12px 0 3px" }}>
          <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, textTransform: "uppercase", letterSpacing: ".1em" }}>stagione precedente</div>
          <button onClick={() => setAltriPrec(!altriPrec)}
            style={{ ...mono, fontSize: 10, color: C.rosa, textTransform: "uppercase", letterSpacing: ".08em" }}>
            {altriPrec ? "meno numeri ▴" : "altri numeri ▾"}
          </button>
        </div>
        {striscia("P", altriPrec)}

        {/* interesse */}
        <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, margin: "14px 0 4px", textTransform: "uppercase", letterSpacing: ".1em" }}>quanto mi interessa</div>
        <div className="flex gap-1 flex-wrap">
          {INTERESSE.map((i) => (
            <button key={i.k} onClick={() => setM(p.id, { interesse: i.k })}
              style={{
                padding: "6px 9px", borderRadius: 2, fontSize: 11.5, fontWeight: 700, ...display,
                textTransform: "uppercase", letterSpacing: ".03em",
                border: `1.5px solid ${mm.interesse === i.k ? i.col : C.riga}`,
                background: mm.interesse === i.k ? i.col : "transparent",
                color: mm.interesse === i.k ? "#fff" : C.inchiostroTenue,
              }}>{i.label}</button>
          ))}
        </div>

        {/* leghe e prezzo massimo */}
        <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, margin: "14px 0 4px", textTransform: "uppercase", letterSpacing: ".1em" }}>in quali aste lo voglio</div>
        {leghe.map((l) => {
          const on = !!mm.leghe[l.id];
          const st = statoIn(p.id, l.id);
          return (
            <div key={l.id} className="flex items-center gap-2" style={{ background: "#fff", border: `1px solid ${C.riga}`, borderRadius: 3, padding: "7px 9px", marginBottom: 5 }}>
              <button onClick={() => setM(p.id, { leghe: { ...mm.leghe, [l.id]: !on } })}
                style={{ width: 22, height: 22, borderRadius: 2, border: `1.5px solid ${on ? C.rosa : C.riga}`, background: on ? C.rosa : "transparent", color: "#fff", fontSize: 13, fontWeight: 800 }}>
                {on ? "✓" : ""}
              </button>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{l.nome}</span>
              {st === "libero" ? (
                <>
                  <span style={{ ...mono, fontSize: 10, color: C.inchiostroTenue }}>max</span>
                  <input
                    value={mm.max?.[l.id] || ""} inputMode="numeric"
                    onChange={(e) => setM(p.id, { max: { ...mm.max, [l.id]: e.target.value.replace(/\D/g, "") } })}
                    style={{ width: 52, padding: "5px", border: `1px solid ${C.riga}`, borderRadius: 2, ...mono, fontSize: 14, fontWeight: 700, textAlign: "center" }}
                  />
                </>
              ) : (
                <span className="flex items-center gap-2">
                  <span style={{ ...mono, fontSize: 11.5, fontWeight: 700, color: st === "mio" ? C.campo : C.inchiostroTenue }}>
                    {st === "mio" ? "tuo" : "preso"} a {prezzoIn(p.id, l.id)}
                  </span>
                  <Btn piccolo title="rimuovi l'acquisto" onClick={() => liberaGiocatore(p.id, l.id)}>−</Btn>
                </span>
              )}
            </div>
          );
        })}

        {/* tag */}
        <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, margin: "12px 0 4px", textTransform: "uppercase", letterSpacing: ".1em" }}>etichette</div>
        <div className="flex gap-1 flex-wrap">
          {[...new Set([...TAG_SUGGERITI, ...(mm.tags || [])])].map((t) => {
            const on = (mm.tags || []).includes(t);
            return (
              <button key={t} onClick={() => setM(p.id, { tags: on ? mm.tags.filter((x) => x !== t) : [...(mm.tags || []), t] })}
                style={{
                  padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, ...display,
                  border: `1px solid ${on ? C.inchiostro : C.riga}`,
                  background: on ? C.inchiostro : "transparent", color: on ? C.carta : C.inchiostroTenue,
                }}>{t}</button>
            );
          })}
        </div>
        <div className="flex gap-2 mt-2">
          <input value={tagNuovo} onChange={(e) => setTagNuovo(e.target.value)} placeholder="Nuova etichetta"
            style={{ flex: 1, padding: "6px 8px", border: `1px solid ${C.riga}`, borderRadius: 2, fontSize: 12.5, ...display }} />
          <Btn piccolo onClick={() => { if (tagNuovo.trim()) { setM(p.id, { tags: [...(mm.tags || []), tagNuovo.trim()] }); setTagNuovo(""); } }}>aggiungi</Btn>
        </div>

        {/* note */}
        <div style={{ ...mono, fontSize: 10, color: C.inchiostroTenue, margin: "12px 0 4px", textTransform: "uppercase", letterSpacing: ".1em" }}>note</div>
        <textarea
          value={mm.note || ""} onChange={(e) => setM(p.id, { note: e.target.value })}
          rows={3} placeholder="Cosa ti sei detto su di lui"
          style={{ width: "100%", padding: 9, border: `1px solid ${C.riga}`, borderRadius: 3, fontSize: 13.5, ...display, resize: "vertical" }}
        />
      </div>
    </div>
  );
}
