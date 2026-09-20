/**
 * Three-way merge for experiments.
 *
 *   base   = the revision the local tab started editing from
 *   server = the newer document that won the save (409 conflict)
 *   local  = the tab's unsaved content
 *
 * Non-conflicting changes (one side edited, the other didn't; one side
 * added/deleted rows) merge automatically. Genuine conflicts are reported
 * with all three versions so the UI can present local/server choices.
 */

import type { Experiment, ExperimentContent, Sample, Sensitivity } from '../types';

export type ScalarField = 'name' | 'locale' | 'sensitivity' | 'numeric' | 'query';

export const SCALAR_FIELDS: ScalarField[] = [
  'name',
  'locale',
  'sensitivity',
  'numeric',
  'query',
];

export type MergeChoice = 'local' | 'server';
export type Resolutions = {
  fields: Partial<Record<ScalarField, MergeChoice>>;
  rows: Partial<Record<number, MergeChoice>>;
};

export interface ScalarState {
  value: string | boolean;
  conflict: {
    base: string | boolean;
    local: string | boolean;
    server: string | boolean;
  } | null;
}

export type RowConflictKind = 'editVsEdit' | 'deleteVsEdit' | 'bothAdded';

export interface MergedRow {
  /** Present when the row already has a definite outcome. */
  row?: Sample;
  /** Present when the row needs a user decision. */
  conflict?: {
    kind: RowConflictKind;
    /** Conflict key (also used in Resolutions.rows). */
    key: number;
    baseText?: string;
    local?: Sample;
    server?: Sample;
  };
}

export interface MergeState {
  scalars: Record<ScalarField, ScalarState>;
  rows: MergedRow[];
  /** Local rows whose id collides with an independently added server row. */
  hasConflicts: boolean;
}

type SampleMap = Map<number, Sample>;

const index = (rows: Sample[]): SampleMap => new Map(rows.map((r) => [r.id, r]));

function mergeScalar(
  field: ScalarField,
  base: Experiment,
  local: ExperimentContent,
  server: Experiment,
): ScalarState {
  const b = base[field] as string | boolean;
  const l = local[field] as string | boolean;
  const s = server[field] as string | boolean;
  const localChanged = l !== b;
  const serverChanged = s !== b;
  if (localChanged && serverChanged && l !== s) {
    return { value: s, conflict: { base: b, local: l, server: s } };
  }
  // Either only one side changed, both made the same change, or neither did.
  return { value: localChanged ? l : s, conflict: null };
}

/**
 * Build the merged row sequence.
 *  - server order is the skeleton
 *  - purely-local additions are inserted after their nearest local anchor
 *  - rows deleted on the server but kept/edited locally are reinserted
 */
function mergeRows(
  base: Experiment,
  local: ExperimentContent,
  server: Experiment,
): MergedRow[] {
  const baseMap = index(base.samples);
  const localMap = index(local.samples);
  const serverMap = index(server.samples);

  const merged: MergedRow[] = [];

  const makeRowEntry = (id: number): MergedRow => {
    const b = baseMap.get(id);
    const l = localMap.get(id);
    const s = serverMap.get(id);

    // Rows unknown to the base are additions: present on one side merges
    // automatically; present on both (same fresh id) conflicts only when
    // the texts differ.
    if (!b) {
      if (l && s) {
        if (l.text === s.text) return { row: s };
        return { conflict: { kind: 'bothAdded', key: id, local: l, server: s } };
      }
      if (l) return { row: l };
      if (s) return { row: s };
      return {};
    }

    const lText = l?.text;
    const sText = s?.text;
    const bText = b.text;

    if (!l && !s) return {}; // both deleted the base row
    if (!l) {
      // local deleted; server kept/edited it. Untouched server text means
      // the deletion applies cleanly; an edit competes with the deletion.
      if (sText === bText) return {};
      return {
        conflict: { kind: 'deleteVsEdit', key: id, baseText: bText, server: s },
      };
    }
    if (!s) {
      // server deleted; local kept/edited it.
      if (lText === bText) return {};
      return {
        conflict: { kind: 'deleteVsEdit', key: id, baseText: bText, local: l },
      };
    }

    // Present on all three sides: ordinary edit/delete reconciliation.
    const localChanged = lText !== bText;
    const serverChanged = sText !== bText;
    if (localChanged && serverChanged && lText !== sText) {
      return {
        conflict: { kind: 'editVsEdit', key: id, baseText: bText, local: l, server: s },
      };
    }
    return { row: localChanged ? l : s };
  };

  // 1) Skeleton: server rows in server order. A clean local deletion of an
  //    untouched server row produces {} and inserts nothing; a local-delete
  //    vs server-edit is still a conflict the user must decide on.
  for (const s of server.samples) {
    const entry = makeRowEntry(s.id);
    if ('row' in entry || entry.conflict) merged.push(entry);
  }

  // 2) Rows absent from the server: local-only adds, and rows the server
  //    deleted while local kept/edited them (deleteVsEdit). Consecutive
  //    local-only inserts must keep their local order, so track the most
  //    recently inserted position; otherwise anchor on the nearest preceding
  //    row present in `merged`.
  let lastInsertAt = -1;
  local.samples.forEach((l) => {
    if (serverMap.has(l.id)) {
      // A server row between local inserts resets the insertion chain.
      lastInsertAt = -1;
      return;
    }
    const entry = makeRowEntry(l.id);
    if (!('row' in entry) && !entry.conflict) return;

    let at: number;
    if (lastInsertAt >= 0) {
      at = lastInsertAt + 1;
    } else {
      const idx = local.samples.findIndex((r) => r.id === l.id);
      at = 0;
      for (let k = idx - 1; k >= 0; k--) {
        const anchorId = local.samples[k].id;
        const anchorIdx = merged.findIndex(
          (e) => e.row?.id === anchorId || e.conflict?.key === anchorId,
        );
        if (anchorIdx >= 0) {
          at = anchorIdx + 1;
          break;
        }
      }
    }
    merged.splice(at, 0, entry);
    lastInsertAt = at;
  });

  return merged;
}

