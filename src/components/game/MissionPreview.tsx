import { lazy, Suspense, useMemo } from "react";
import { ClientOnly, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plane, Navigation, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMissionPreviewAirports } from "@/lib/missions.functions";
import { findNearestFittingAircraft, type PreviewAircraft } from "@/lib/mission-preview";
import type { Mission } from "@/lib/missions";

const MissionPreviewMap = lazy(() => import("./MissionPreviewMap"));

export function MissionPreview({ mission, fleet, bonus, now }: { mission: Mission; fleet: PreviewAircraft[]; bonus: number; now: number }) {
  const codes = useMemo(() => [...new Set([mission.origin_icao, mission.destination_icao, ...fleet.filter(f => !f.returned_at).map(f => f.location_icao)])].sort(), [mission.origin_icao, mission.destination_icao, fleet]);
  const airports = useQuery({
    queryKey: ["mission-preview-airports", codes],
    queryFn: async () => {
      const batches: string[][] = [];
      for (let i = 0; i < codes.length; i += 200) batches.push(codes.slice(i, i + 200));
      return (await Promise.all(batches.map(batch => getMissionPreviewAirports({ data: { codes: batch } })))).flat();
    },
    staleTime: 300_000,
  });
  const result = useMemo(() => findNearestFittingAircraft(fleet, mission, airports.data ?? [], bonus, now), [fleet, mission, airports.data, bonus, now]);
  const origin = airports.data?.find(a => a.icao === mission.origin_icao);
  const destination = airports.data?.find(a => a.icao === mission.destination_icao);
  const nearest = result.nearest;
  const speed = nearest?.aircraft.type?.cruise_kts ?? 0;
  const minutes = nearest?.ferryNm !== null && nearest?.ferryNm !== undefined && speed > 0 ? Math.ceil(nearest.ferryNm / speed * 60) : null;
  const expires = Math.max(0, Math.ceil((Date.parse(mission.expires_at) - now) / 60000));
  const loadingMap = <div className="flex h-[240px] items-center justify-center border border-border text-sm text-muted-foreground">Loading route map…</div>;
  return (
    <div id={`mission-preview-${mission.id}`} className="grid w-full grid-cols-[minmax(0,1.3fr)_minmax(260px,1fr)] gap-5 border-t border-border pb-2 pt-4">
      <div className="min-w-0">
        {airports.isPending ? loadingMap : airports.isError ? <div role="alert" className="flex h-[240px] flex-col items-center justify-center gap-3 border border-border text-sm text-destructive">Airport details could not be loaded.<Button size="sm" variant="outline" onClick={() => void airports.refetch()}>Retry</Button></div> : origin && destination ? (
          <ClientOnly fallback={loadingMap}><Suspense fallback={loadingMap}><MissionPreviewMap origin={origin} destination={destination} ferry={nearest?.available && nearest.ferryNm !== 0 ? nearest.airport : null} /></Suspense></ClientOnly>
        ) : <div className="flex h-[240px] items-center justify-center border border-border text-sm text-muted-foreground">Route coordinates unavailable · {mission.origin_icao} → {mission.destination_icao}</div>}
        <p className="readout mt-2 text-xs text-primary">{mission.origin_icao} → {mission.destination_icao} · {Math.round(mission.distance_nm)} NM{nearest?.available && (nearest.ferryNm ?? 0) > 0 ? <span className="ml-3 text-amber">Ferry · {Math.round(nearest.ferryNm ?? 0)} NM</span> : null}</p>
      </div>
      <div className="min-w-0 py-1">
        <p className="readout text-xs uppercase text-muted-foreground">Nearest fitting aircraft</p>
        {airports.isPending ? <p className="mt-3 text-sm text-muted-foreground">Checking fleet locations…</p> : !result.capable ? <p className="mt-3 text-sm text-destructive">No matching aircraft in your airline fleet.</p> : nearest ? <>
          <p className="mt-3 flex items-center gap-2 font-semibold"><Plane className="h-4 w-4 shrink-0 text-primary" />{nearest.aircraft.registration} · {nearest.aircraft.type?.model}</p>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />Parked at {nearest.aircraft.location_icao}</p>
          <p className={`readout mt-3 text-sm ${nearest.available ? nearest.ferryNm === 0 ? "text-primary" : "text-amber" : "text-destructive"}`}>{!nearest.available ? "Matching aircraft unavailable · busy, reserved or under maintenance" : nearest.ferryNm === null ? "Ferry distance unavailable" : nearest.ferryNm === 0 ? "Ready at origin · 0 NM ferry" : `Ferry: ${Math.round(nearest.ferryNm).toLocaleString()} NM${minutes !== null ? ` · Est. ${minutes} min airborne` : ""}`}</p>
          {result.incompleteLocations && <p className="mt-2 text-xs text-muted-foreground">Some aircraft locations are unavailable; nearest distance is not confirmed.</p>}
          {nearest.available && nearest.ferryNm !== null && nearest.ferryNm > 0 && <Button asChild size="sm" variant="outline" className="mt-4"><Link to="/dispatch" search={{ aircraft: nearest.aircraft.id, destination: mission.origin_icao }}><Navigation className="h-4 w-4" />Reposition via Dispatch</Link></Button>}
        </> : null}
        <p className="readout mt-4 text-xs text-muted-foreground">Board expires in {Math.floor(expires / 60)}h {String(expires % 60).padStart(2, "0")}m</p>
        {minutes !== null && minutes > 0 && minutes >= expires && <p className="mt-2 text-xs text-destructive">Estimated ferry time exceeds the remaining board time.</p>}
      </div>
    </div>
  );
}