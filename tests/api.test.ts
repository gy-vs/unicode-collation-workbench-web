import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../server/src/app';
import { Store } from '../server/src/store';
import { seedPayload } from '../shared/defaults';
import type { Experiment, ExperimentPayload } from '../shared/types';

let app: Express;

beforeEach(() => {
  app = createApp(new Store());
});

async function createExp(payload?: Partial<ExperimentPayload>): Promise<Experiment> {
  const res = await request(app)
    .post('/api/experiments')
    .send({ ...seedPayload(), ...payload });
  expect(res.status).toBe(201);
  return res.body.experiment;
}

function put(id: string, baseRevision: number, payload: Partial<ExperimentPayload>) {
  return request(app)
    .put(`/api/experiments/${id}`)
    .send({ baseRevision, ...seedPayload(), ...payload });
}

describe('revision 与乐观并发', () => {
  it('创建后 revision=1，保存后递增', async () => {
    const exp = await createExp();
    expect(exp.revision).toBe(1);
    const res = await put(exp.id, 1, { name: '改名' });
    expect(res.status).toBe(200);
    expect(res.body.experiment.revision).toBe(2);
    expect(res.body.experiment.name).toBe('改名');
  });

  it('陈旧 revision 被拒绝并返回服务端当前版本', async () => {
    const exp = await createExp();
    await put(exp.id, 1, { name: '第一次' });
    const stale = await put(exp.id, 1, { name: '基于旧版' });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('revision_conflict');
    expect(stale.body.current.revision).toBe(2);
    expect(stale.body.current.name).toBe('第一次');
  });

  it('并发保存同一 baseRevision：一个成功，其余 409', async () => {
    const exp = await createExp();
    const [a, b] = await Promise.all([
      put(exp.id, 1, { name: '标签页 A' }),
      put(exp.id, 1, { name: '标签页 B' }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.current.revision).toBe(2);
    // 服务端内容等于胜者的提交
    const winner = a.status === 200 ? a : b;
    expect(loser.body.current.name).toBe(winner.body.experiment.name);
  });

  it('缺少 baseRevision 返回 400', async () => {
    const exp = await createExp();
    const res = await request(app).put(`/api/experiments/${exp.id}`).send(seedPayload());
    expect(res.status).toBe(400);
  });
});

describe('结果的稳定性与正确性', () => {
  const payload: ExperimentPayload = {
    name: 't',
    config: {
      collation: {
        locale: 'en',
        sensitivity: 'base', // base 下 café/CAFE 并列，用于验证 id 决胜
        numeric: true,
        caseFirst: 'false',
        ignorePunctuation: false,
      },
      search: { normalization: 'NFD', stripDiacritics: true, caseFold: 'default' },
    },
    samples: [
      { id: 1, text: 'café' }, // 分解
      { id: 2, text: 'file10' },
      { id: 3, text: 'file2' },
      { id: 4, text: 'CAFE' },
    ],
    queries: [{ id: 1, text: 'caf\u00E9' }], // 预组合
  };

  it('同一载荷两次预览结果完全一致', async () => {
    const r1 = await request(app).post('/api/results/preview').send(payload);
    const r2 = await request(app).post('/api/results/preview').send(payload);
    expect(r1.status).toBe(200);
    expect(r2.body).toEqual(r1.body);
  });

  it('数字排序与并列决胜在服务端结果中生效', async () => {
    const res = await request(app).post('/api/results/preview').send(payload);
    const { sorted } = res.body.results;
    // café 两种写法 + CAFE 并列时按 id 决胜；file2 < file10（numeric）
    expect(sorted.indexOf(3)).toBeLessThan(sorted.indexOf(2));
    const cafes = sorted.filter((id: number) => [1, 4].includes(id));
    expect(cafes).toEqual([1, 4]);
  });

  it('高亮范围映射回原始（分解形式）字符串', async () => {
    const res = await request(app).post('/api/results/preview').send(payload);
    const { searches } = res.body.results;
    const hit = searches[0].hits.find((h: { sampleId: number }) => h.sampleId === 1);
    expect(hit.ranges).toEqual([[0, 5]]);
    expect('cafe\u0301'.slice(0, 5)).toBe('cafe\u0301');
  });

  it('保存后的实验可通过 /results 获取相同结果', async () => {
    const exp = await createExp(payload);
    const saved = await request(app).get(`/api/experiments/${exp.id}/results`);
    const preview = await request(app).post('/api/results/preview').send(payload);
    expect(saved.status).toBe(200);
    expect(saved.body.results).toEqual(preview.body.results);
  });
});
