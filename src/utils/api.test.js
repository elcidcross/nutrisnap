jest.mock('./supabase', () => ({ supabase: { auth: { getSession: jest.fn(), signOut: jest.fn() } } }));

const { parseJson } = require('./api');

describe('parseJson', () => {
  test('recovers from `{[...]` corruption (prefill + array response)', () => {
    const raw = '{[ { "name": "rice bowl with natto, okra, and shirasu", "amount": 380, "unit": "g", "ref_amount": 100, "ref_unit": "g" } ]';
    expect(parseJson(raw)).toEqual({
      name: 'rice bowl with natto, okra, and shirasu',
      amount: 380,
      unit: 'g',
      ref_amount: 100,
      ref_unit: 'g',
    });
  });

  test('parses a normal object response', () => {
    const raw = '{"name":"apple","amount":150,"unit":"g","ref_amount":100,"ref_unit":"g"}';
    expect(parseJson(raw)).toEqual({
      name: 'apple', amount: 150, unit: 'g', ref_amount: 100, ref_unit: 'g',
    });
  });

  test('unwraps a single-element array response', () => {
    const raw = '[{"name":"banana","amount":120,"unit":"g"}]';
    expect(parseJson(raw)).toEqual({ name: 'banana', amount: 120, unit: 'g' });
  });

  test('parses a Phase 2 macros response', () => {
    const raw = '{"calories":57,"protein":0.7,"carbs":14.5,"fat":0.3,"fiber":2.4}';
    expect(parseJson(raw)).toEqual({
      calories: 57, protein: 0.7, carbs: 14.5, fat: 0.3, fiber: 2.4,
    });
  });

  test('normalizes single quotes to double quotes', () => {
    const raw = "{'name':'pear','amount':100,'unit':'g'}";
    expect(parseJson(raw)).toEqual({ name: 'pear', amount: 100, unit: 'g' });
  });

  test('throws on an unparseable response', () => {
    expect(() => parseJson('not json at all')).toThrow(/AI returned unexpected response/);
  });
});
