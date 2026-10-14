import { describe, expect, it } from "vitest";
import { tilesToVectorAreas, vectorAreasToTiles } from "@/lib/vector-territories";

describe("vector territory conversion", () => {
  it("round-trips a rectangular country without changing cells", () => {
    const tiles = { "2,3": "north", "3,3": "north", "2,4": "north", "3,4": "north" };
    const areas = tilesToVectorAreas(tiles);
    expect(areas).toHaveLength(1);
    expect(areas[0]?.kind).toBe("nation");
    expect(vectorAreasToTiles(areas).tiles).toEqual(tiles);
  });

  it("preserves disconnected islands and diagonal contacts", () => {
    const tiles = { "1,1": "islands", "2,2": "islands" };
    const areas = tilesToVectorAreas(tiles);
    expect(areas[0]?.rings).toHaveLength(2);
    expect(vectorAreasToTiles(areas).tiles).toEqual(tiles);
  });

  it("preserves holes and separate region geometry", () => {
    const tiles: Record<string, string> = {};
    for (let y = 10; y < 13; y++) for (let x = 10; x < 13; x++) {
      if (x !== 11 || y !== 11) tiles[`${x},${y}`] = "nation-a";
    }
    const regionTiles = { "10,10": "region-a", "10,11": "region-a" };
    const areas = tilesToVectorAreas(tiles, regionTiles);
    const restored = vectorAreasToTiles(areas);
    expect(restored.tiles).toEqual(tiles);
    expect(restored.regionTiles).toEqual(regionTiles);
  });

  it("ignores malformed vector entries rather than throwing", () => {
    expect(() => vectorAreasToTiles([null, { id: "x", kind: "nation", rings: null }] as never)).not.toThrow();
  });
});
