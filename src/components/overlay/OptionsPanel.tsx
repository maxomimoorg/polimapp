import { useRef, useState } from "react";
import { toast } from "sonner";
import type { BookmarkStore } from "@/lib/bookmarks/store";
import { exportBackup, parseZipBackup } from "@/lib/bookmarks/backup";
import {
  planMerge,
  resolveConflicts,
  EMPTY_DATA,
  type ImportSummary,
  type MergePlan,
} from "@/lib/bookmarks/merge";
import { getPhoto } from "@/lib/bookmarks/db";
import { parseXlsxBackup } from "@/lib/bookmarks/xlsx-import";
import { exportXlsx } from "@/lib/bookmarks/xlsx-export";

type Mode = "add" | "replace";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function readBackup(f: File, onProgress: (label: string) => void) {
  if (/\.xlsx$/i.test(f.name)) {
    return parseXlsxBackup(f, { onProgress: (d, t, l) => onProgress(`${l} ${d}/${t}`) });
  }
  if (/\.zip$/i.test(f.name)) return parseZipBackup(f);
  throw new Error("Formato non supportato: scegli un file .xlsx o .zip");
}

function Summary({ s }: { s: ImportSummary }) {
  const rows: Array<[string, number]> = [
    ["Importati", s.imported],
    ["Duplicati nel file", s.duplicatesInFile],
    ["Conflitti", s.conflicts],
    ["· mantenuti", s.conflictsKept],
    ["· sovrascritti", s.conflictsOverwritten],
    ["· copiati con nuovo ID", s.conflictsDuplicated],
    ["Righe parziali", s.partialRows],
    ["Foto ripristinate", s.photosRestored],
    ["Foto mancanti", s.photosMissing],
    ["Nuove categorie", s.newCategories],
    ["Nuovi tag", s.newTags],
    ["Nuove macro", s.newMacros],
  ];
  return (
    <div className="space-y-1 rounded-md border border-white/20 p-2 text-xs">
      <p className="font-semibold">Riepilogo importazione</p>
      {rows.map(([l, v]) => (
        <div key={l} className="flex justify-between">
          <span className="text-white/70">{l}</span>
          <span>{v}</span>
        </div>
      ))}
      {[...s.errors.map((e) => `Errore: ${e}`), ...s.warnings].length ? (
        <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-4 text-white/70">
          {s.errors.map((e, i) => (
            <li key={`e${i}`}>Errore: {e}</li>
          ))}
          {s.warnings.map((w, i) => (
            <li key={`w${i}`}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function OptionsPanel({
  store,
  onClose: _onClose,
}: {
  store: BookmarkStore;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [mode, setMode] = useState<Mode>("add");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<MergePlan | null>(null);
  const [replacePlan, setReplacePlan] = useState<MergePlan | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const today = () => new Date().toISOString().slice(0, 10);

  const finish = async (plan: MergePlan) => {
    setBusy("Salvataggio…");
    try {
      await store.applyImport(plan.data, plan.photos);
      setSummary(plan.summary);
      toast.success(`Importati ${plan.summary.imported} segnalibri`);
    } finally {
      setBusy(null);
      setPending(null);
    }
  };

  const onFile = async (f: File) => {
    setSummary(null);
    setBusy("Lettura file…");
    try {
      const incoming = await readBackup(f, setBusy);
      if (mode === "replace") {
        // Il file è già stato letto e validato: solo ora, previa conferma, si cancella.
        setReplacePlan(planMerge(EMPTY_DATA, incoming));
        return;
      }
      const plan = planMerge(store.data, incoming);
      if (plan.conflicts.length > 0) setPending(plan);
      else await finish(plan);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Importazione non riuscita");
    } finally {
      setBusy((b) => (b === "Salvataggio…" ? b : null));
    }
  };

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold tracking-wide">Opzioni</h2>
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-white/50">
          Backup foglio di calcolo (consigliato)
        </p>
        <button
          type="button"
          className="panel-btn w-full"
          disabled={!!busy}
          onClick={async () => {
            setBusy("Preparazione XLSX…");
            try {
              const blob = await exportXlsx(store.data, {
                getPhoto,
                onProgress: (d, t, l) => setBusy(`${l} ${d}/${t}`),
              });
              download(blob, `polimapp-${today()}.xlsx`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Esportazione non riuscita");
            } finally {
              setBusy(null);
            }
          }}
        >
          Esporta XLSX
        </button>
        <button
          type="button"
          className="panel-btn-ghost w-full"
          disabled={!!busy}
          onClick={async () => {
            setBusy("Preparazione ZIP…");
            try {
              download(await exportBackup(store.data), `segnalibri-${today()}.zip`);
            } finally {
              setBusy(null);
            }
          }}
        >
          Esporta backup ZIP (alternativa)
        </button>

        <p className="pt-2 text-[11px] uppercase tracking-wide text-white/50">
          Importa (XLSX o ZIP)
        </p>
        <div className="flex gap-2" role="radiogroup" aria-label="Modalità importazione">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "add"}
            className={mode === "add" ? "panel-btn flex-1" : "panel-btn-ghost flex-1"}
            onClick={() => setMode("add")}
          >
            Aggiungi
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "replace"}
            className={mode === "replace" ? "panel-btn-danger flex-1" : "panel-btn-ghost flex-1"}
            onClick={() => setMode("replace")}
          >
            Sostituisci
          </button>
        </div>
        <p className="text-[11px] text-white/50">
          {mode === "add"
            ? "Aggiunge i segnalibri del file a quelli presenti, senza cancellare nulla."
            : "Cancella tutti i dati attuali e li sostituisce con il file (chiede conferma)."}
        </p>
        <button
          type="button"
          className="panel-btn w-full"
          disabled={!!busy}
          onClick={() => fileRef.current?.click()}
        >
          Importa file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.zip,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onFile(f);
          }}
        />

        {busy ? (
          <p role="status" className="animate-pulse text-xs text-white/80">
            {busy}
          </p>
        ) : null}

        {pending ? (
          <div className="space-y-2 rounded-md border border-white/20 p-2">
            <p className="text-xs text-white/80">
              {pending.conflicts.length} segnalibri del file hanno lo stesso ID di segnalibri già
              presenti. Come procedere?
            </p>
            <button
              type="button"
              className="panel-btn w-full"
              onClick={() => finish(resolveConflicts(pending, "keep"))}
            >
              Mantieni quelli esistenti
            </button>
            <button
              type="button"
              className="panel-btn-ghost w-full"
              onClick={() => finish(resolveConflicts(pending, "duplicate"))}
            >
              Importa come copie (nuovo ID)
            </button>
            <button
              type="button"
              className="panel-btn-danger w-full"
              onClick={() => finish(resolveConflicts(pending, "overwrite"))}
            >
              Sovrascrivi con quelli del file
            </button>
            <button
              type="button"
              className="panel-btn-ghost w-full"
              onClick={() => setPending(null)}
            >
              Annulla importazione
            </button>
          </div>
        ) : null}

        {replacePlan ? (
          <div className="space-y-2 rounded-md border border-white/20 p-2">
            <p className="text-xs text-white/80">
              File valido: {replacePlan.data.bookmarks.length} segnalibri. Cancellare tutti i dati
              attuali e sostituirli?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="panel-btn-danger flex-1"
                onClick={async () => {
                  const p = replacePlan;
                  setReplacePlan(null);
                  setBusy("Sostituzione…");
                  try {
                    await store.replaceEverything(p.data, p.photos);
                    setSummary(p.summary);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Sostituisci tutto
              </button>
              <button
                type="button"
                className="panel-btn-ghost flex-1"
                onClick={() => setReplacePlan(null)}
              >
                Annulla
              </button>
            </div>
          </div>
        ) : null}

        {summary ? <Summary s={summary} /> : null}

        {confirming ? (
          <div className="space-y-2 rounded-md border border-white/20 p-2">
            <p className="text-xs text-white/80">Eliminare tutti i segnalibri, categorie e foto?</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="panel-btn-danger flex-1"
                onClick={async () => {
                  await store.wipe();
                  setConfirming(false);
                  toast.success("Dati eliminati");
                }}
              >
                Elimina tutto
              </button>
              <button
                type="button"
                className="panel-btn-ghost flex-1"
                onClick={() => setConfirming(false)}
              >
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="panel-btn-danger mt-4 w-full"
            onClick={() => setConfirming(true)}
          >
            Elimina tutti i dati
          </button>
        )}
        <p className="pt-2 text-[11px] text-white/50">
          Tutti i dati restano su questo dispositivo. Nessuna informazione viene inviata online.
        </p>
      </div>
    </div>
  );
}
