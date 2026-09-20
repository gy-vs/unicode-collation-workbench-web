import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Experiment, ExperimentContent, Sensitivity } from '../src/types.js';
import { evaluate, InvalidLocaleError } from '../src/lib/unicode.js';
import {
  StaleRevisionError,
  NotFoundError,
  createExperiment,
  getExperiment,
  listExperiments,
  saveExperiment,
} from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
app.use(express.json({ limit: '2mb' }));

const SENSITIVITIES: Sensitivity[] = ['base', 'accent', 'case', 'variant'];

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

/** Validate an incoming content payload; returns an error message or null. */
function validateContent(body: any): string | null {
  if (!body || typeof body !== 'object') return '请求体必须是 JSON 对象';
  if (!isString(body.name)) return 'name 必须是字符串';
  if (!isString(body.locale) || body.locale.trim() === '') return 'locale 必须是非空字符串';
  if (!SENSITIVITIES.includes(body.sensitivity)) return 'sensitivity 取值非法';
  if (typeof body.numeric !== 'boolean') return 'numeric 必须是布尔值';
  if (!isString(body.query)) return 'query 必须是字符串';
  if (!Number.isInteger(body.nextSampleId) || body.nextSampleId < 1)
    return 'nextSampleId 必须是正整数';
  if (!Array.isArray(body.samples)) return 'samples 必须是数组';
  const seen = new Set<number>();
  for (const s of body.samples) {
    if (!s || typeof s !== 'object') return 'samples 条目非法';
    if (!Number.isInteger(s.id) || s.id < 1) return '样本 id 必须是正整数';
    if (seen.has(s.id)) return `样本 id 重复: ${s.id}`;
    seen.add(s.id);
    if (!isString(s.text)) return '样本 text 必须是字符串';
  }
  if (body.nextSampleId <= Math.max(0, ...[...seen])) return 'nextSampleId 必须大于所有样本 id';
  return null;
}

const withStableResults = (doc: Experiment) => ({
  experiment: doc,
  results: evaluate(doc.samples, doc.query, {
    locale: doc.locale,
    sensitivity: doc.sensitivity,
    numeric: doc.numeric,
  }),
});

app.get('/api/experiments', (_req, res) => {
  res.json({ experiments: listExperiments() });
});

app.post('/api/experiments', (req, res) => {
  const doc = createExperiment(isString(req.body?.name) ? req.body.name : '');
  res.status(201).json(withStableResults(doc));
});

app.get('/api/experiments/:id', (req, res) => {
  try {
    res.json(withStableResults(getExperiment(req.params.id)));
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

app.put('/api/experiments/:id', (req, res) => {
  const content: ExperimentContent | undefined = req.body?.content;
  const baseRevision = req.body?.baseRevision;
  if (!Number.isInteger(baseRevision)) {
    res.status(400).json({ error: 'baseRevision 必须是整数' });
    return;
  }
  const validationError = validateContent(content);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  try {
    const doc = saveExperiment(req.params.id, baseRevision, content as ExperimentContent);
    res.json(withStableResults(doc));
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
    } else if (err instanceof StaleRevisionError) {
      res.status(409).json({ error: 'REVISION_CONFLICT', server: err.server });
    } else if (err instanceof InvalidLocaleError) {
      res.status(422).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

// Error handler for locale failures raised while evaluating on read.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof InvalidLocaleError) {
      res.status(422).json({ error: err.message });
      return;
    }
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: '服务器内部错误' });
  },
);

// Serve the built client in production.
const DIST_DIR = path.resolve(__dirname, '../dist');
app.use(express.static(DIST_DIR));
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

export const PORT = Number(process.env.PORT ?? 3001);
export function startServer(port = PORT) {
  return app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Unicode workbench API on http://localhost:${port}`);
  });
}

// Start directly when run as the entry point; importing `app` from tests
// must not bind a port.
if (process.env.NODE_ENV !== 'test' && process.env.VITEST === undefined) {
  startServer();
}

