import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app.jsx";

/* ------------------------------------------------------------------
   Deposito dati del dispositivo.
   E' la memoria locale del browser, sempre presente e sempre veloce.
   Il salvataggio condiviso tra dispositivi sta in src/nuvola.js e
   lavora sopra a questo, non al posto di questo.
------------------------------------------------------------------ */
if (!window.storage) {
  const CH = "fanta:";
  window.storage = {
    async get(key) {
      const v = localStorage.getItem(CH + key);
      if (v === null) throw new Error("chiave assente");
      return { key, value: v, shared: false };
    },
    async set(key, value) {
      localStorage.setItem(CH + key, value);
      window.dispatchEvent(new CustomEvent("fanta-salvato"));
      return { key, value, shared: false };
    },
    async delete(key) {
      localStorage.removeItem(CH + key);
      return { key, deleted: true, shared: false };
    },
    async list(prefix = "") {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(CH + prefix)) keys.push(k.slice(CH.length));
      }
      return { keys, prefix, shared: false };
    },
  };
}

/* ------------------------------------------------------------------
   Spia in alto a destra.
   Dice l'ora dell'ultimo salvataggio sul dispositivo e, quando
   la nuvola ha qualcosa da raccontare, il suo messaggio.
------------------------------------------------------------------ */
const spia = document.getElementById("spia");
let spegni = null;

function mostra(testo, tono) {
  spia.textContent = testo;
  spia.style.color = tono === "avviso" ? "#C8892A" : "#6B5B61";
  spia.style.opacity = "1";
  clearTimeout(spegni);
  spegni = setTimeout(() => { spia.style.opacity = ".45"; }, 2200);
}

window.addEventListener("fanta-salvato", () => {
  const ora = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  mostra("salvato " + ora, "calmo");
});

window.addEventListener("fanta-spia", (e) => {
  mostra(e.detail.testo, e.detail.tono);
});

/* se la rete se ne va lo diciamo subito, senza aspettare un salvataggio fallito */
window.addEventListener("offline", () => mostra("senza rete", "avviso"));
window.addEventListener("online", () => mostra("rete tornata", "calmo"));

createRoot(document.getElementById("radice")).render(<App />);
