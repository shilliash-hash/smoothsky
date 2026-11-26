import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { flightAction } from "@/lib/operations.functions";
import { displayTerminology } from "@/lib/display-terminology";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function RecallFlightButton({ flightId, flightNumber, originIcao, className }: {
  flightId: string;
  flightNumber: string | null;
  originIcao: string;
  className?: string;
}) {
  const action = useServerFn(flightAction);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function recall() {
    setBusy(true);
    try {
      await action({ data: { action: "cancel", flight: flightId } });
      setOpen(false);
      await qc.invalidateQueries();
      toast.success(`${flightNumber ?? "Flight"} recalled — aircraft released at ${originIcao}`);
    } catch (error) {
      toast.error(error instanceof Error ? displayTerminology(error.message) : "Recall failed");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Button type="button" size="sm" variant="outline" className={className} disabled={busy} onClick={() => setOpen(true)}>
      <RotateCcw className="h-3.5 w-3.5" />Recall aircraft
    </Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent>
        <DialogTitle>Recall {flightNumber ?? "this flight"}?</DialogTitle>
        <DialogDescription>
          This is an emergency cancellation. No revenue is paid, the aircraft returns to {originIcao}, reserved fuel is refunded under the normal cancellation rules, and a Spot Rental is returned.
        </DialogDescription>
        <div className="flex justify-end gap-3">
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Keep flight</Button>
          <Button variant="destructive" disabled={busy} onClick={() => void recall()}><RotateCcw className="h-4 w-4" />{busy ? "Recalling…" : "Confirm recall"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
