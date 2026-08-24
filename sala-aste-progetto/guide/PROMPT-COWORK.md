# Prompt da incollare in Claude Cowork

Copia tutto quello che sta sotto la riga, allega la cartella `sorgenti`
insieme agli Excel di Fantacalcio.it, e manda.

---

Sto costruendo una dashboard per gestire tre aste di fantacalcio in parallelo.
Nella cartella allegata trovi i sorgenti già funzionanti. Non ripartire da zero,
lavora su questi.

## Com'è fatta

1. `src/app.jsx` è l'intera applicazione React, un file solo
2. `src/main.jsx` è il punto di ingresso e contiene il deposito dati
3. `src/utilita.css` sono le poche classi di utilità usate, non c'è Tailwind
4. `costruisci.sh` compila tutto in `dist/index.html`, un file autonomo senza dipendenze
5. Per compilare serve `npm install react react-dom esbuild` dentro la cartella

## Il principio dell'applicazione

1. Un giocatore ha **un solo giudizio** mio, valido per tutte e tre le aste
2. Un giocatore ha **tre stati distinti**, uno per asta, libero oppure mio oppure preso da un altro
3. Questa separazione è ciò che fa parlare le tre leghe tra loro

## Cosa c'è già

1. Tre leghe da 500 crediti, Classic o Mantra, budget e modalità per lega
2. Listone con ricerca, filtri, ordinamento per priorità multi lega
3. Asta live con crediti residui, offerta massima sostenibile, avviso sui contesi
4. Campo con formazione automatica e formazione a mano trascinando i giocatori
5. Undici schemi Mantra ufficiali con la tabella adattamenti presa dal regolamento
6. Modificatore difesa Classic e fattore difensivo Mantra
7. Scheda giocatore con interesse, prezzo massimo per lega, etichette, note
8. Import degli Excel Fantacalcio.it agganciato sull'Id
9. Backup scaricabile

## Cosa ti chiedo di fare, in ordine

### 1. Listone precotto
Gli Excel allegati sono quotazioni Classic, quotazioni Mantra, statistiche
stagione scorsa, statistiche prima giornata. Scrivi uno script Node che li
legge e produce un unico `listone.json` con dentro tutti i giocatori,
un campo `versione` e un campo `aggiornatoIl`.
Poi modifica l'applicazione perché all'avvio carichi `listone.json`
invece dei dati finti, e tenga il pannello import come strumento
riservato a me per rigenerare il file.

### 2. Sincronizzazione cloud
Serve che la stessa persona ritrovi i suoi dati passando da PC a iPad.
Usa Supabase, piano gratuito, una tabella sola con codice utente e un
campo JSON. L'ingresso deve essere una parola scelta dall'utente,
niente registrazione né password. Salvataggio automatico a ogni azione,
con la spia già presente in alto a destra che dice quando ha salvato.
Deve continuare a funzionare offline e risincronizzare al ritorno della rete.
Il deposito dati sta tutto in `src/main.jsx`, sostituisci quel blocco.

### 3. Rifiniture per il giorno dell'asta
1. Annulla ultima azione in asta
2. Avviso, non blocco, quando sforo gli slot per ruolo
3. Vista contesi, solo i giocatori voluti in più leghe
4. Prezzo consigliato calcolato da fvm e budget

## Vincoli

1. Niente framework nuovi, niente build complicate, deve restare un file HTML solo
2. Deve funzionare su Safari iPad, quindi eventi pointer e non drag and drop HTML5
3. Interfaccia in italiano
4. Codice commentato in italiano
5. Alla fine ricompila e dammi `dist/index.html` pronto da caricare su GitHub

## Come devi rispondermi

1. Elenchi numerati, niente paragrafi lunghi
2. Niente due punti nel testo discorsivo
3. Niente trattini lunghi
4. Se modifichi un file, dammi il file completo aggiornato
