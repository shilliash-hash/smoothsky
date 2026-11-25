import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Building2, LoaderCircle, MapPin, Radio, ShieldAlert } from 'lucide-react';
import { getSpotDeliveryOptions, type SpotDeliveryOption } from '@/lib/fleet.functions';
import { InfoHint } from './InfoHint';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { acquisitionDue, type AcquisitionMode } from '@/lib/market-rules';
import { formatCr } from '@/lib/rules';
import type { registrationRule } from '@/lib/registration-rules';

type Aircraft = { id: string; manufacturer: string; model: string; tier: number; weekly_rate: number; security_deposit: number; purchase_price: number };
export function AcquisitionConfirmation({ mode, aircraft, rentalMultiplier, home, weeks, balance, registration, rule, busy, block, onRegistration, onClose, onConfirm, delivery, onDelivery }: {
  delivery?: SpotDeliveryOption | null; onDelivery?: (value: SpotDeliveryOption) => void;
  mode: AcquisitionMode; aircraft: Aircraft; rentalMultiplier?: number; home: string; weeks: number; balance: number; registration: string; rule: ReturnType<typeof registrationRule>; busy: boolean; block: string | null;
  onRegistration: (value: string) => void; onClose: () => void; onConfirm: () => void;
}) {
  const baseDue = acquisitionDue(mode, aircraft, rentalMultiplier);
  const fee = mode === 'rent' && delivery ? Math.round(baseDue * delivery.fee_pct * 100) / 100 : 0;
  const due = baseDue + fee;
  const deliveryAt = mode === 'rent' && delivery ? delivery.icao : home;
  const shownBlock = block ?? (mode === 'rent' && balance < due ? 'Insufficient funds' : null);
  const rows: [string, string][] = [
    ['Delivery airport', deliveryAt], ['Agreement', mode === 'lease' ? `Weekly Lease · ${weeks} weeks` : mode === 'rent' ? 'Spot Rental · 1 flight' : 'Outright Purchase'],
    ...(mode === 'lease' ? [['Weekly rate', formatCr(aircraft.weekly_rate)], ['Contract total (excl. deposit)', formatCr(aircraft.weekly_rate * weeks)]] as [string, string][] : []),
    ['Refundable deposit', formatCr(mode === 'lease' ? aircraft.security_deposit : 0)],
    ...(mode === 'rent' ? [['Weekly commitments', 'None'], ['Return', 'After completion or cancellation'], ['Base rental fee', formatCr(baseDue)], ['Positioning fee', fee > 0 && delivery ? `+${Math.round(delivery.fee_pct * 100)}% · ${formatCr(fee)} · ${Math.round(delivery.distance_nm)} NM from ${delivery.anchor_icao}` : 'Free']] as [string, string][] : []),
  ];
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => { if (busy) e.preventDefault(); }}>
    <DialogTitle>{aircraft.manufacturer} {aircraft.model}</DialogTitle>
    <DialogDescription>Tier {aircraft.tier} · Acquisition review</DialogDescription>
    {mode === 'rent' && onDelivery && <DeliveryPicker type={aircraft.id} home={home} value={delivery ?? null} disabled={busy} onChange={onDelivery} />}
    <dl className="readout space-y-3 border-y border-border py-4 text-sm">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="text-right">{value}</dd></div>)}</dl>
    <dl className="readout space-y-2"><div className="flex justify-between gap-4 font-semibold"><dt>{mode === 'rent' ? 'Total due now' : 'Due now'}</dt><dd className="text-primary">{formatCr(due)}</dd></div><div className="flex justify-between gap-4 text-sm"><dt className="text-muted-foreground">Estimated balance after</dt><dd className={balance < due ? 'text-destructive' : 'text-foreground'}>{formatCr(balance - due)}</dd></div></dl>
    {mode === 'lease' ? <p className="readout text-xs text-muted-foreground">Registration assigned automatically · {rule.prefix}{rule.suffix_pattern}</p> : <label className="text-sm">Registration (optional)<Input aria-label="Aircraft registration" disabled={busy} className="mt-2 readout" placeholder={`${rule.prefix}${'A'.repeat(rule.suffix_length)}`} value={registration} onChange={e => onRegistration(e.target.value.toUpperCase())} /><span className="mt-2 block text-xs text-muted-foreground">{rule.prefix}{rule.suffix_pattern} · Leave empty for automatic assignment.</span></label>}
    <p className="flex gap-2 border-l-2 border-amber bg-amber/10 p-3 text-sm text-amber"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />This decision is final. Once signed, upfront payments and lease commitments cannot be cancelled for a refund.</p>
    {shownBlock && <p role="alert" className="text-sm text-destructive">{shownBlock}</p>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || shownBlock !== null || (mode === 'rent' && !!onDelivery && (!delivery || !delivery.runway_ok))} onClick={onConfirm}>{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}{busy ? 'Signing…' : 'Confirm & Sign'}</Button></div>
  </DialogContent></Dialog>;
}
const zoneLabel = (o: SpotDeliveryOption) => o.zone === 'MAIN' ? 'Main Hub' : o.zone === 'SATELLITE' ? 'Satellite FBO' : `+${Math.round(o.fee_pct * 100)}% · ${Math.round(o.distance_nm)} NM from ${o.anchor_icao}`;

