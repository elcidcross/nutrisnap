jest.mock('./supabase', () => ({ supabase: { auth: { getSession: jest.fn(), signOut: jest.fn() } } }));

const { parseJson } = require('./api');

describe('parseJson', () => {
  test('recovers from `{[...]` corruption (prefill + array response)', () => {
    const raw = '{[ { "name": "rice bowl", "components": [{"name":"rice","amount":200,"unit":"g"}], "amount": 380, "unit": "g", "calories": 520, "protein": 18, "carbs": 70, "fat": 12, "fiber": 4 } ]';
    expect(parseJson(raw)).toEqual({
      name: 'rice bowl',
      components: [{ name: 'rice', amount: 200, unit: 'g' }],
      amount: 380, unit: 'g',
      calories: 520, protein: 18, carbs: 70, fat: 12, fiber: 4,
    });
  });

  test('parses a normal multi-component analysis response', () => {
    const raw = '{"name":"chicken rice bowl","components":[{"name":"rice","amount":200,"unit":"g"},{"name":"chicken thigh","amount":120,"unit":"g"}],"amount":320,"unit":"g","calories":600,"protein":35,"carbs":68,"fat":18,"fiber":2}';
    expect(parseJson(raw)).toEqual({
      name: 'chicken rice bowl',
      components: [
        { name: 'rice', amount: 200, unit: 'g' },
        { name: 'chicken thigh', amount: 120, unit: 'g' },
      ],
      amount: 320, unit: 'g',
      calories: 600, protein: 35, carbs: 68, fat: 18, fiber: 2,
    });
  });

  test('unwraps a single-element array response', () => {
    const raw = '[{"name":"banana","amount":120,"unit":"g","calories":107,"protein":1.3,"carbs":27,"fat":0.4,"fiber":3}]';
    expect(parseJson(raw)).toEqual({
      name: 'banana', amount: 120, unit: 'g',
      calories: 107, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3,
    });
  });

  test('normalizes single quotes to double quotes', () => {
    const raw = "{'name':'pear','amount':100,'unit':'g','calories':57,'protein':0.4,'carbs':15,'fat':0.1,'fiber':3.1}";
    expect(parseJson(raw)).toEqual({
      name: 'pear', amount: 100, unit: 'g',
      calories: 57, protein: 0.4, carbs: 15, fat: 0.1, fiber: 3.1,
    });
  });

  test('repairs a response truncated inside the components array', () => {
    // Real failure: a multi-component meal cut off mid-array. The repair must
    // close the open `[` and `{`, not just emit curly braces.
    const raw = '{ "name": "Basil-scented Gapao Rice with Fried Egg", "components": [ { "name": "Cooked White Rice", "amount": 214, "unit": "g" }, { "name": "Minced Chicken Stir';
    expect(parseJson(raw)).toEqual({
      name: 'Basil-scented Gapao Rice with Fried Egg',
      components: [{ name: 'Cooked White Rice', amount: 214, unit: 'g' }],
    });
  });

  test('throws on an unparseable response', () => {
    expect(() => parseJson('not json at all')).toThrow(/AI returned unexpected response/);
  });
});
