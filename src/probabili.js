/* ------------------------------------------------------------------
   Probabili formazioni.

   Legge la pagina delle probabili di Fantacalcio.it salvata come file
   e ne ricava, per ogni squadra, il modulo e l'elenco dei giocatori con
   la percentuale di titolarita'.

   L'aggancio al listone e' sull'Id, che nella pagina sta dentro il link
   del giocatore. E' lo stesso Id degli Excel delle quotazioni, quindi
   non serve confrontare i nomi.
------------------------------------------------------------------ */

/* dall'indirizzo del giocatore tiriamo fuori l'Id, e' l'ultimo pezzo */
const idDalLink = (href) => {
  const m = String(href || "").match(/\/(\d+)\s*$/);
  return m ? m[1] : null;
};

const testo = (nodo) => (nodo ? nodo.textContent.trim() : "");

/* La data la dice la pagina stessa. Sotto ogni partita c'e' un
   "Ultimo aggiornamento" nel formato 24/08/2026 - 19:55, dieci in tutto.
   Quella buona e' la piu' recente. Se non ce n'e' nessuna torniamo stringa
   vuota, e allora nell'app non si mostra nessuna data. */
function dataFonte(doc) {
  let migliore = null;
  for (const nodo of doc.querySelectorAll(".last-update .date")) {
    const m = testo(nodo).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\D+(\d{1,2}):(\d{2})/);
    if (!m) continue;
    const quando = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
    if (!isNaN(quando.getTime()) && (!migliore || quando > migliore)) migliore = quando;
  }
  return migliore ? migliore.toISOString() : "";
}

export function leggiProbabili(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  /* la giornata sta nei riquadri delle partite, prendiamo la prima che troviamo */
  const giornata = testo(doc.querySelector(".matchweek")).replace(/\D+/g, "") || "";

  /* quando la fonte dice di essere stata aggiornata l'ultima volta */
  const aggiornata = dataFonte(doc);

  const squadre = [];
  for (const carta of doc.querySelectorAll(".team-card")) {
    const nome = testo(carta.querySelector(".team-name"));
    if (!nome) continue;
    const modulo = testo(carta.querySelector(".team-formation"));

    const giocatori = [];
    for (const [classe, titolare] of [["starters", true], ["reserves", false]]) {
      const lista = carta.querySelector(".player-list." + classe);
      if (!lista) continue;
      for (const voce of lista.querySelectorAll(".player-item")) {
        const link = voce.querySelector("a.player-name");
        const id = idDalLink(link && link.getAttribute("href"));
        if (!id) continue;
        const barra = voce.querySelector(".progress-bar");
        const perc = barra ? parseInt(barra.getAttribute("aria-valuenow") || "0", 10) : 0;
        /* Nella pagina data-status vale warn su tutte e 224 le riserve, quindi
           non dice chi e' in dubbio, dice solo che non e' tra gli undici.
           Quel dato lo copre gia' titolare, percio' qui non lo riportiamo. */
        giocatori.push({
          id,
          nome: testo(link),
          ruolo: (voce.querySelector(".role")?.getAttribute("data-value") || "").toUpperCase(),
          perc: isNaN(perc) ? 0 : perc,
          titolare,
        });
      }
    }
    if (giocatori.length) squadre.push({ nome, modulo, giocatori });
  }

  return { giornata, aggiornata, squadre };
}

/* Da elenco di squadre a mappa Id -> dati, comoda per il listone e la scheda.
   Se un giocatore comparisse due volte, tiene quello con la percentuale piu' alta. */
export function mappaPerId(probabili) {
  const out = {};
  for (const s of probabili?.squadre || []) {
    for (const g of s.giocatori) {
      if (!out[g.id] || g.perc > out[g.id].perc) {
        out[g.id] = { ...g, squadra: s.nome, modulo: s.modulo };
      }
    }
  }
  return out;
}

/* Le tre fasce chieste, con le soglie decise insieme */
export function fasciaTitolarita(perc) {
  if (perc >= 80) return "titolare";
  if (perc >= 45) return "ballottaggio";
  return "riserva";
}
