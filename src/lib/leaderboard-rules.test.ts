import { describe, expect, it } from "vitest";
import { rankMovement } from "./leaderboard-rules";
describe("weekly leaderboard movement", () => {
  it("shows a green upward arrow from third to first", () => expect(rankMovement(1, 3)).toEqual({ label: "▲ 2", tone: "text-success" }));
  it("shows a red downward arrow from first to third", () => expect(rankMovement(3, 1)).toEqual({ label: "▼ 2", tone: "text-destructive" }));
  it("shows no change for equal ranks", () => expect(rankMovement(2, 2).label).toBe("—"));
  it("marks companies without last week's rank NEW", () => expect(rankMovement(1, null).label).toBe("NEW"));
});