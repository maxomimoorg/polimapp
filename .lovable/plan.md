# Popup segnalibro a riepilogo, filtro persistente, indirizzi Google Maps

## Risposta sui formati Google Maps (prima di tutto)

- `Via Enna, 10, 04011 Aprilia LT` — **sì**, funziona già con la ricerca attuale (normalizzo la stringa e la invio al geocoder).
- `41,5855912, 12,6604862` — **sì**, riconosciute in locale come coordinate (gestisco anche la virgola decimale italiana); vado direttamente sul punto senza chiamate esterne.
- `HMP5+CWM Aprilia, Provincia di Latina` (Plus Code) — **sì**, decodificabile in locale: il codice corto viene completato usando la località indicata ("Aprilia") e convertito in coordinate.
- `https://maps.app.goo.gl/...` (link breve condiviso) — **solo con un piccolo passaggio lato server**. Il browser non può leggere dove punta il link (blocco cross-origin). Aggiungo una funzione server dell'app che apre il link, ne estrae coordinate o nome del luogo e le restituisce. Funziona solo online; offline mostro l'avviso già presente. I link lunghi `google.com/maps/...` con `@lat,lng` li leggo invece direttamente nel browser.

## Modifiche al popup del segnalibro

Il popup si apre come **riepilogo di sola lettura**; ogni riga diventa modificabile al tocco.

- **Nome**: mostrato come testo (default "Nome"); al tocco diventa campo di testo, esce dalla modifica al blur/Invio.
- **Indirizzo**: mostra l'indirizzo rilevato dal punto scelto sulla mappa; al tocco diventa campo modificabile (resta il lucchetto attuale).
- **Note**: diventa un bottone. Apre un popup largo con editor di testo (testo chiaro su fondo scuro) con grassetto, corsivo, elenco puntato e link. Dopo il salvataggio, accanto al bottone compare una riga con i primi 30 caratteri seguiti da "…".
- **Categoria**: mostra solo la categoria selezionata; al tocco apre un popup dedicato per scegliere, creare, rinominare, cambiare colore ed eliminare le categorie.
- **Tag**: nel riepilogo solo la nuvola dei tag selezionati; al tocco apre un popup con la nuvola completa:
  - selezionati accesi e in cima, non selezionati al 75% di opacità e spenti;
  - `+` per creare un tag;
  - icona cestino che attiva la modalità eliminazione, poi si tocca il tag da eliminare;
  - pressione prolungata (1 s) su un tag per rinominarlo.
- **Elimina**: chiede conferma prima di cancellare il segnalibro (anche per categorie e tag eliminati dai rispettivi popup).

Tutti i popup annidati si chiudono con tap esterno o Esc, coerenti con lo stile attuale (nero 75%, bordo tenue).

## Filtro persistente

L'ultimo stato del filtro (categorie, tag, priorità e modo >/<) viene salvato sul dispositivo e ricaricato all'apertura successiva, anche dopo la chiusura dell'app.

## Dettagli tecnici

- `src/lib/bookmarks/filter.ts`: aggiungo caricamento/salvataggio di `FilterState` (localStorage, con merge sui valori di default per compatibilità); `MapApp.tsx` inizializza da lì e scrive a ogni cambio.
- `src/lib/bookmarks/geocode.ts`: nuovo parser d'ingresso in cascata — coordinate (virgole/punti, gradi opzionali) → Plus Code (`open-location-code`, con geocoding della località per i codici corti) → URL Google Maps lungo (`@lat,lng` o `!3dlat!4dlng`) → link breve via funzione server → testo libero verso Photon/Nominatim.
- Nuovo `src/lib/maps-link.functions.ts` con `createServerFn` che segue il redirect del link breve e restituisce `{ lat, lng, label }`; validazione host (`maps.app.goo.gl`, `goo.gl/maps`) e nessun altro fetch arbitrario.
- Note: editor `contentEditable` con `document.execCommand`-free (comandi via `Selection`/wrapping semplice) salvando HTML sanificato limitato a `<b> <i> <ul> <li> <a> <br> <p>`; `Bookmark.notes` continua a contenere la stringa (ora HTML) — l'anteprima usa il testo spogliato dai tag.
- `BookmarkEditor.tsx` diviso in sottocomponenti: `SummaryRow`, `NotesDialog`, `CategoryDialog`, `TagDialog`, più un `ConfirmDialog` riusabile per le eliminazioni.
- Nessuna modifica al modello dati (`types.ts`) né al formato del backup ZIP.
