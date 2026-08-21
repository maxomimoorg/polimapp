import { useEffect } from "react";

/** Popup annidato: si chiude con tap esterno o Esc, stile coerente con i pannelli. */
export function SubDialog({
  onClose,
  title,
  width = "34rem",
  children,
}: {
  onClose: () => void;
  title?: string;
  width?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[2600] flex items-end justify-center bg-black/55 sm:items-center"
      onPointerDown={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="relative w-full sm:w-auto" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet p-4 sm:w-[var(--sheet-w)]" style={{ ["--sheet-w" as string]: width }}>
          {title ? <p className="mb-3 text-sm font-semibold text-white/90">{title}</p> : null}
          {children}
        </div>
      </div>
    </div>
  );
}

/** Conferma riusabile per le eliminazioni. */
export function ConfirmDialog({
  message,
  confirmLabel = "Elimina",
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <SubDialog onClose={onCancel} width="22rem">
      <p className="mb-4 text-sm text-white/90">{message}</p>
      <div className="flex gap-2">
        <button type="button" className="panel-btn-danger flex-1" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="panel-btn-ghost flex-1" onClick={onCancel}>
          Annulla
        </button>
      </div>
    </SubDialog>
  );
}
