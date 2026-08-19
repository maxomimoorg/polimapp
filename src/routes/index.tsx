import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

const MapApp = lazy(() => import("@/components/MapApp"));

const title = "Mappa Segnalibri — mappa offline dei tuoi luoghi";
const description =
  "App installabile per salvare segnalibri sulla mappa d'Europa: foto, categorie, tag, priorità e backup. Tutti i dati restano sul tuo dispositivo.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
    links: [{ rel: "manifest", href: "/manifest.webmanifest" }],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly fallback={<div className="grid h-dvh w-screen place-items-center bg-black text-white/60">Caricamento…</div>}>
      <Suspense fallback={<div className="grid h-dvh w-screen place-items-center bg-black text-white/60">Caricamento…</div>}>
        <MapApp />
      </Suspense>
    </ClientOnly>
  );
}
