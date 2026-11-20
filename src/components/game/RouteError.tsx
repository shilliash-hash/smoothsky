import { displayTerminology } from "@/lib/display-terminology";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** Keeps a failed data load contained to the page with a retry, instead of crashing the app. */
export function RouteError({ error }: { error: unknown }) {
  const router = useRouter();
  return (
    <div role="alert" className="mx-auto mt-16 max-w-lg instrument p-6 text-center">
      <p className="readout text-xs uppercase text-amber">Data link interrupted</p>
      <p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? displayTerminology(error.message) : "Could not load this page."}</p>
      <Button className="mt-4" onClick={() => router.invalidate()}>Retry</Button>
    </div>
  );
}
