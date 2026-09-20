import type { ExperimentPayload, ExperimentResults } from '../../shared/types';
import { findRanges } from '../../shared/match';
import { makeCollator, sortSamples } from '../../shared/sort';

/**
 * 由实验内容确定性生成结果：同样的输入永远得到同样的输出
 * （不含时间戳等易变字段），排序并列按样本 id 决胜。
 */
export function computeResults(exp: ExperimentPayload): ExperimentResults {
  const { collation, search } = exp.config;
  const collator = makeCollator(collation);
  const resolved = collator.resolvedOptions();

  return {
    sorted: sortSamples(exp.samples, collation),
    searches: exp.queries.map((q) => ({
      queryId: q.id,
      hits: exp.samples
        .map((s) => ({
          sampleId: s.id,
          ranges: findRanges(s.text, q.text, search, collation.locale),
        }))
        .filter((h) => h.ranges.length > 0),
    })),
    collator: {
      locale: resolved.locale,
      sensitivity: resolved.sensitivity as ExperimentResults['collator']['sensitivity'],
      numeric: resolved.numeric,
      caseFirst: resolved.caseFirst as ExperimentResults['collator']['caseFirst'],
      ignorePunctuation: resolved.ignorePunctuation,
    },
  };
}
