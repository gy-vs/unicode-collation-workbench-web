import express, { type Express } from 'express';
import { ConflictError, Store, parsePayload } from './store';
import { computeResults } from './results';
import { seedPayload } from '../../shared/defaults';

export function createApp(store: Store): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/experiments', (_req, res) => {
    res.json({ experiments: store.list() });
  });

  app.post('/api/experiments', (req, res) => {
    const payload =
      req.body && Object.keys(req.body).length > 0 ? parsePayload(req.body) : seedPayload();
    res.status(201).json({ experiment: store.create(payload) });
  });

  app.get('/api/experiments/:id', (req, res) => {
    const exp = store.get(req.params.id);
    if (!exp) return res.status(404).json({ error: 'not_found' });
    res.json({ experiment: exp });
  });

  app.get('/api/experiments/:id/results', (req, res) => {
    const exp = store.get(req.params.id);
    if (!exp) return res.status(404).json({ error: 'not_found' });
    res.json({ results: computeResults(exp) });
  });

  app.put('/api/experiments/:id', (req, res) => {
    const baseRevision = Number(req.body?.baseRevision);
    if (!Number.isInteger(baseRevision)) {
      return res.status(400).json({ error: 'base_revision_required' });
    }
    try {
      const experiment = store.update(req.params.id, baseRevision, parsePayload(req.body));
      res.json({ experiment });
    } catch (err) {
      if (err instanceof ConflictError) {
        // 陈旧 revision：拒绝写入，返回服务端当前版本供前端对比/合并
        return res.status(409).json({ error: 'revision_conflict', current: err.current });
      }
      if (err instanceof Error && err.message === 'not found') {
        return res.status(404).json({ error: 'not_found' });
      }
      throw err;
    }
  });

  app.delete('/api/experiments/:id', (req, res) => {
    if (!store.remove(req.params.id)) return res.status(404).json({ error: 'not_found' });
    res.status(204).end();
  });

  // 预览：对未保存的编辑内容在服务端生成稳定结果，不落库
  app.post('/api/results/preview', (req, res) => {
    res.json({ results: computeResults(parsePayload(req.body)) });
  });

  return app;
}
