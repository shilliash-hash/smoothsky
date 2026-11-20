import { LoaderCircle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { acquisitionDue, type AcquisitionMode } from '@/lib/market-rules';
import { formatCr } from '@/lib/rules';
import type { registrationRule } from '@/lib/registration-rules';

type Aircraft = { manufacturer: string; model: string; tier: number; weekly_rate: number; security_deposit: number; purchase_price: number };
export function AcquisitionConfirmation({ mode, aircraft, home, weeks, balance, registration, rule, busy, block, onRegistration, onClose, onConfirm }: {
  mode: AcquisitionMode; aircraft: Aircraft; home: string; weeks: number; balance: number; registration: string; rule: ReturnType<typeof registrationRule>; busy: boolean; block: string | null;
  onRegistration: (value: string) => void; onClose: () => void; onConfirm: () => void;
}) {
  const due = acquisitionDue(mode, aircraft);
  const rows: [string, string][] = [
    ['Delivery airport', home], ['Agreement', mode === 'lease' ? `Weekly Lease · ${weeks} weeks` : mode === 'rent' ? 'Spot Rental · 1 flight' : 'Outright Purchase'],
    ...(mode === 'lease' ? [['Weekly rate', formatCr(aircraft.weekly_rate)], ['Contract total (excl. deposit)', formatCr(aircraft.weekly_rate * weeks)]] as [string, string][] : []),
    ['Refundable deposit', formatCr(mode === 'lease' ? aircraft.security_deposit : 0)],
    ...(mode === 'rent' ? [['Weekly commitments', 'None'], ['Return', 'After completion or cancellation']] as [string, string][] : []),
  ];
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => { if (busy) e.preventDefault(); }}>
    <DialogTitle>{aircraft.manufacturer} {aircraft.model}</DialogTitle>
    <DialogDescription>Tier {aircraft.tier} · Acquisition review</DialogDescription>
    <dl className="readout space-y-3 border-y border-border py-4 text-sm">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="text-right">{value}</dd></div>)}</dl>
    <dl className="readout space-y-2"><div className="flex justify-between gap-4 font-semibold"><dt>Due now</dt><dd className="text-primary">{formatCr(due)}</dd></div><div className="flex justify-between gap-4 text-sm"><dt className="text-muted-foreground">Estimated balance after</dt><dd className={balance < due ? 'text-destructive' : 'text-foreground'}>{formatCr(balance - due)}</dd></div></dl>
    {mode === 'lease' ? <p className="readout text-xs text-muted-foreground">Registration assigned automatically · {rule.prefix}{rule.suffix_pattern}</p> : <label className="text-sm">Registration (optional)<Input aria-label="Aircraft registration" disabled={busy} className="mt-2 readout" placeholder={`${rule.prefix}${'A'.repeat(rule.suffix_length)}`} value={registration} onChange={e => onRegistration(e.target.value.toUpperCase())} /><span className="mt-2 block text-xs text-muted-foreground">{rule.prefix}{rule.suffix_pattern} · Leave empty for automatic assignment.</span></label>}
    <p className="flex gap-2 border-l-2 border-amber bg-amber/10 p-3 text-sm text-amber"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />This decision is final. Once signed, upfront payments and lease commitments cannot be cancelled for a refund.</p>
    {block && <p role="alert" className="text-sm text-destructive">{block}</p>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || block !== null} onClick={onConfirm}>{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}{busy ? 'Signing…' : 'Confirm & Sign'}</Button></div>
  </DialogContent></Dialog>;
}