# Popup più comodi, chiusura con tap esterno, tempi di pressione

## 1. Chiusura con tap esterno (ora non funziona)

Il pannello nero di sfondo è un elemento separato sopra l'area cliccabile, quindi il tap "fuori" colpisce lo sfondo e non chiude nulla. Il contenitore dei popup viene ricostruito così: lo sfondo scuro stesso riceve il tap e chiude il popup, mentre il contenuto lo blocca. Vale per segnalibro, ricerca, filtro, opzioni e per il menu foto.

## 2. Via la X da tutti i popup

Rimossi i pulsanti di chiusura in Ricerca, Filtro e Opzioni (nel popup segnalibro non c'è già più). La chiusura avviene con tap esterno o Esc. La piccola x sulle chip dei tag resta: serve a rimuovere il tag, non a chiudere.

## 3. Lightbox foto a schermo intero

La foto ingrandita esce dal popup e copre tutto lo schermo: sfondo nero pieno, immagine fino a 92% di larghezza e altezza, sopra ogni altro pannello. Tap in qualunque punto (o Esc) chiude.

## 4. Popup senza scorrimento

Obiettivo: tutto visibile senza scorrere.

- Desktop/tablet: popup segnalibro più largo (circa 34rem) su due colonne — a sinistra foto, nome, indirizzo; a destra categoria, priorità, tag, pulsanti. Pannelli ricerca/filtro/opzioni portati a circa 26rem.
- Smartphone: layout a colonna unica compattato — spaziature e altezze ridotte, etichette più corte, priorità e tag su righe singole, pulsanti Salva/Elimina fissi in fondo al foglio e sempre raggiungibili col pollice.
- Lo scorrimento interno resta disponibile solo come riserva (altezza massima del foglio), non come comportamento normale.

## 5. Tempi di pressione

- Nuovo segnalibro con pressione prolungata su spazio vuoto: 0,75 secondi. Clic destro invariato. Il doppio clic per creare viene rimosso, così resta solo quanto richiesto.
- Attivazione trascinamento marker: 1,2 secondi (ora 2 s). Il suggerimento in basso a destra viene aggiornato.
- Il suggerimento in basso a destra, dopo essersi mostrato per 8 secondi, va a opacità 10%, riattivandosi al passaggio del mouse o per altri 8 secondi dopo un tap.

## Note tecniche

- `Overlay` in `src/components/MapApp.tsx`: backdrop come unico elemento a tutto schermo con `onPointerDown` di chiusura e `stopPropagation` sul contenuto; larghezze differenziate per pannelli e editor.
- `MapView.tsx`: timer long-press mappa a 1000 ms, rimozione handler `dblclick` di creazione, timer drag marker a 1200 ms.
- `BookmarkEditor.tsx`: lightbox in `z-[3000]` `fixed inset-0`, griglia `sm:grid-cols-2`, barra azioni sticky in basso su mobile.
- `styles.css`: `sheet` con `max-height` e `overflow-y: auto` mantenuti come fallback; spaziature `panel-input`/`panel-label` ridotte su mobile.