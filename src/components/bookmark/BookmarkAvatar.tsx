import { MapPin } from "lucide-react";
import type { BookmarkAvatar as Avatar } from "@/lib/bookmarks/avatar";

/** Interno del cerchio: foto, emoji della categoria (come testo) o segnaposto neutro. */
export function BookmarkAvatarContent({ avatar, size = "md" }: { avatar: Avatar; size?: "sm" | "md" }) {
  if (avatar.kind === "photo")
    return <img src={avatar.url} alt="" className="h-full w-full object-cover" />;
  if (avatar.kind === "emoji")
    return (
      <span
        data-testid="avatar-emoji"
        aria-hidden="true"
        className={`grid h-full w-full place-items-center leading-none ${size === "sm" ? "text-sm" : "text-3xl"}`}
      >
        {avatar.emoji}
      </span>
    );
  return (
    <span
      data-testid="avatar-placeholder"
      aria-hidden="true"
      className="grid h-full w-full place-items-center text-muted-foreground"
    >
      <MapPin className={size === "sm" ? "h-3.5 w-3.5" : "h-6 w-6"} />
    </span>
  );
}
