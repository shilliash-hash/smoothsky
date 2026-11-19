export const STARTING_CAPITAL = 50_000;
export const MAX_LEASES = 3;

export function normalizeCompanyCode(input: string) {
  return input.trim().toUpperCase();
}

export function isValidCompanyCode(input: string) {
  return /^[A-Z]{3}$/.test(normalizeCompanyCode(input));
}

export function leaseUpfrontCost(t: { security_deposit: number; weekly_rate: number }) {
  return Number(t.security_deposit) + Number(t.weekly_rate);
}

export function canAffordLease(balance: number, t: { security_deposit: number; weekly_rate: number }) {
  return balance >= leaseUpfrontCost(t);
}

export function formatCr(n: number | string) {
  return `${Number(n).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} Cr`;
}
