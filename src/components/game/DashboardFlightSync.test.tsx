import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardFlightSync } from "./DashboardFlightSync";

const mocks = vi.hoisted(() => ({ notify: vi.fn(), readBoard: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.notify } }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/lib/game", () => ({ operationalBoardQuery: (companyId: string) => ({ queryKey: ["operational-board", companyId], queryFn: mocks.readBoard, refetchInterval: 15000 }) }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("external ACARS settlement cache refresh", () => {
  it("updates returned rental and authoritative balance without reloading, announces arrival once", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const flight = { id: "continuation", status: "EN_ROUTE", flight_number: "QA101", destination_icao: "EPWA" };
    let arrived = false;
    mocks.readBoard.mockImplementation(async () => arrived ? { active: [], recent: [{ ...flight, status: "COMPLETED" }] } : { active: [flight], recent: [] });
    function Observers() {
      useQuery({ queryKey: ["fleet", "test"], queryFn: async () => arrived ? [] : [{ id: "rental", status: "EN_ROUTE" }] });
      useQuery({ queryKey: ["bases"], queryFn: async () => ({ health: { balance: arrived ? 1099.82 : 1000 } }) });
      useQuery({ queryKey: ["transaction-history", "test", "rental"], queryFn: async () => arrived ? [{ amount: 99.82 }] : [] });
      return <DashboardFlightSync companyId="test" />;
    }
    render(<QueryClientProvider client={qc}><Observers /></QueryClientProvider>);
    await waitFor(() => expect(qc.getQueryData(["fleet", "test"])).toEqual([{ id: "rental", status: "EN_ROUTE" }]));
    await act(async () => { arrived = true; await qc.invalidateQueries({ queryKey: ["operational-board", "test"] }); });
    await waitFor(() => {
      expect(qc.getQueryData(["fleet", "test"])).toEqual([]);
      expect(qc.getQueryData(["bases"])).toEqual({ health: { balance: 1099.82 } });
      expect(qc.getQueryData(["transaction-history", "test", "rental"])).toEqual([{ amount: 99.82 }]);
      expect(mocks.notify).toHaveBeenCalledTimes(1);
    });
    await act(async () => { await qc.invalidateQueries({ queryKey: ["operational-board", "test"] }); });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    qc.clear();
  });
});