import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app';
import { Store } from './store';

const port = Number(process.env.PORT) || 3001;
const store = new Store(process.env.DATA_FILE);
const app = createApp(store);

// 生产模式：托管 Vite 构建产物
const dist = join(dirname(fileURLToPath(import.meta.url)), '../../dist');
if (process.env.NODE_ENV === 'production' && existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.listen(port, () => {
  console.log(`[server] Unicode workbench API on http://localhost:${port}`);
});
