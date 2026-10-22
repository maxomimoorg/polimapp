# PoliMapP

Mappa personale per raccogliere e organizzare luoghi tramite segnalibri, foto, categorie, tag, note e priorità. I dati dei segnalibri restano sul dispositivo; il backup permette di esportarli e importarli.

## Mappa offline e online

- **Offline:** cartografia mondiale essenziale basata sui GeoJSON Natural Earth inclusi nel progetto, senza richieste di rete per la mappa di base.
- **Online:** cartografia dettagliata OpenFreeMap, visualizzata tramite MapLibre e Leaflet, senza chiavi API.
- App installabile con service worker; la cache della mappa non viene cancellata forzatamente.

## Sviluppo locale

Sono necessari Node.js e npm. Dopo aver clonato il repository, installare le dipendenze e avviare il server di sviluppo:

```sh
npm install
npm run dev
```

Aprire l'indirizzo indicato dal server nel terminale.

## Build

```sh
npm run build
```

Per generare la versione statica destinata a GitHub Pages sotto `/polimapp/`, su sistemi con shell POSIX:

```sh
GITHUB_PAGES=1 npm run build
```

## Tecnologie

TanStack Start, React, TypeScript, Tailwind CSS, Leaflet e MapLibre.
