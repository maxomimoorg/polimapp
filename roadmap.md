# Roadmap — Backup XLSX + Macro

- [ ] Modello dati: Macro, Category.emoji/macroId, AppData.macros, migrazione sicura; nuovi ID = UUID v4
- [ ] IndexedDB v2 con store "macros"; store.tsx CRUD macro
- [x] Filtro: gerarchia visibilità macro (excludedMacros, senza toccare le singole categorie)
- [x] UI categorie: emoji + assegnazione macro + gestione macro; FilterPanel con gruppi macro
- [ ] Export XLSX (schede Segnalibri/Legenda/Impostazioni, foto JPG circolari sfondo nero, celle unite macro)
- [ ] Import XLSX (posizione cella per foto, date/seriali/formati IT, taglist multilinea, Legenda con celle unite)
- [ ] Merge additivo condiviso XLSX+ZIP: regole ID (UUID/legacy/nuovi), duplicati, conflitti con scelta utente
- [ ] ZIP: import additivo, estensioni foto corrette (jpg/webp), compatibilità backup esistenti
- [x] OptionsPanel: XLSX primario, ZIP alternativa, modalità Aggiungi predefinita / Sostituisci con conferma, progressi, riepilogo
- [ ] Test: roundtrip, foto assenti/recuperate, dati parziali, ID UUID/legacy/vuoti, duplicati, ZIP legacy additivo, sostituisci, nomi ambigui, multi-tag, macro on/off
- [x] Verifica build statica

- [ ] BLOCCATO: foto realmente "in cella" in XLSX (ExcelJS crea solo immagini flottanti ancorate) — serve decisione utente
- [ ] Test XLSX/merge completi (dopo decisione sul formato foto)

## Localizzazione
- [x] Parser unico coordinate (decimali, cardinali, DM, DMS), Plus Code completi/brevi con località, URL Google Maps
- [x] Errori leggibili in ricerca ed editor segnalibro; test unitari; 6 test foto/XLSX corretti
