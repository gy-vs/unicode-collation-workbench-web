// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import App from '../src/App';
import type { Experiment, EvaluationResult } from '../src/types';
import { evaluate } from '../src/lib/unicode';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const demoExperiment: Experiment = {
  id: 'demo',
  name: 'demo',
  locale: 'en',
  sensitivity: 'variant',
  numeric: false,
  query: '',
  samples: [
    { id: 1, text: 'banana' },
    { id: 2, text: 'apple' },
    { id: 3, text: 'Apple' },
  ],
  nextSampleId: 4,
  revision: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const bundle = (e: Experiment) => ({ experiment: e, results: evaluateSamples(e) });
function evaluateSamples(e: Experiment): EvaluationResult {
  return evaluate(e.samples, e.query, {
    locale: e.locale,
    sensitivity: e.sensitivity,
    numeric: e.numeric,
  });
}

/** Minimal fetch stub keyed by method+path; tests override PUT per scenario. */
function installFetch(handlers: {
  get?: (path: string) => any;
  put?: (path: string, body: any) => any;
  post?: (path: string, body: any) => any;
}) {
  const fetchMock = vi.fn(async (input: any, init: any) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(init.body) : undefined;
    if (method === 'GET' && url.endsWith('/api/experiments')) {
      return jsonResponse(200, {
        experiments: [{ id: 'demo', name: 'demo', revision: 1, updatedAt: '' }],
      });
    }
    if (method === 'GET' && handlers.get) return handlers.get(url);
    if (method === 'POST' && handlers.post) return handlers.post(url, body);
    if (method === 'PUT' && handlers.put) return handlers.put(url, body);
    return jsonResponse(404, { error: 'unhandled' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  // BroadcastChannel is not implemented in happy-dom.
  class FakeBC {
    static instances: FakeBC[] = [];
    onmessage: ((ev: MessageEvent) => void) | null = null;
    constructor(public name: string) {
      FakeBC.instances.push(this);
    }
    postMessage() {}
    close() {}
  }
  vi.stubGlobal('BroadcastChannel', FakeBC);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('keeps selection by sample id across re-sorting', async () => {
    installFetch({
      get: () => jsonResponse(200, bundle(demoExperiment)),
      put: () => jsonResponse(200, bundle(demoExperiment)),
    });
    render(<App />);

    // Initially variant: "apple" (#2) before "Apple" (#3) before banana (#1).
    await screen.findByText('banana');
    const rows = () => document.querySelectorAll('.result-row');
    expect(rows().length).toBe(3);

    // Select the row containing "banana" (#1).
    fireEvent.click(screen.getByLabelText('select-1'));
    expect(screen.getByLabelText('select-1')).toBeChecked();

    // Switch to base sensitivity: apple/Apple tie by collation, banana moves
    // down, but the #1 selection follows the id.
    fireEvent.change(screen.getByLabelText('sensitivity'), {
      target: { value: 'base' },
    });
    expect(screen.getByLabelText('select-1')).toBeChecked();
    const order = [...rows()].map((r) => r.textContent);
    expect(order.findIndex((t) => t!.includes('banana'))).toBe(2);
  });

  it('switching panes on narrow screens preserves typed state and selection', async () => {
    installFetch({
      get: () => jsonResponse(200, bundle(demoExperiment)),
    });
    render(<App />);
    await screen.findByText('banana');

    // Type in the editor (query), then select a result after switching panes.
    fireEvent.change(screen.getByLabelText('query'), { target: { value: 'app' } });
    fireEvent.click(screen.getByLabelText('select-2'));

    // Switch to results tab and back: editor pane is hidden via class only
    // (it stays mounted), and all local state survives.
    fireEvent.click(screen.getByRole('button', { name: '结果（已选 1）' }));
    const editorPane = document.querySelector('.pane.editor')!;
    expect(editorPane.classList.contains('hidden-narrow')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect(editorPane.classList.contains('hidden-narrow')).toBe(false);
    expect((screen.getByLabelText('query') as HTMLInputElement).value).toBe('app');
    expect(screen.getByLabelText('select-2')).toBeChecked();
  });

  it('opens merge dialog on 409, keeps local edits, and saves merged content', async () => {
    const serverWinner: Experiment = {
      ...demoExperiment,
      revision: 2,
      name: 'server name',
      samples: [
        { id: 1, text: 'banana' },
        { id: 2, text: 'apple' },
        { id: 3, text: 'Apricot' },
      ],
    };
    let putCalls = 0;
    installFetch({
      get: () => jsonResponse(200, bundle(demoExperiment)),
      put: (_url, body) => {
        putCalls += 1;
        if (putCalls === 1) {
          return jsonResponse(409, { error: 'REVISION_CONFLICT', server: serverWinner });
        }
        // Merged save: must target revision 2.
        expect(body.baseRevision).toBe(2);
        return jsonResponse(200, {
          experiment: { ...serverWinner, ...body.content, revision: 3 },
          results: evaluateSamples({ ...serverWinner, ...body.content }),
        });
      },
    });

    render(<App />);
    await screen.findByText('banana');

    // Local edit: rename the experiment.
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'local name' } });
    fireEvent.click(screen.getByRole('button', { name: /保存/ }));

    // Conflict dialog appears with both choices and the local text still present.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('local name')).toBeInTheDocument();
    expect(within(dialog).getByText('server name')).toBeInTheDocument();

    // Pick local for the name conflict, then merge.
    const localChoice = [
      ...within(dialog).getAllByRole('button', { hidden: true }),
    ].find((b) => b.textContent!.includes('local name'))!;
    fireEvent.click(localChoice);
    fireEvent.click(within(dialog).getByRole('button', { name: '合并并保存' }));

    await act(async () => {});
    expect(putCalls).toBe(2);
    expect((screen.getByLabelText('name') as HTMLInputElement).value).toBe('local name');
    // Server's independent sample change survives the merge too.
    expect(screen.getByText('Apricot')).toBeInTheDocument();
  });
});
