# Sala Aste

Dashboard per gestire tre aste di fantacalcio in parallelo.
Il sito pubblicato e' il file index.html qui alla radice.

## Cosa c'e' in ogni cartella

1. `index.html` il sito vero e proprio, gia' compilato, non si modifica a mano
2. `manifest.json` serve solo perche' su iPad si comporti come un'app
3. `src/` il codice sorgente, qui si lavora davvero
4. `dati/excel/` dove vanno gli Excel scaricati da Fantacalcio.it
5. `dati/listone.json` il listone generato dagli Excel
6. `guide/` le istruzioni scritte in italiano
7. `costruisci.sh` compila src in index.html

## Come si aggiorna

1. Si modifica qualcosa dentro `src/`
2. Si lancia `./costruisci.sh`
3. Esce `dist/index.html`, che sostituisce quello alla radice
