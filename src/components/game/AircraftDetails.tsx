import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { toast } from 'sonner';
import { aircraftFinanceQuery } from '@/lib/fleet';
import { leaseAction } from '@/lib/fleet.functions';
import { aircraftProfit, renewalRate } from '@/lib/fleet-rules';
import { formatCr } from '@/lib/rules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export function AircraftDetails({ aircraft, registration, renewalDiscount, baseRate, onClose }: { aircraft: string; registration: string; renewalDiscount: number; baseRate: number; onClose: () => void }) {
  const { data: f, isPending, error } = useQuery(aircraftFinanceQuery(aircraft));
  const qc = useQueryClient();
  const action = useServerFn(leaseAction);
  const [weeks, setWeeks] = useState(4);
  const [busy, setBusy] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);
  async function manage(kind: 'renew' | 'return') {
    setBusy(true);
    try {
      await action({ data: { action: kind, aircraft, weeks } });
      await qc.invalidateQueries();
      toast.success(kind === 'renew' ? 'Lease renewed' : 'Aircraft returned — deposit refunded');
      setConfirmReturn(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Lease action failed'); }
    finally { setBusy(false); }
  }
  const operating = f ? Number(f.fuel) + Number(f.airport) + Number(f.handling) + Number(f.maintenance) : 0;
  const profit = f ? aircraftProfit(Number(f.revenue), operating, Number(f.lease_accrued)) : 0;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogTitle>{registration}</DialogTitle>
      <DialogDescription>Aircraft financial performance & lease</DialogDescription>
      {isPending && <p>Loading aircraft accounts…</p>}
      {error && <p role="alert" className="text-destructive">{error.message}</p>}
      {f && <>
        <p className="text-sm text-muted-foreground">{f.flights} completed flights · Lifetime totals</p>
        <dl className="readout space-y-2 text-sm">
          {[["Ticket revenue", f.revenue], ["Fuel", -Number(f.fuel)], ["Airport fees", -Number(f.airport)], ["Handling", -Number(f.handling)], ["Maintenance reserve", -Number(f.maintenance)], ["Lease expense accrued", -Number(f.lease_accrued)], ["Total costs accrued", -(operating + Number(f.lease_accrued))]].map(([label, value]) => <div key={String(label)} className="flex justify-between gap-4"><dt>{label}</dt><dd className="shrink-0">{formatCr(Number(value))}</dd></div>)}
          <div className="flex justify-between gap-4 border-t border-border pt-3 font-semibold"><dt>Net profit / loss</dt><dd className={profit >= 0 ? 'text-primary' : 'text-destructive'}>{formatCr(profit)}</dd></div>
        </dl>
        <dl className="readout grid grid-cols-2 gap-2 border-t border-border pt-4 text-xs">
          <dt>Daily lease allocation</dt><dd className="text-right">{formatCr(Number(f.daily_lease))} / day</dd>
          <dt>Lease payments posted</dt><dd className="text-right">{formatCr(Number(f.lease_paid))}</dd>
          <dt>Cash result (excl. deposit)</dt><dd className="text-right">{formatCr(Number(f.revenue) - operating - Number(f.lease_paid))}</dd>
          <dt>{f.returned_at ? 'Deposit refunded' : 'Refundable deposit held'}</dt><dd className="text-right">{formatCr(Number(f.deposit))}</dd>
          <dt>Contract term</dt><dd className="text-right">{f.term_weeks} weeks</dd>
          <dt>Contract ends</dt><dd className="text-right">{new Date(f.ends_at).toLocaleString('en-US')}</dd>
        </dl>
        {f.returned_at ? <p className="text-muted-foreground">Aircraft returned</p> : Date.now() >= Date.parse(f.ends_at) ? <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm text-amber">Contract expired · Dispatch suspended</p>
          <label className="flex items-center justify-between gap-4 text-sm">Renewal term (weeks)<Input aria-label="Renewal term (weeks)" type="number" min={1} max={52} step={1} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="w-24" /></label>
          <p className="readout text-xs">Renewal: {formatCr(renewalRate(baseRate, renewalDiscount))} / week · {(renewalDiscount * 100).toFixed(0)}% discount</p>
          <Button disabled={busy || !Number.isInteger(weeks) || weeks < 1 || weeks > 52} onClick={() => manage('renew')} className="w-full">Renew lease</Button>
          {confirmReturn ? <div className="space-y-2"><p className="text-sm">Return this aircraft and release {formatCr(Number(f.deposit))}?</p><div className="flex gap-2"><Button variant="destructive" disabled={busy} onClick={() => manage('return')}>Confirm return</Button><Button variant="outline" onClick={() => setConfirmReturn(false)}>Keep aircraft</Button></div></div> : <Button variant="outline" disabled={busy} onClick={() => setConfirmReturn(true)} className="w-full">Return aircraft & recover deposit</Button>}
        </div> : <p className="text-xs text-muted-foreground">Weekly rate: {formatCr(Number(f.weekly_rate))} · Return or renew available at expiry</p>}
      </>}
    </DialogContent>
  </Dialog>;
}