export function mergeExperiments(
  base: Experiment,
  local: ExperimentContent,
  server: Experiment,
): MergeState {
  const scalars = {} as Record<ScalarField, ScalarState>;
  for (const field of SCALAR_FIELDS) {
    scalars[field] = mergeScalar(field, base, local, server);
  }
  const rows = mergeRows(base, local, server);
  const hasConflicts =
    Object.values(scalars).some((s) => s.conflict !== null) ||
    rows.some((r) => r.conflict !== undefined);
  return { scalars, rows, hasConflicts };
}

/**
 * Apply user choices and materialize a saveable document.
 *
 * For "bothAdded", the chosen side keeps the id; choosing local renumbers
 * the local row past the server's id and drops the server row. For
 * "deleteVsEdit", "local" honours the local deletion while "server" keeps
 * the server's edited row.
 */
export function resolveMerge(
  state: MergeState,
  resolutions: Resolutions,
): ExperimentContent {
  const content = {
    name: '',
    locale: '',
    sensitivity: 'variant' as Sensitivity,
    numeric: false,
    query: '',
    samples: [] as Sample[],
    nextSampleId: 1,
  };

  for (const field of SCALAR_FIELDS) {
    const st = state.scalars[field];
    if (!st.conflict) {
      (content as Record<string, unknown>)[field] = st.value;
      continue;
    }
    const choice = resolutions.fields[field] ?? 'server';
    (content as Record<string, unknown>)[field] =
      choice === 'local' ? st.conflict.local : st.conflict.server;
  }

  let maxId = 0;
  const bump = (id: number) => {
    maxId = Math.max(maxId, id);
  };
  for (const entry of state.rows) {
    if (entry.row) {
      content.samples.push(entry.row);
      bump(entry.row.id);
      continue;
    }
    const c = entry.conflict!;
    const choice = resolutions.rows[c.key] ?? 'server';
    if (c.kind === 'bothAdded') {
      // Independently added rows are both legitimate: the chosen side keeps
      // its id; the other side is dropped. Choosing "local" renumbers the
      // local row past the id it collided with (and every id placed so far).
      if (choice === 'local' && c.local) {
        const id = Math.max(maxId, c.key) + 1;
        content.samples.push({ id, text: c.local.text });
        bump(id);
      } else if (c.server) {
        content.samples.push(c.server);
        bump(c.server.id);
      }
      continue;
    }

    const chosen = choice === 'local' ? c.local : c.server;
    if (chosen) {
      content.samples.push({ id: chosen.id, text: chosen.text });
      bump(chosen.id);
    }
    // deleteVsEdit + local choice (chosen undefined): row is dropped.
  }

  content.nextSampleId = maxId + 1;
  return content;
}
