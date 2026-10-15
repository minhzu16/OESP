import { parseCsvQuestions, parseJson, parseText } from './import-parsers';
import { contentHash } from './question-input';

describe('parseText', () => {
  it('parses starred answers, ANSWER lines and infers types', () => {
    const r = parseText(
      [
        'What is 2+2?',
        'A. 3',
        '*B. 4',
        '',
        'Select even numbers',
        'A) 1',
        'B) 2',
        'C) 4',
        'Answer: B, C',
        '',
        'The earth is round',
        '*True',
        'False',
      ].join('\r\n'),
    );
    expect(r.errors).toEqual([]);
    expect(r.questions.map((q) => q.input.type)).toEqual(['SINGLE', 'MULTIPLE', 'TRUE_FALSE']);
    expect(r.questions[0].input.options).toEqual([
      { content: '3', isCorrect: false },
      { content: '4', isCorrect: true },
    ]);
    expect(r.questions[1].input.options.filter((o) => o.isCorrect).map((o) => o.content)).toEqual(['2', '4']);
  });

  it('reports blocks without a correct answer', () => {
    const r = parseText('Q?\nA. x\nB. y');
    expect(r.questions).toHaveLength(0);
    expect(r.errors[0]).toMatchObject({ item: 1 });
  });
});

describe('parseCsvQuestions', () => {
  it('reads letters, multi-answers, tags and quoted fields', () => {
    const csv = [
      'content,type,difficulty,tags,marks,A,B,C,correct',
      '"Capital of ""France""?",,2,geo;europe,1,Paris,Rome,Berlin,A',
      'Primes,MULTIPLE,3,,2,2,3,4,A;B',
    ].join('\n');
    const r = parseCsvQuestions(csv);
    expect(r.errors).toEqual([]);
    expect(r.questions[0].input).toMatchObject({
      content: 'Capital of "France"?',
      type: 'SINGLE',
      difficulty: 2,
      tags: ['geo', 'europe'],
    });
    expect(r.questions[1].input).toMatchObject({ type: 'MULTIPLE', marks: 2 });
  });

  it('requires the mandatory columns', () => {
    expect(parseCsvQuestions('foo,bar\n1,2').errors[0].item).toBe(0);
  });
});

describe('parseJson', () => {
  it('accepts an array or {questions: []}', () => {
    const item = { content: 'Q', options: [{ content: 'a', isCorrect: true }, { content: 'b', isCorrect: false }] };
    expect(parseJson(JSON.stringify([item])).questions).toHaveLength(1);
    expect(parseJson(JSON.stringify({ questions: [item] })).questions).toHaveLength(1);
    expect(parseJson('{oops').errors[0].message).toMatch(/Invalid JSON/);
  });
});

describe('contentHash', () => {
  it('ignores case, accents, punctuation and option order', () => {
    const a = contentHash({
      content: 'Thủ đô của Pháp?',
      options: [
        { content: 'Paris', isCorrect: true },
        { content: 'Rome', isCorrect: false },
      ],
    });
    const b = contentHash({
      content: '  thu do cua phap ',
      options: [
        { content: 'rome', isCorrect: true },
        { content: 'PARIS!', isCorrect: false },
      ],
    });
    expect(a).toBe(b);
  });
});
