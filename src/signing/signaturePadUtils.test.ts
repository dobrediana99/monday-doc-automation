import { describe, expect, it } from "vitest";
import { clientPointToCanvasCssPoint } from "./signaturePadUtils";

describe("clientPointToCanvasCssPoint", () => {
  it("maps point by subtracting bounding rect origin", () => {
    const rect = { left: 100, top: 50, width: 600, height: 220 };
    expect(clientPointToCanvasCssPoint({ clientX: 100, clientY: 50, rect })).toEqual({ x: 0, y: 0 });
    expect(clientPointToCanvasCssPoint({ clientX: 700, clientY: 270, rect })).toEqual({ x: 600, y: 220 });
  });

  it("preserves full drawable area in CSS pixels", () => {
    const rect = { left: 10, top: 20, width: 900, height: 220 };
    const mid = clientPointToCanvasCssPoint({ clientX: 10 + 450, clientY: 20 + 110, rect });
    expect(mid).toEqual({ x: 450, y: 110 });
  });
});

