const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "A", "BR", "P", "DIV", "SPAN"]);

/** Ripulisce l'HTML delle note tenendo solo formattazione di base e link sicuri. */
export function sanitizeNotes(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, "");
  const root = document.createElement("div");
  root.innerHTML = html;

  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      walk(child);
      if (!ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const keep =
          child.tagName === "A" &&
          attr.name === "href" &&
          /^(https?:|mailto:|tel:)/i.test(attr.value.trim());
        if (!keep) child.removeAttribute(attr.name);
      }
      if (child.tagName === "A") {
        child.setAttribute("target", "_blank");
        child.setAttribute("rel", "noopener noreferrer");
      }
    }
  };
  walk(root);
  return root.innerHTML;
}

/** Testo semplice ricavato dalle note (per l'anteprima di una riga). */
export function notesToText(html: string): string {
  const withBreaks = html
    .replace(/<\/(p|div|li|ul|ol)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "");
  const decoded =
    typeof document === "undefined"
      ? withBreaks
      : (() => {
          const el = document.createElement("textarea");
          el.innerHTML = withBreaks;
          return el.value;
        })();
  return decoded.replace(/\s+/g, " ").trim();
}

/** Anteprima: primi 50 caratteri seguiti da "…" se il testo continua. */
export function notesPreview(html: string, max = 50): string {
  const text = notesToText(html);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
