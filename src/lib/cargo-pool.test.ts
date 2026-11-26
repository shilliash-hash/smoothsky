import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { cargoPoolPlaceholder, cargoPoolQuery, type CargoPool } from "./cargo-pool";

const pool: CargoPool = { stock: 1234, capacity: 5000 };

describe("airport cargo pool cache", () => {
  it("keeps the same airport's previous data while it refetches", () => {
    expect(cargoPoolPlaceholder("EPGD", pool, "EPGD")).toEqual(pool);
  });

  it("never shows the previous airport's stock for a newly selected airport", () => {
    expect(cargoPoolPlaceholder("EPWA", pool, "EPGD")).toBeUndefined();
  });

  it("reads cached cargo without issuing another request during radar redraws", async () => {
    const client = new QueryClient();
    const options = cargoPoolQuery("EPGD");
    client.setQueryData(options.queryKey, pool);
    const queryFn = () => Promise.reject(new Error("must not fetch"));
    await expect(client.fetchQuery({ ...options, queryFn })).resolves.toEqual(pool);
    client.clear();
  });
});