function DeliveryPicker({ type, home, value, disabled, onChange }: { type: string; home: string; value: SpotDeliveryOption | null; disabled: boolean; onChange: (v: SpotDeliveryOption) => void }) {
  const fetchOptions = useServerFn(getSpotDeliveryOptions);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(query.trim()), 250); return () => clearTimeout(t); }, [query]);
  const bases = useQuery({ queryKey: ['spot-delivery', type, ''], queryFn: () => fetchOptions({ data: { type, query: '' } }), staleTime: 60_000 });
  const search = useQuery({ queryKey: ['spot-delivery', type, debounced], queryFn: () => fetchOptions({ data: { type, query: debounced } }), enabled: debounced.length >= 2, staleTime: 60_000 });
  const baseList = (bases.data ?? []).filter(o => o.zone !== 'EXTENDED').sort((a, b) => (a.zone === 'MAIN' ? -1 : 0) - (b.zone === 'MAIN' ? -1 : 0));
  useEffect(() => { if (!value) { const main = baseList.find(o => o.zone === 'MAIN') ?? baseList[0]; if (main) onChange(main); } }, [value, baseList, onChange]);
  const results = (debounced.length >= 2 ? search.data ?? [] : (bases.data ?? []).filter(o => o.zone === 'EXTENDED').slice(0, 8));
  return <section className="space-y-3 border-t border-border pt-4" aria-label="Delivery airport">
    <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><MapPin className="h-3.5 w-3.5" />Delivery airport<InfoHint label="Delivery zones">Free delivery to your Main Hub and every active Satellite FBO. Any airport within 100 NM of the Main Hub or 60 NM of a Satellite FBO costs +10% positioning fee, if its runway suits this aircraft. Farther airports are not available.</InfoHint></div>
    <div className="flex flex-wrap gap-2">{bases.isLoading && <span className="text-xs text-muted-foreground">Loading bases…</span>}
      {baseList.map(o => <button key={o.icao} type="button" disabled={disabled} onClick={() => onChange(o)} aria-pressed={value?.icao === o.icao} className={`readout inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs transition-colors ${value?.icao === o.icao ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:border-primary/60'}`}>{o.zone === 'MAIN' ? <Building2 className="h-3 w-3" /> : <Radio className="h-3 w-3" />}{o.icao} · {zoneLabel(o)} · <span className="text-primary">Free</span></button>)}
      {!bases.isLoading && baseList.length === 0 && <span className="readout text-xs text-muted-foreground">{home} · Main Hub · Free</span>}
    </div>
    <Input aria-label="Search delivery airport" disabled={disabled} className="readout" placeholder="Search ICAO / city within zone…" value={query} onChange={e => setQuery(e.target.value)} />
    <ul className="max-h-40 space-y-1 overflow-y-auto">{results.filter(o => o.zone === 'EXTENDED' || debounced.length >= 2).map(o => <li key={o.icao}><button type="button" disabled={disabled || !o.runway_ok} onClick={() => onChange(o)} className={`readout flex w-full items-center justify-between gap-2 rounded-sm border px-2 py-1.5 text-left text-xs ${value?.icao === o.icao ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/60'} disabled:opacity-50`}><span className="truncate">{o.icao} · {o.name}{o.city ? ` · ${o.city}` : ''}</span><span className={o.runway_ok ? (o.fee_pct > 0 ? 'shrink-0 text-amber' : 'shrink-0 text-primary') : 'shrink-0 text-destructive'}>{o.runway_ok ? (o.fee_pct > 0 ? zoneLabel(o) : 'Free') : `Runway too short (${o.longest_runway_ft?.toLocaleString()} ft)`}</span></button></li>)}
      {debounced.length >= 2 && search.data?.length === 0 && <li className="text-xs text-destructive">No airport in delivery zone — max 100 NM from Main Hub or 60 NM from a Satellite FBO.</li>}
    </ul>
  </section>;
}
