import type { Experiment, ExperimentContent } from '../types';

export function toContent(e: Experiment | ExperimentContent): ExperimentContent {
  return {
    name: e.name,
    locale: e.locale,
    sensitivity: e.sensitivity,
    numeric: e.numeric,
    query: e.query,
    samples: e.samples,
    nextSampleId: e.nextSampleId,
  };
}

/** Structural equality of editable content (ids and text must all match). */
export function sameContent(a: ExperimentContent, b: ExperimentContent): boolean {
  if (
    a.name !== b.name ||
    a.locale !== b.locale ||
    a.sensitivity !== b.sensitivity ||
    a.numeric !== b.numeric ||
    a.query !== b.query ||
    a.nextSampleId !== b.nextSampleId ||
    a.samples.length !== b.samples.length
  ) {
    return false;
  }
  return a.samples.every((s, i) => s.id === b.samples[i].id && s.text === b.samples[i].text);
}
