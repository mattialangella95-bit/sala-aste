# Mettere online la Sala Aste, passo per passo

Non serve saper usare GitHub. Serve solo trascinare file dentro una pagina web.
Tempo richiesto la prima volta, dieci minuti. Le volte successive, un minuto.

---

## PARTE 1, CREARE IL CONTENITORE

1. Vai su github.com e fai login
2. In alto a destra premi il simbolo più, poi **New repository**
3. Nel campo **Repository name** scrivi `sala-aste`
4. Lascia selezionato **Public**
5. NON spuntare nulla in fondo
6. Premi il pulsante verde **Create repository**

Ora sei dentro una pagina che dice "Quick setup". Rimani lì.

---

## PARTE 2, CARICARE I FILE

1. Nella pagina, cerca la scritta **uploading an existing file** e cliccala
2. Si apre un'area con scritto "Drag files here to add them to your repository"
3. Trascina dentro **index.html** e **manifest.json**
4. Aspetta che finisca di caricare, vedrai i nomi dei file comparire
5. Scorri in fondo e premi il pulsante verde **Commit changes**

Fatto. I file sono online, ma non ancora visibili come sito.

---

## PARTE 3, ACCENDERE IL SITO

1. In alto nella pagina del repository, premi **Settings**, con l'icona dell'ingranaggio
2. Nella colonna di sinistra, in fondo alla sezione Code and automation, premi **Pages**
3. Sotto **Source** lascia **Deploy from a branch**
4. Sotto **Branch** apri il menu a tendina che dice `None` e scegli **main**
5. Il menu accanto lascialo su `/ (root)`
6. Premi **Save**

Ora aspetta. Ci mettono uno o due minuti.

---

## PARTE 4, TROVARE L'INDIRIZZO

1. Ricarica la pagina Settings, Pages dopo un paio di minuti
2. In alto comparirà un riquadro verde con scritto **Your site is live at** e sotto l'indirizzo
3. L'indirizzo sarà `https://TUONOME.github.io/sala-aste/`
4. Aprilo, la dashboard deve comparire
5. Quello è il link da mandare al tuo amico

---

## PARTE 5, METTERLA SULLA SCHERMATA HOME DELL'IPAD

1. Apri il link con Safari, non con Chrome
2. Premi il pulsante di condivisione, il quadrato con la freccia in su
3. Scorri e premi **Aggiungi a Home**
4. Premi **Aggiungi**

Ora sembra un'app.

---

## AGGIORNARE IN FUTURO

Quando ti mando una versione nuova di index.html:

1. Vai sul repository
2. Clicca sul file **index.html** nell'elenco
3. Premi l'icona della matita in alto a destra
4. Cancella tutto il contenuto, incolla quello nuovo, premi **Commit changes**

Oppure, più semplice:

1. Premi **Add file**, poi **Upload files**
2. Trascina il nuovo index.html
3. Premi **Commit changes**, sovrascrive quello vecchio da solo

Aspetta un minuto e ricarica il sito.

---

## SE QUALCOSA VA STORTO

1. Pagina bianca, aspetta due minuti e ricarica, GitHub Pages ci mette un po' la prima volta
2. Errore 404, controlla di aver scelto il branch **main** e non un altro
3. Il sito mostra la versione vecchia, ricarica tenendo premuto Maiuscole, oppure svuota la cache
4. Hai combinato un pasticcio, nella scheda **Commits** puoi tornare a qualsiasi versione precedente
