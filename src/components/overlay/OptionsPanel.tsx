import { useRef, useState } from "react";
import { toast } from "sonner";
import type { BookmarkStore } from "@/lib/bookmarks/store";
import { exportBackup, importBackup } from "@/lib/bookmarks/backup";

export function OptionsPanel({ store, onClose }: { store: BookmarkStore; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold tracking-wide">Opzioni</h2>
      <div className="space-y-2">
        <button
          type="button"
          className="panel-btn w-full"
          onClick={async () => {
            const blob = await exportBackup(store.data);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `segnalibri-${new Date().toISOString().slice(0, 10)}.zip`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Esporta backup (ZIP)
        </button>
        <button type="button" className="panel-btn-ghost w-full" onClick={() => fileRef.current?.click()}>
          Importa backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              await importBackup(f);
              await store.reload();
              toast.success("Backup importato");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Importazione non riuscita");
            }
          }}
        />
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
              <button type="button" className="panel-btn-ghost flex-1" onClick={() => setConfirming(false)}>
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="panel-btn-danger w-full" onClick={() => setConfirming(true)}>
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