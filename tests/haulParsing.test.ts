import { describe, it, expect } from 'vitest';
import { parseNaturalLanguageHaul } from '../src/server/api/app';

describe('Smart Restock & Haul Natural Language Parser', () => {
  it('should parse "brought in a 6 pack of dr pepper bottles"', () => {
    const input = "brought in a 6 pack of dr pepper bottles";
    const result = parseNaturalLanguageHaul(input);

    expect(result.items.length).toBe(1);
    expect(result.items[0].quantity).toBe(6);
    expect(result.items[0].name.toLowerCase()).toContain('dr pepper');
    expect(result.items[0].category).toBe('Beverages');
  });

  it('should parse "brought in a 6 pack of dr pepper bottles for $6.50"', () => {
    const input = "brought in a 6 pack of dr pepper bottles for $6.50";
    const result = parseNaturalLanguageHaul(input);

    expect(result.items.length).toBe(1);
    expect(result.items[0].quantity).toBe(6);
    expect(result.items[0].name.toLowerCase()).toContain('dr pepper');
    expect(result.items[0].category).toBe('Beverages');
    expect(result.totalAmount).toBe(6.50);
    expect(result.items[0].costPerUnit).toBe(1.08);
  });

  it('should parse multi-item grocery hauls with store name', () => {
    const input = "Spent $32 at Trader Joe's on 12 cans cold brew ($12), 2 bags chips ($8), and 6 boxes LaCroix ($12)";
    const result = parseNaturalLanguageHaul(input);

    expect(result.storeName).toBe("Trader Joe's");
    expect(result.items.length).toBe(3);

    const coldBrew = result.items.find(i => i.name.toLowerCase().includes('cold brew'));
    expect(coldBrew).toBeDefined();
    expect(coldBrew?.quantity).toBe(12);
    expect(coldBrew?.category).toBe('Coffee & Tea');
    expect(coldBrew?.totalCost).toBe(12);

    const chips = result.items.find(i => i.name.toLowerCase().includes('chips'));
    expect(chips).toBeDefined();
    expect(chips?.quantity).toBe(2);
    expect(chips?.category).toBe('Snacks');

    const lacroix = result.items.find(i => i.name.toLowerCase().includes('lacroix'));
    expect(lacroix).toBeDefined();
    expect(lacroix?.quantity).toBe(6);
    expect(lacroix?.category).toBe('Beverages');
  });

  it('should verify universal natural language haul parser is deterministic', () => {
    const input = "brought in a 6 pack of dr pepper bottles";
    const result1 = parseNaturalLanguageHaul(input);
    const result2 = parseNaturalLanguageHaul(input);

    expect(result1).toEqual(result2);
  });
});
