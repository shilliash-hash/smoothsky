import { queryOptions } from '@tanstack/react-query';
import { getFinancialReport } from './finances.functions';
import type { Period } from './finances';
export const financialReportQuery = (companyId: string, period: Period) => queryOptions({ queryKey: ['financial-report', companyId, period], queryFn: () => getFinancialReport({ data: { period } }), staleTime: 30_000, refetchInterval: 60_000 });
