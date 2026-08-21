import { useEffect, useRef } from "react";
import { Bold, Italic, Link2, List } from "lucide-react";
import { SubDialog } from "./SubDialog";
import { sanitizeNotes } from "@/lib/bookmarks/rich-text";

/** Editor note con formattazione di base (grassetto, corsivo, elenco, link). */
export function NotesDialog({
  value,
  onSave,
  onClose,
}: {
  value: string;
  onSave: (html: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = value || "";
      ref.current.focus();
    }
  }, [value]);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
  };

  return (
    <SubDialog onClose={onClose} title="Note" width="40rem">
      <div className="mb-2 flex gap-2">
        <button type="button" aria-label="Grassetto" className="panel-icon-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")}>
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Corsivo" className="panel-icon-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")}>
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Elenco puntato"
          className="panel-icon-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("insertUnorderedList")}
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Link"
          className="panel-icon-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt("Indirizzo del link (https://…)");
            if (url && /^(https?:|mailto:|tel:)/i.test(url.trim())) exec("createLink", url.trim());
          }}
        >
          <Link2 className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-label="Testo delle note"
        suppressContentEditableWarning
        className="notes-editor min-h-[9rem] max-h-[50dvh] overflow-y-auto rounded-lg border border-white/20 bg-black/50 p-3 text-sm text-white/90 outline-none"
      />

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="panel-btn flex-1"
          onClick={() => {
            onSave(sanitizeNotes(ref.current?.innerHTML ?? ""));
            onClose();
          }}
        >
          Salva note
        </button>
        <button type="button" className="panel-btn-ghost flex-1" onClick={onClose}>
          Annulla
        </button>
      </div>
    </SubDialog>
  );
}
