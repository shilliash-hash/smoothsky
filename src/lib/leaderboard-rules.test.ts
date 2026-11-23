import { describe, expect, it } from "vitest";
import { dossierBases, rankMovement } from "./leaderboard-rules";
describe("weekly leaderboard movement", () => {
  it("shows a green upward arrow from third to first", () => expect(rankMovement(1, 3)).toEqual({ label: "▲ 2", tone: "text-success" }));
  it("shows a red downward arrow from first to third", () => expect(rankMovement(3, 1)).toEqual({ label: "▼ 2", tone: "text-destructive" }));
  it("shows no change for equal ranks", () => expect(rankMovement(2, 2).label).toBe("—"));
  it("marks companies without last week's rank NEW", () => expect(rankMovement(1, null).label).toBe("NEW"));
});

describe("public dossier bases", () => {
  it("merges the main-hub FBO and retains its purchased capabilities", () => {
    const result = dossierBases("ENVA", [{ icao: "ENVA", handling: false, fuel: true, maintenance: true }]);
    expect(result.hubBase).toEqual({ icao: "ENVA", handling: true, fuel: true, maintenance: true });
    expect(result.satellites).toEqual([]);
  });
  it("includes handling at each active satellite without the legacy desk flag", () => {
    const result = dossierBases("ENVA", [{ icao: "EPGD", handling: false, fuel: false }]);
    expect(result.satellites).toEqual([{ icao: "EPGD", handling: true, fuel: false }]);
  });
  it("does not invent an FBO or handling capability at an unbuilt home airport", () => {
    expect(dossierBases("ENVA", []).hubBase).toBeUndefined();
  });
  it("matches ICAO codes irrespective of case and surrounding whitespace", () => {
    const result = dossierBases("enva", [{ icao: " ENVA ", handling: false }]);
    expect(result.hubBase?.handling).toBe(true);
    expect(result.satellites).toHaveLength(0);
  });
});