import { ExternalLink, MapPin } from "lucide-react";
import type { GeoPoint } from "@/domain/types";
import { coordsLabel, locationLabel, mapLink } from "@/lib/geo";

/**
 * Where someone clocked in/out. Everyone sees the place name;
 * admins and superadmins also get the GPS accuracy and a Google Maps link to the exact point.
 */
export function LocationCell({ point, canOpenMap }: { point?: GeoPoint | null; canOpenMap: boolean }) {
  if (!point) return <span className="text-slate-400">—</span>;
  const label = locationLabel(point);
  return (
    <span className="flex max-w-[260px] flex-col gap-0.5">
      <span className="flex items-start gap-1 text-slate-700" title={`${label}\n${coordsLabel(point)}`}>
        <MapPin size={13} className="mt-0.5 shrink-0 text-brand-500" />
        <span className="line-clamp-2">{label}</span>
      </span>
      {canOpenMap && (
        <span className="flex items-center gap-2 pl-[18px] text-xs">
          <a
            href={mapLink(point)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
          >
            Open in Google Maps <ExternalLink size={11} />
          </a>
          {point.accuracy != null && <span className="text-slate-400">±{Math.round(point.accuracy)} m</span>}
        </span>
      )}
    </span>
  );
}
