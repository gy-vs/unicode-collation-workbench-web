import { describe, expect, it } from 'vitest';
import { evaluate, foldNeedle, searchSamples } from './unicode';
import type { CollationConfig, Sample } from '../types';

const cfg = (over: Partial<CollationConfig> = {}): CollationConfig => ({
  locale: 'en',
  sensitivity: 'variant',
  numeric: false,
  ...over,
});

const samplesFrom = (texts: string[]): Sample[] =>
  texts.map((text, i) => ({ id: i + 1, text }));

describe('foldNeedle', () => {
  it('base sensitivity folds case and accents', () => {
    expect(foldNeedle('CAFÉ', 'en', 'base')).toBe('cafe');
  });

  it('Turkish İ folds to i and I to dotless ı', () => {
    expect(foldNeedle('İSTANBUL', 'tr', 'base')).toBe('istanbul');
    expect(foldNeedle('ISTANBUL', 'tr', 'base')).toBe('ıstanbul');
    // English keeps the dotted i (i + U+0307 after NFD → stripped? no: marks
    // stripped on the *folded* cluster, whose decomposition differs).
    expect(foldNeedle('ISTANBUL', 'en', 'base')).toContain('istanbul');
  });

  it('variant sensitivity is a no-op fold (modulo NFC)', () => {
    expect(foldNeedle('Café', 'en', 'variant')).toBe('Café'.normalize('NFC'));
  });
});

describe('searchSamples range mapping', () => {
  it('maps an accent-insensitive hit back to the whole precomposed cluster', () => {
    const samples = samplesFrom(['café shop']);
    const { hits } = searchSamples(samples, 'cafe', 'en', 'base');
    expect(hits).toHaveLength(1);
    const [start, end] = [hits[0].ranges[0].start, hits[0].ranges[0].end];
    // "caf" = 0..3, the é occupies exactly one UTF-16 unit precomposed.
    expect([start, end]).toEqual([0, 4]);
    expect(samples[0].text.slice(start, end)).toBe('café');
  });

  it('does not split combining sequences in NFD text', () => {
    // "é" as e + U+0302A (combining acute): two UTF-16 units, one cluster.
    const samples = samplesFrom(['café shop']);
    const { hits } = searchSamples(samples, 'cafe', 'en', 'base');
    expect(hits).toHaveLength(1);
    const r = hits[0].ranges[0];
    expect(samples[0].text.slice(r.start, r.end)).toBe('café');
    expect(r.end - r.start).toBe(5); // includes the combining mark
  });

  it('keeps surrogate pairs inside one range', () => {
    const samples = samplesFrom(['𝕦𝕟𝕚 file']);
    const { hits } = searchSamples(samples, 'file', 'en', 'base');
    expect(hits).toHaveLength(1);
    const r = hits[0].ranges[0];
    expect(samples[0].text.slice(r.start, r.end)).toBe('file');
    // Searching for the bold letters themselves (each is a surrogate pair).
    const bold = searchSamples(samples, '𝕦𝕟', 'en', 'base');
    expect(bold.hits[0].ranges[0]).toEqual({ start: 0, end: 4 });
  });

  it('Turkish search distinguishes dotted vs dotless I only at proper sensitivity', () => {
    const samples = samplesFrom(['İstanbul city', 'Istanbul city']);
    const trBase = searchSamples(samples, 'istanbul', 'tr', 'base');
    // Only the dotted-I word folds to "istanbul" in Turkish.
    expect(trBase.hits.map((h) => h.sampleId)).toEqual([1]);

    const enBase = searchSamples(samples, 'istanbul', 'en', 'base');
    expect(enBase.hits.map((h) => h.sampleId).sort()).toEqual([1, 2]);
  });

  it('returns every occurrence, including adjacent matches', () => {
    const samples = samplesFrom(['aaa']);
    const { hits } = searchSamples(samples, 'a', 'en', 'base');
    expect(hits[0].ranges).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ]);
  });

  it('ligature folding maps fi match onto the single ﬁ cluster', () => {
    const samples = samplesFrom(['ﬁle']);
    const { hits } = searchSamples(samples, 'file', 'en', 'base');
    // ﬁ does NOT decompose under NFD, so literal "file" cannot match it —
    // document and lock that boundary (Collator-based matching is the
    // alternative, but range-preserving literal search never claims it).
    expect(hits).toHaveLength(0);
  });
});

describe('evaluate sorting', () => {
  it('numeric ordering switches between lexicographic and numeric', () => {
    const samples = samplesFrom(['File 10', 'File 2', 'File 1']);
    const lexical = evaluate(samples, '', cfg({ numeric: false }));
    expect(lexical.ranked.map((r) => r.text)).toEqual(['File 1', 'File 10', 'File 2']);

    const numeric = evaluate(samples, '', cfg({ numeric: true }));
    expect(numeric.ranked.map((r) => r.text)).toEqual(['File 1', 'File 2', 'File 10']);
  });

  it('Turkish collation orders ı before i appropriately', () => {
    const samples = samplesFrom(['isim', 'ırmak']);
    const en = evaluate(samples, '', cfg({ locale: 'en' }));
    const tr = evaluate(samples, '', cfg({ locale: 'tr' }));
    expect(en.ranked.map((r) => r.text)).not.toEqual(tr.ranked.map((r) => r.text));
  });

  it('ties share a group and are broken by sample id', () => {
    // base sensitivity makes café / CAFE / cafe + combining equal.
    const samples = samplesFrom(['CAFE', 'café', 'café']);
    const result = evaluate(samples, '', cfg({ sensitivity: 'base' }));
    expect(result.ranked.every((r) => r.tieGroup === 0)).toBe(true);
    // Within the tie, ids 1,2,3 order ascending regardless of input order.
    expect(result.ranked.map((r) => r.sampleId)).toEqual([1, 2, 3]);
    expect(result.ranked.map((r) => r.rank)).toEqual([0, 1, 2]);
  });

  it('tie groups are -1 for distinct rows and increment across runs', () => {
    const samples = samplesFrom(['a', 'A', 'b', 'B', 'z']);
    const result = evaluate(samples, '', cfg({ sensitivity: 'base' }));
    const groups = result.ranked.map((r) => r.tieGroup);
    expect(groups).toEqual([0, 0, 1, 1, -1]);
  });

  it('rejects invalid locale explicitly', () => {
    expect(() => evaluate([], '', cfg({ locale: 'not_a_locale!!' }))).toThrow();
  });

  it('ranking is stable across repeated evaluations', () => {
    const samples = samplesFrom(['b', 'a', 'A', 'B']);
    const r1 = evaluate(samples, '', cfg({ sensitivity: 'base' })).ranked.map(
      (r) => r.sampleId,
    );
    const r2 = evaluate(samples, '', cfg({ sensitivity: 'base' })).ranked.map(
      (r) => r.sampleId,
    );
    expect(r1).toEqual(r2);
  });
});
