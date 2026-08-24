# Sala Aste, istruzioni per chi ci lavora

Dashboard per gestire più aste di fantacalcio in parallelo.
Un file HTML solo, senza server, pubblicato su GitHub Pages.

## Comandi

```bash
npm install react react-dom esbuild        # solo la prima volta
./costruisci.sh                            # produce dist/index.html
cp dist/index.html index.html              # aggiorna il file pubblicato
```

`dist/index.html` è l'unico file che va online. `index.html` alla radice è la sua copia,
serve perché GitHub Pages pubblica la radice del repository.

Ogni build marchia la versione con data e ora. La si legge in fondo alla scheda Guida
e nel sorgente come `window.VERSIONE`. Serve per capire quale build sta online.

## Struttura

1. `src/app.jsx` tutta l'applicazione React, un file solo
2. `src/main.jsx` punto d'ingresso, deposito locale e spia di salvataggio
3. `src/nuvola.js` il salvataggio condiviso su Supabase
4. `src/utilita.css` poche classi di utilità, niente Tailwind
5. `costruisci.sh` compila con esbuild
6. `inserisci.js` impacchetta js e css dentro un unico html

## Come sono organizzati i dati

Tabella `stati` su Supabase, due tipi di riga.

1. `__listone__` l'elenco dei giocatori, la scrive solo l'amministratore
2. una riga per ogni parola d'ingresso, con giudizi, aste, campionati e formazioni

In locale, `fanta:listone` e `fanta:stato:<parola>`. Si legge prima il locale e poi la
nuvola, vince chi ha `aggiornatoIl` più recente. Senza rete l'app funziona lo stesso
e rispedisce al ritorno della linea.

## Cose da non rompere

1. **Un solo giudizio, più stati.** Il giudizio su un giocatore vale per tutti i campionati,
   lo stato libero, mio o altrui è separato per campionato. È il principio dell'app.
2. **Il listone lo definiscono le quotazioni.** I file di statistiche non creano giocatori,
   aggiornano solo chi esiste già, altrimenti entrano quelli che hanno lasciato la serie A.
3. **La stagione si riconosce dal nome del file**, non da parole chiave fisse. Le quotazioni
   di una stagione passata vengono saltate, le statistiche vecchie finiscono nei campi con la P.
4. **In Mantra le quotazioni sono altre.** `Qt.A M`, `Qt.I M`, `FVM M`. Per circa un giocatore
   su tre sono diverse da quelle Classic.
5. **L'amministratore è un'impronta sha256**, la parola in chiaro non sta nel codice.
6. **Niente drag and drop HTML5**, deve funzionare su Safari iPad. Si usano gli eventi pointer.

## Colonne degli Excel di Fantacalcio.it

`Id R Rm Nome Squadra Pv Mv Fm Gf Gs Rp Rc R+ R- Ass Amm Esp Au`

1. `Rp` e `Gs` solo portieri, verificato su 663 righe
2. `Rc` `R+` `R-` solo giocatori di movimento
3. `Rc` è sempre uguale a `R+` più `R-`
4. I gol su rigore sono già compresi in `Gf`

## Convenzioni di scrittura

1. Codice commentato in italiano
2. Interfaccia in italiano
3. Nei testi mostrati all'utente, niente due punti e niente trattini lunghi
4. Elenchi numerati, frasi corte

## Quando si modifica

Si lavora sui sorgenti in `src/`, mai su `dist/index.html`, che viene rigenerato.
Dopo ogni modifica, ricompilare e provare almeno l'ingresso, il listone e la scheda giocatore.
