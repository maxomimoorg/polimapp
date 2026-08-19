# Tema notte, cluster più compatti, import backup legacy

## 1. Mappa in tema notte

Sostituire il tile layer OpenStreetMap standard con un layer scuro (CARTO "dark_matter", gratuito e senza API key), mantenendo l'attribuzione corretta. Sfondo del contenitore mappa e controlli Leaflet (zoom, pulsante "inquadra tutti") ricolorati in scuro con icone chiare.

## 2. Marker separati più vicini

Oggi i marker sovrapposti vengono disposti su un cerchio con raggio ampio, che li allontana molto. Nuovo comportamento: raggio minimo necessario perché due marker adiacenti si sovrappongano al massimo del 10% della loro area (non del diametro), cioè distanza fra centri calcolata dalla formula dell'area di intersezione di due cerchi. Il gruppo resta quindi compatto e visivamente unito.

## 3. Import del backup con foto (formato precedente)

Il file caricato usa un formato più vecchio:

- `version: 1`, nessun array `tags`
- ogni segnalibro ha `photoFile: "<id>.webp"` invece di `photoId`
- manca `updatedAt`, `tags`

L'import verrà reso tollerante: riconosce `photoFile` (togliendo l'estensione) o `photoId`, tratta `tags` mancanti come lista vuota, ricava `updatedAt` da `createdAt`, e collega le foto della cartella `photos/` tramite il nome file. Vengono importate anche categorie senza array `tags`. Il formato attuale continua a funzionare invariato.

## 4. Menu a tendina e controlli in tema scuro

I `<select>` usano ora lo stile del sistema (opzioni bianche su sfondo chiaro nel menu aperto). Verranno resi coerenti col tema scuro: sfondo scuro e testo chiaro su select e relative `option`, più `color-scheme: dark` così che anche i controlli nativi (menu a tendina, checkbox, range, color picker, scrollbar) siano scuri. Stessa cura per checkbox dei filtri e campi input.

## 5. Modifica delle categorie e dei tag

- Accanto al nome di ogni categoria o tag nei menu a tendina, aggiungi l'icona di una piccola matita, permettendo la modifica del nome del tag e del nome e colore della categoria.
- Prima del nome di ogni categoria nei menu a tendina, metti un puntino del colore della categoria.

## Dettagli tecnici

- `src/components/map/MapView.tsx`: URL tile CARTO dark, attribuzione aggiornata.
- `src/components/map/cluster.ts`: nuovo calcolo del raggio dal vincolo di sovrapposizione ≤10% dell'area.
- `src/lib/bookmarks/types.ts` + `src/lib/bookmarks/backup.ts`: `migrateBookmark` accetta `photoFile`; import mappa i file `photos/*` sugli id.
- `src/styles.css`: `color-scheme: dark`, stile `select`/`option`, checkbox e scrollbar dei pannelli.