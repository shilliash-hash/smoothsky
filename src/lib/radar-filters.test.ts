import { it, expect } from "vitest";
import { airportMatches } from "./radar-filters";
const a = { classification_source: "provisional", name: "Airfield", runway_surface: "GRS", size: 1 };
it("grass strips can be shown independently", () => expect(airportMatches(a, ["Grass strips"], [1])).toBe(true));
it("military selection hides civilian grass strips", () => expect(airportMatches(a, ["Military"], [1])).toBe(false));
it("tier filter intersects category selection", () => expect(airportMatches(a, ["Civilian", "Grass strips"], [7])).toBe(false));
it("all categories include military airports", () => expect(airportMatches({ ...a, classification_source: "military" }, ["Military", "Civilian", "Grass strips"], [1])).toBe(true));