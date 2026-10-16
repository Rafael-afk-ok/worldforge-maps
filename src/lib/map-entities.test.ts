import { describe, it, expect } from 'vitest';
import { locationPhotos, locationTotals, safeMediaUrl, youtubeEmbed } from './map-entities';
describe('entity data', () => {
  it('keeps legacy photos and removes duplicates', () => expect(locationPhotos({ photo: 'old', photos: ['old', 'new'] })).toEqual(['old', 'new']));
  it('sums every linked location metric without double counting other nations', () => {
    const cities = [{ nationId: 'a', npcs: 10, grossIncome: 30, expenses: 5, foodProduction: 8 }, { nationId: 'a', npcs: 20, grossIncome: 5, expenses: 10, foodConsumption: 4 }, { nationId: 'b', npcs: 999 }];
    expect(locationTotals(cities.filter(m => m.nationId === 'a'))).toEqual({ population: 30, income: 35, expenses: 15, foodProduction: 8, foodConsumption: 4, locations: 2 });
  });
  it('validates media and parses YouTube without accepting lookalike domains', () => {
    expect(youtubeEmbed('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(youtubeEmbed('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ')).toBeUndefined();
    expect(safeMediaUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeMediaUrl('https://user:pass@example.com/a.mp3')).toBeUndefined();
  });
});