import { describe, expect, it } from 'vitest';
import { cellsPath, expandTiles, strokeCells, territoryPath } from './map-tools';

describe('map painting', () => {
  it('renders the exact brush cells without offset or diagonal extras', () => {
    const cells = strokeCells([4.9, 4.9], [4.9, 4.9], 1);
    expect(cells.has('5,5')).toBe(false);
    expect(cellsPath(cells).match(/M/g)?.length).toBe(5);
    expect(cellsPath(['4,4'])).toBe('M8,8h2v2h-2Z');
  });
  it('fills every cell during a fast stroke', () => {
    const cells = strokeCells([1.5, 2.5], [12.5, 2.5], 0);
    for (let x = 1; x <= 12; x++) expect(cells.has(`${x},2`)).toBe(true);
  });
  it('clips round brushes to the map', () => {
    expect([...strokeCells([0, 0], [0, 0], 2)].every(k => k.split(',').every(v => Number(v) >= 0))).toBe(true);
    expect(strokeCells([4, 4], [4, 4], 1).size).toBe(5);
  });
  it('merges adjacent cells into one smooth outline', () => {
    const path = territoryPath(['0,0', '1,0'], true);
    expect(path.match(/M/g)?.length).toBe(1);
    expect(path).toContain('Q');
    expect(path.endsWith('Z')).toBe(true);
  });
  it('preserves disconnected islands and square mode', () => {
    expect(territoryPath(['0,0', '4,4'], true).match(/M/g)?.length).toBe(2);
    expect(territoryPath(['0,0'], false)).not.toContain('Q');
    expect(territoryPath([], true)).toBe('');
  });
  it('upgrades old large tiles to the finer grid', () => {
    expect(expandTiles({ '1,2': 'a' }, 2)).toEqual({ '2,4': 'a', '3,4': 'a', '2,5': 'a', '3,5': 'a' });
  });
});
