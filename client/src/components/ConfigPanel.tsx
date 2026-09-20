import type { ExperimentConfig } from '../../../shared/types';

const LOCALES = [
  'en', 'en-US', 'de', 'de-DE', 'fr', 'es', 'it', 'pt', 'tr', 'nl', 'sv', 'da', 'no',
  'zh', 'zh-Hans-CN', 'zh-Hant-TW', 'ja', 'ko', 'ar', 'he', 'ru', 'pl', 'cs', 'th',
];

interface Props {
  config: ExperimentConfig;
  onChange: (config: ExperimentConfig) => void;
}

export function ConfigPanel({ config, onChange }: Props) {
  const col = config.collation;
  const sea = config.search;
  const setCol = (patch: Partial<typeof col>) =>
    onChange({ ...config, collation: { ...col, ...patch } });
  const setSea = (patch: Partial<typeof sea>) =>
    onChange({ ...config, search: { ...sea, ...patch } });

  return (
    <section className="card config">
      <fieldset>
        <legend>排序配置（Intl.Collator）</legend>
        <label>
          Locale
          <input
            list="locale-list"
            value={col.locale}
            placeholder="留空 = 运行时默认"
            onChange={(e) => setCol({ locale: e.target.value.trim() })}
          />
          <datalist id="locale-list">
            {LOCALES.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
        <label>
          灵敏度
          <select
            value={col.sensitivity}
            onChange={(e) => setCol({ sensitivity: e.target.value as typeof col.sensitivity })}
          >
            <option value="base">base（仅字母）</option>
            <option value="accent">accent（+变音符）</option>
            <option value="case">case（+大小写）</option>
            <option value="variant">variant（全部）</option>
          </select>
        </label>
        <label>
          大小写优先
          <select
            value={col.caseFirst}
            onChange={(e) => setCol({ caseFirst: e.target.value as typeof col.caseFirst })}
          >
            <option value="false">默认</option>
            <option value="lower">小写在前</option>
            <option value="upper">大写在前</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={col.numeric}
            onChange={(e) => setCol({ numeric: e.target.checked })}
          />
          数字排序（numeric）
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={col.ignorePunctuation}
            onChange={(e) => setCol({ ignorePunctuation: e.target.checked })}
          />
          忽略标点
        </label>
      </fieldset>

      <fieldset>
        <legend>检索配置（规范化 / 折叠）</legend>
        <label>
          规范化
          <select
            value={sea.normalization}
            onChange={(e) => setSea({ normalization: e.target.value as typeof sea.normalization })}
          >
            <option value="none">不规范化</option>
            <option value="NFC">NFC</option>
            <option value="NFD">NFD</option>
            <option value="NFKC">NFKC</option>
            <option value="NFKD">NFKD</option>
          </select>
        </label>
        <label>
          大小写折叠
          <select
            value={sea.caseFold}
            onChange={(e) => setSea({ caseFold: e.target.value as typeof sea.caseFold })}
          >
            <option value="none">不折叠</option>
            <option value="default">默认（toLowerCase）</option>
            <option value="locale">按 Locale（如 tr: I→ı）</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={sea.stripDiacritics}
            onChange={(e) => setSea({ stripDiacritics: e.target.checked })}
          />
          剥离变音符
        </label>
      </fieldset>
    </section>
  );
}
