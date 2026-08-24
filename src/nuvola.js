/* ------------------------------------------------------------------
   Nuvola, cioe' il salvataggio condiviso su Supabase.

   Come e' organizzata la tabella "stati"
   1. una riga per ogni parola d'ingresso, contiene giudizi, aste,
      leghe, formazioni e fasce, roba piccola che cambia in continuazione
   2. una riga sola chiamata __listone__, contiene l'elenco dei giocatori,
      roba grossa che cambia solo quando l'amministratore importa gli Excel
   3. una riga sola chiamata __probabili__, contiene le probabili formazioni
      dell'ultima giornata, la scrive solo l'amministratore

   Cosi' chi entra con la sua parola si porta dietro i suoi dati e
   riceve listone e probabili senza doverli importare.
------------------------------------------------------------------ */

const INDIRIZZO = "https://uovtynfxvdesunojalmy.supabase.co";
const CHIAVE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvdnR5bmZ4dmRlc3Vub2phbG15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NjUyNDMsImV4cCI6MjEwMzE0MTI0M30.-ti8kSiVmMcuB03YVNLh8rrzUQx0NMa6MYWAgCYyj5M";

export const RIGA_LISTONE = "__listone__";
export const RIGA_PROBABILI = "__probabili__";

/* in prova puntiamo altrove, nell'uso normale vale l'indirizzo qui sopra */
const base = () => (typeof window !== "undefined" && window.NUVOLA_INDIRIZZO) || INDIRIZZO;
const chiave = () => (typeof window !== "undefined" && window.NUVOLA_CHIAVE) || CHIAVE;

export const nuvolaAccesa = () => !!base() && !!chiave();

const intestazioni = () => ({
  apikey: chiave(),
  Authorization: "Bearer " + chiave(),
  "Content-Type": "application/json",
});

/* quanto aspettiamo prima di dire che la rete non risponde */
function conScadenza(promessa, ms = 12000) {
  return Promise.race([
    promessa,
    new Promise((_, ko) => setTimeout(() => ko(new Error("la rete non risponde")), ms)),
  ]);
}

/* legge una riga, torna null se non c'e' ancora */
export async function leggi(codice) {
  const u = `${base()}/rest/v1/stati?codice=eq.${encodeURIComponent(codice)}&select=dati,aggiornato`;
  const r = await conScadenza(fetch(u, { headers: intestazioni() }));
  if (!r.ok) throw new Error("lettura non riuscita, codice " + r.status);
  const righe = await r.json();
  if (!righe.length) return null;
  return { dati: righe[0].dati, aggiornato: righe[0].aggiornato };
}

/* scrive una riga, sovrascrivendo quella con la stessa parola */
export async function scrivi(codice, dati, aggiornato) {
  const u = `${base()}/rest/v1/stati`;
  const r = await conScadenza(fetch(u, {
    method: "POST",
    headers: { ...intestazioni(), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ codice, dati, aggiornato }]),
  }));
  if (!r.ok) throw new Error("scrittura non riuscita, codice " + r.status);
  return true;
}

/* messaggino per la spia in alto a destra */
export function spia(testo, tono = "calmo") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("fanta-spia", { detail: { testo, tono } }));
}
