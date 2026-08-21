import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ALLOWED_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "maps.google.com", "www.google.com", "g.co"]);

export interface ResolvedMapsLink {
  lat: number | null;
  lng: number | null;
  label: string | null;
}

function extractFromUrl(url: string): ResolvedMapsLink {
  const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url);
  const d34 = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(url);
  const q = /[?&](?:q|query|destination)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/.exec(url);
  const hit = d34 ?? q ?? at;
  const place = /\/maps\/place\/([^/@?]+)/.exec(url);
  return {
    lat: hit ? Number(hit[1]) : null,
    lng: hit ? Number(hit[2]) : null,
    label: place?.[1] ? decodeURIComponent(place[1]).replace(/\+/g, " ") : null,
  };
}

/** Segue il redirect di un link breve di Google Maps ed estrae coordinate o nome del luogo. */
export const resolveMapsLink = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ url: z.string().url().max(2048) }).parse(data))
  .handler(async ({ data }): Promise<ResolvedMapsLink> => {
    const parsed = new URL(data.url);
    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      throw new Error("Link non supportato");
    }

    let finalUrl = parsed.toString();
    let html = "";
    try {
      const res = await fetch(finalUrl, {
        redirect: "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
          "accept-language": "it,en;q=0.8",
        },
      });
      finalUrl = res.url || finalUrl;
      html = await res.text();
    } catch {
      /* si prova comunque con l'URL finale noto */
    }

    const fromUrl = extractFromUrl(finalUrl);
    if (fromUrl.lat != null && fromUrl.lng != null) return fromUrl;

    const fromHtml = extractFromUrl(html.slice(0, 400_000));
    if (fromHtml.lat != null && fromHtml.lng != null) {
      return { ...fromHtml, label: fromHtml.label ?? fromUrl.label };
    }

    const title = /<title>([^<]{2,200})<\/title>/i.exec(html);
    return {
      lat: null,
      lng: null,
      label: fromUrl.label ?? fromHtml.label ?? (title?.[1] ? title[1].replace(/ - Google Maps.*$/i, "").trim() : null),
    };
  });
