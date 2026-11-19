import { queryOptions } from '@tanstack/react-query';
import { getOperations } from './operations.functions';
export const operationsQuery=queryOptions({queryKey:['operations'],queryFn:()=>getOperations(),staleTime:15000,refetchInterval:15000});
export type Operations=Awaited<ReturnType<typeof getOperations>>;
export type Airport=Operations['airports'][number];
export type Flight=Operations['flights'][number];
export type Quote={distance_nm:number;minutes:number;passengers:number;revenue:number;fuel_gal:number;fuel_cost:number;landing_fee:number;handling_fee:number;maintenance:number;net:number};
