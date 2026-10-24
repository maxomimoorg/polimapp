# Revisione app: indirizzo, undo/redo, mappa mondiale, UI mobile-first

## 1. Indirizzo nel segnalibro

- Nuovo campo `address` (testo) e `locked` (booleano) sul segnalibro, salvati in locale e inclusi nel backup; i segnalibri esistenti partono con indirizzo vuoto e lucchetto aperto.
- Nel popup del segnalibro: campo "Indirizzo" con accanto un'icona lucchetto (aperto = opacità 50%, chiuso = piena). Tap per cambiare stato.
- Lucchetto aperto (default): l'indirizzo è modificabile; premendo Salva, se l'indirizzo è cambiato viene geocodificato (OpenStreetMap) e il marker si sposta sulla nuova posizione. Se l'indirizzo non è trovato, si avvisa e non si salva la posizione.
- Lucchetto chiuso: campo indirizzo in sola lettura e marker non trascinabile sulla mappa.
- Spostando il marker a mano sulla mappa, l'indirizzo viene riscritto automaticamente con quello corrente (geocodifica inversa).

## 2. Categorie e tag: eliminazione

- Accanto alla matita, un'icona cestino in ogni riga dei menu categoria/tag, con conferma.
- Eliminando una categoria, i segnalibri collegati restano senza categoria; eliminando un tag, viene rimosso da tutti i segnalibri.

## 3. Separazione marker

- Tolleranza di sovrapposizione abbassata dal 10% all'1% dell'area.
- Nuovo algoritmo di posizionamento: invece di disporre il gruppo in cerchio, ogni marker in eccesso viene spostato nel primo spazio libero più vicino attorno al punto originale (ricerca a spirale con verifica di collisione contro tutti i marker già posizionati), così restano il più possibile vicini alla posizione reale.

## 4. Chiusura popup

- Tap/click fuori dal popup (o tasto Esc) chiude qualsiasi pannello: segnalibro, ricerca, filtro, opzioni. La X resta.
- Se il popup appena aperto riguarda un segnalibro appena creato e non è stato premuto Salva, la creazione viene annullata (il marker sparisce). Vale sia per la X, sia per il tap fuori, sia per Esc.

## 5. Annulla / Ripeti

- Coppia di icone fluttuanti (frecce indietro/avanti) sulla mappa, disattivate quando non c'è nulla da annullare o ripetere.
- Cronologia in memoria delle ultime ~50 operazioni: creazione, modifica, spostamento ed eliminazione di segnalibri, oltre a creazione/modifica/eliminazione di categorie e tag.

## 6. Mappa mondiale

- Rimosso il vincolo sull'Europa: zoom minimo e limiti impostati per il mondo intero; anche la ricerca indirizzi non è più limitata all'Europa.
- All'avvio la vista inquadra automaticamente tutti i segnalibri; se non ce ne sono, vista mondiale predefinita con Italia al centro.

## 7. Interfaccia mobile-first

- Pulsanti fluttuanti più grandi (target ~38px), disposti per il pollice; su desktop dimensioni e posizioni riadattate.
- Popup: su mobile occupano tutta la larghezza e si comportano come fogli a scomparsa dal basso, con altezza massima adattata allo schermo verticale e scorrimento interno; su desktop tornano pannelli flottanti di larghezza fissa.
- Controlli interni (input, slider, voci di menu, chip tag) ingranditi per il tocco.

## 8. Stile icone fluttuanti

- Tutte le icone sulla mappa (ricerca, filtro, opzioni, annulla/ripeti, zoom Leaflet, "inquadra tutti") condividono un unico stile: simbolo chiaro su sfondo scuro traslucido e sfocato, bordo sottile, forma tonda.

## Note tecniche

- `Bookmark` esteso con `address: string` e `locked: boolean`; `migrateBookmark` fornisce i valori di default per i dati esistenti e per i backup importati.
- Geocodifica diretta e inversa via Nominatim in `src/lib/bookmarks/geocode.ts` (nuova funzione `reverseGeocode`), senza limiti geografici.
- Cronologia undo/redo gestita nello store (`src/lib/bookmarks/store.tsx`) come stack di azioni inverse, applicate anche su IndexedDB.
- `spreadOverlapping` in `src/components/map/cluster.ts` riscritto con ricerca a spirale del primo slot libero.
- Stile condiviso `.map-fab` / `.glass-panel` in `src/styles.css`, applicato anche ai controlli Leaflet.