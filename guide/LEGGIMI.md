# Sala Aste, pacchetto di partenza

## Cosa c'è dentro

1. **index.html**, l'intera dashboard in un file solo, nessuna installazione
2. **manifest.json**, serve solo perché su iPad si comporti come un'app
3. **ISTRUZIONI-GITHUB.md**, come metterla online, passo per passo
4. **PROMPT-COWORK.md**, da incollare in Cowork per continuare il lavoro

## Provarla subito senza mettere niente online

Doppio clic su **index.html**. Si apre nel browser e funziona già.
I dati vengono salvati nel browser di quel computer.

## Cosa funziona in questa versione

1. Tre leghe indipendenti da 500 crediti, Classic o Mantra
2. Un solo giudizio per giocatore condiviso tra le tre aste
3. Segnalazione dei giocatori voluti in più leghe
4. Asta live con crediti residui e offerta massima sostenibile
5. Campo con formazione automatica oppure a mano trascinando i giocatori
6. Undici schemi Mantra ufficiali con adattamenti e malus
7. Modificatore difesa Classic e fattore difensivo Mantra, fasce modificabili
8. Import degli Excel di Fantacalcio.it
9. Backup scaricabile e ripristinabile
10. Schermata di impostazione alla prima entrata, quanti campionati, nomi, crediti e regolamento
11. Numero di campionati libero, da uno a sei, si aggiungono e si tolgono dal pannello Dati
12. Ingresso con una parola, ogni parola ha i suoi dati
13. Sincronizzazione tra dispositivi tramite Supabase
14. Pannello di import riservato all'amministratore
15. Copertura dei ruoli nel Campo, con i buchi nominati e chi dalla panchina li coprirebbe
16. Guida d'uso dentro l'app, quinta scheda
17. Simulazione preasta nel Campo, schiera i giocatori giudicati come se fossero già presi
18. Rigoristi ricavati dai rigori calciati, con filtro e classifica nel listone

## Come sono organizzati i dati

Su Supabase c'è una tabella sola, chiamata `stati`, con due tipi di riga.

1. `__listone__`, l'elenco dei giocatori, la scrive solo l'amministratore
2. una riga per ogni parola d'ingresso, con giudizi, aste, leghe e formazioni

Chi entra con la sua parola riceve il listone senza importare nulla e
tiene i propri giudizi separati da quelli degli altri.

## Cosa NON funziona ancora

1. **Listone precotto.** Finché l'amministratore non importa gli Excel
   ci sono ventiquattro giocatori finti di prova.

## Attenzione

1. Chiunque conosca l'indirizzo del sito può leggere e scrivere le righe
   della tabella, perché l'ingresso è una parola e non una vera password.
   Va bene tra amici, non è una cassaforte.
2. Se resti senza rete l'app continua a funzionare e rispedisce i dati
   quando la rete torna. Il backup nella scheda Dati resta comunque utile.
