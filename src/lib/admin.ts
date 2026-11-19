import { queryOptions } from "@tanstack/react-query";
import { getAdminAccess, getAdminData } from "./admin.functions";
export const adminAccessQuery = queryOptions({
  queryKey: ["admin-access"],
  queryFn: () => getAdminAccess(),
  staleTime: 60000,
});
export const adminDataQuery = queryOptions({
  queryKey: ["admin-data"],
  queryFn: () => getAdminData(),
  staleTime: 0,
});
