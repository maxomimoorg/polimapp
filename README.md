# Poli MapP

# Mappa Segnalibri — PWA offline




App installabile (PWA) con mappa interattiva d'Europa, zoom iniziale sull'Italia, e segnalibri personali salvati solo sul dispositivo. Interfaccia in italiano.




## Funzionalità




### Mappa




- Leaflet + tile OpenStreetMap, vista iniziale centrata sull'Italia dentro i limiti europei.

- **Nuovo segnalibro**: clic destro **oppure** doppio clic / doppio tap sulla mappa aprendo il popup di creazione/modifica.

- Pressione prolungata (long press / click lungo) su un punto: crea un nuovo segnalibro e apre subito il popup di modifica.

- Marker a dimensione fissa sullo schermo, indipendente dallo zoom.

- **Tocco su un marker**: apre il popup di modifica.

- **Pressione lunga (2 secondi) su un marker**: attiva la modalità trascinamento — il marker si può spostare in un altro punto; al rilascio le nuove coordinate vengono salvate. Un leggero feedback visivo (ingrandimento/ombra) indica che il trascinamento è attivo.

- Il suggerimento in basso a destra viene aggiornato di conseguenza.

- Inquadra tuttti: Accanto ai pulsanti zoom di Leaflet (in alto a destra) un nuovo pulsante che con un tocco **allarga la vista fino a contenere tutti i marker visibili** (con un margine). Disabilitato se non ci sono segnalibri.




### Segnalibro




- Foto tonda con anello colorato della categoria; senza foto = cerchio bianco, senza categoria = anello grigio.

- Popup modificabile con: Nome, Categoria, Note, Priorità, Foto, tasti Salva ed Elimina.

- Categoria: menu a tendina con le categorie esistenti e, in fondo, "Crea una categoria" (nome + colore).

- Priorità: slider 0–100% (default 50%) con percentuale sopra il cursore. Al rilascio il marker si aggiorna con opacità/dimensione interpolate tra i punti fissi:

  - 0% → opacità 60%, dimensione 80%

  - 25% → opacità 80%, dimensione 100%

  - 50% → opacità 99%, dimensione 140%

  - 100% → opacità 100%, dimensione 250%

- Foto: caricamento con editor di ritaglio (trascina + zoom) sotto maschera circolare 1:1, salvataggio in WebP tondo con trasparenza.

- Tag: nel popup del segnalibro, subito **sotto lo slider di priorità**: funziona come le categorie (menu con i tag esistenti + "Crea un tag"), ma **senza colori** e con **selezione multipla** (i tag scelti appaiono come chip rimovibili).

I tag vengono salvati insieme ai dati locali e inclusi nel backup ZIP.




### Raggruppamento




Quando due o più marker si sovrappongono per **oltre il 30%** allo zoom corrente, restano tutti visibili e vengono disposti **affiancati in cerchio attorno al loro punto mediano**, con un raggio calcolato in base alle loro dimensioni (che dipendono dalla priorità), così non si toccano.




- Ogni marker sparpagliato mantiene foto, colore categoria, opacità e dimensione.

- Zoomando, i marker che non si intersecano più tornano alla posizione esatta; quelli ancora intersecati vengono ricalcolati attorno al nuovo punto mediano del gruppo residuo (ricalcolo a ogni cambio di zoom/pan).




### Ricerca (icona fluttuante in basso a sinistra)




- Icona bianca con bordo nero, opacità 75%; popup con sfondo nero opaco al 75%.

- Campo di ricerca con menu a tendina: digitando parte del nome compaiono i segnalibri corrispondenti, ciascuno preceduto dalla miniatura tonda della foto. Selezionandone uno la mappa ci si sposta sopra.

- Nel pannello Cerca, oltre ai segnalibri, compaiono i **risultati di ricerca indirizzi/luoghi** in una sezione separata "Indirizzi". Selezionando un risultato la mappa ci si sposta sopra. La ricerca è limitata all'area europea, con attesa (debounce) mentre si digita. Funziona solo online: offline la sezione mostra un avviso.




### Filtro (seconda icona fluttuante in basso a sinistra)




- Icona bianca con bordo nero, opacità 75%; popup con sfondo nero opaco al 75%.

- Categorie: selezione/deselezione singola + casella "tutte/nessuna" (default: tutte).

- Priorità: slider percentuale + switch superiore (>) / inferiore (<). Default: 0% e "superiore".

- Tag cloud: ogni tag è una chip cliccabile che si attiva/disattiva, con casella "tutti / nessuno" come per le categorie. Un segnalibro è visibile se ha almeno un tag attivo (o nessun tag, gestito da una voce "Senza tag").




### Opzioni (terza icona fluttuante in basso a sinistra)




- Esporta backup: file ZIP con `data.json` (segnalibri + categorie) e cartella `photos/` con le immagini WebP.

- Importa backup: caricamento dello ZIP e ripristino dei dati.

- Elimina tutti i dati: con conferma.




### Stile popup segnalibri




Il popup di creazione/modifica segnalibro ha lo stesso stile degli altri pannelli: **sfondo nero opaco al 75%**, bordo bianco tenue, testo bianco, campi e pulsanti coerenti.

Il popup sta sopra a tutto: i marker della mappa non gli si sovrappongono mai (livello di sovrapposizione più alto, marker nascosti dietro).




## Dettagli tecnici




- Dati e foto in locale con IndexedDB (nessun backend); nessun dato lascia il dispositivo.

- Leaflet caricato solo lato client (import dinamico dietro `ClientOnly`) per compatibilità SSR.

- Clustering personalizzato basato sulla distanza in pixel tra marker rispetto al diametro visivo effettivo (che dipende dalla priorità), ricalcolato a ogni cambio zoom/pan.

- Ritaglio foto su canvas → export `image/webp`; miniature riusate in ricerca e mappa.

- ZIP generato/letto con `fflate` o `jszip`.

- PWA: manifest, icone, service worker (`vite-plugin-pwa`) con precache dell'app shell e cache runtime delle tile della mappa per l'uso offline.

- `src/lib/bookmarks/types.ts`: `Bookmark.tags: string[]` e nuovo tipo `Tag { id, name }` in `AppData`; migrazione tollerante per i dati esistenti (tag mancanti = array vuoto) e supporto nel backup ZIP.

- `src/lib/bookmarks/filter.ts`: nuovo stato `excludedTags` + logica corrispondente.

- Ricerca indirizzi via API pubblica Nominatim/OpenStreetMap (nessuna chiave, stesso fornitore delle tile), con debounce e limite risultati.




## Struttura




- `src/routes/index.tsx` — pagina mappa (unica schermata) con head/SEO dedicato.

- `src/components/map/` — mappa, marker, cluster, long-press.

- `src/components/bookmark/` — popup di modifica, editor foto, selettore categoria, slider priorità.

- `src/components/overlay/` — ricerca, pannello filtri, pannello opzioni.

- `src/lib/` — storage IndexedDB, modello dati, scala priorità, backup ZIP.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://polimapp.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/aea916a2-0e9e-447b-bea7-20ef4c43ffab).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
