# Roadmap — Backup XLSX + Macro

- [ ] Modello dati: Macro, Category.emoji/macroId, AppData.macros, migrazione sicura; nuovi ID = UUID v4
- [ ] IndexedDB v2 con store "macros"; store.tsx CRUD macro
- [ ] Filtro: gerarchia visibilità macro (excludedMacros, senza toccare le singole categorie)
- [ ] UI categorie: emoji + assegnazione macro + gestione macro; FilterPanel con gruppi macro
- [ ] Export XLSX (schede Segnalibri/Legenda/Impostazioni, foto JPG circolari sfondo nero, celle unite macro)
- [ ] Import XLSX (posizione cella per foto, date/seriali/formati IT, taglist multilinea, Legenda con celle unite)
- [ ] Merge additivo condiviso XLSX+ZIP: regole ID (UUID/legacy/nuovi), duplicati, conflitti con scelta utente
- [ ] ZIP: import additivo, estensioni foto corrette (jpg/webp), compatibilità backup esistenti
- [ ] OptionsPanel: XLSX primario, ZIP alternativa, modalità Aggiungi predefinita / Sostituisci con conferma, progressi, riepilogo
- [ ] Test: roundtrip, foto assenti/recuperate, dati parziali, ID UUID/legacy/vuoti, duplicati, ZIP legacy additivo, sostituisci, nomi ambigui, multi-tag, macro on/off
- [ ] Verifica build statica
