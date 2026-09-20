import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  EvaluationResult,
  Experiment,
  ExperimentContent,
  ExperimentListEntry,
} from './types';
import { api, ApiError } from './lib/api';
import { evaluate, InvalidLocaleError } from './lib/unicode';
import { sameContent, toContent } from './lib/content';
import { Editor } from './components/Editor';
import { ResultsPane } from './components/ResultsPane';
import { ConflictModal } from './components/ConflictModal';

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; revision: number }
  | { kind: 'error'; message: string };

type Draft = ExperimentContent & { id: string };

function toDraft(e: Experiment): Draft {
  return { id: e.id, ...toContent(e) };
}

interface PendingConflict {
  base: Experiment;
  local: ExperimentContent;
  server: Experiment;
}

/**
 * Cross-tab notification channel. Every accepted save broadcasts the new
 * revision; other tabs compare it with the revision they are editing from.
 */
function useBroadcast(onRemote: (id: string, revision: number) => void) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const bc = new BroadcastChannel('unicode-workbench');
    channelRef.current = bc;
    bc.onmessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'saved' && typeof ev.data.id === 'string') {
        onRemote(ev.data.id, Number(ev.data.revision));
      }
    };
    return () => bc.close();
  }, [onRemote]);
  return (id: string, revision: number) =>
    channelRef.current?.postMessage({ type: 'saved', id, revision });
}

export default function App() {
  const [list, setList] = useState<ExperimentListEntry[]>([]);
  const [currentId, setCurrentId] = useState<string>('demo');
  const [saved, setSaved] = useState<Experiment | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [serverResults, setServerResults] = useState<EvaluationResult | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [activePane, setActivePane] = useState<'editor' | 'results'>('editor');
  const [conflict, setConflict] = useState<PendingConflict | null>(null);
  const [remoteNotice, setRemoteNotice] = useState<string | null>(null);
  // Base snapshot captured when a remote save arrived while this tab was
  // dirty; required to three-way merge after the GET replaced `saved`.
  const [remoteBase, setRemoteBase] = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(true);

  // Latest state mirrors for use inside callbacks that must stay stable.
  const stateRef = useRef({ draft, saved, currentId });
  stateRef.current = { draft, saved, currentId };

  const broadcast = useBroadcast(useCallback((id: string) => {
    const s = stateRef.current;
    if (id !== s.currentId || !s.saved) return;
    // Remember the snapshot this tab edited from; the GET below replaces
    // `saved` with the winning document, but the merge still needs the base.
    const baseSnapshot = s.saved;
    api
      .get(id)
      .then((loaded) => {
        if (!stateRef.current.draft) return;
        const local = stateRef.current.draft;
        const dirty = !sameContent(toContent(baseSnapshot), local);
        setSaved(loaded.experiment);
        if (!dirty) {
          // Clean tab: adopt the remote content wholesale.
          setDraft(toDraft(loaded.experiment));
          setServerResults(loaded.results);
          setRemoteBase(null);
        } else {
          setRemoteBase(baseSnapshot);
          setRemoteNotice(
            `另一个标签页已保存到 revision ${loaded.experiment.revision}，保存时将进行合并。`,
          );
        }
      })
      .catch(() => undefined);
  }, []));

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const loaded = await api.get(id);
      setSaved(loaded.experiment);
      setDraft(toDraft(loaded.experiment));
      setServerResults(loaded.results);
      setCurrentId(id);
      setSelected(new Set());
      setSaveState({ kind: 'idle' });
      setRemoteNotice(null);
      setRemoteBase(null);
      setConflict(null);
    } catch (err) {
      setSaveState({
        kind: 'error',
        message: err instanceof Error ? err.message : '加载失败',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshList = useCallback(async () => {
    try {
      const { experiments } = await api.list();
      setList(experiments);
    } catch {
      /* list refresh is best-effort */
    }
  }, []);

  useEffect(() => {
    refreshList();
    load('demo');
  }, [load, refreshList]);

  const dirty = useMemo(
    () => (saved && draft ? !sameContent(toContent(saved), draft) : false),
    [saved, draft],
  );

  // Live evaluation in the browser from the identical engine the server
  // uses; invalid locales surface here before a save round trip.
  const live = useMemo<EvaluationResult | { error: string } | null>(() => {
    if (!draft) return null;
    try {
      return evaluate(draft.samples, draft.query, {
        locale: draft.locale,
        sensitivity: draft.sensitivity,
        numeric: draft.numeric,
      });
    } catch (err) {
      if (err instanceof InvalidLocaleError) return { error: err.message };
      throw err;
    }
  }, [draft]);

  // Live evaluation is always rendered (including while dirty): the browser
  // runs the exact engine the server will use for the stable snapshot. If
  // the locale is invalid, fall back to the last good server snapshot.
  const localeError = live && 'error' in live ? live.error : null;
  const results: EvaluationResult | null =
    live && !('error' in live) ? live : serverResults;

  const patch = useCallback((p: Partial<ExperimentContent>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }, []);

  const patchSampleText = useCallback((id: number, text: string) => {
    setDraft((d) =>
      d
        ? {
            ...d,
            samples: d.samples.map((s) => (s.id === id ? { ...s, text } : s)),
          }
        : d,
    );
  }, []);

  const addSample = useCallback(() => {
    setDraft((d) => {
      if (!d) return d;
      const id = d.nextSampleId;
      return {
        ...d,
        nextSampleId: id + 1,
        samples: [...d.samples, { id, text: '' }],
      };
    });
  }, []);

  const removeSample = useCallback((id: number) => {
    setDraft((d) => (d ? { ...d, samples: d.samples.filter((s) => s.id !== id) } : d));
    setSelected((sel) => {
      if (!sel.has(id)) return sel;
      const next = new Set(sel);
      next.delete(id);
      return next;
    });
  }, []);

  const toggle = useCallback((id: number) => {
    setSelected((sel) => {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const doSave = useCallback(
    async (base: Experiment, content: ExperimentContent) => {
      setSaveState({ kind: 'saving' });
      try {
        const loaded = await api.save(base.id, base.revision, content);
        setSaved(loaded.experiment);
        setDraft(toDraft(loaded.experiment));
        setServerResults(loaded.results);
        setSaveState({ kind: 'saved', revision: loaded.experiment.revision });
        setConflict(null);
        setRemoteNotice(null);
        setRemoteBase(null);
        broadcast(loaded.experiment.id, loaded.experiment.revision);
        refreshList();
      } catch (err) {
        if (err instanceof ApiError && err.status === 409 && err.body) {
          const server = (err.body as { server: Experiment }).server;
          setConflict({ base, local: content, server });
          setSaveState({ kind: 'idle' });
        } else {
          setSaveState({
            kind: 'error',
            message: err instanceof Error ? err.message : '保存失败',
          });
        }
      }
    },
    [broadcast, refreshList],
  );

  const save = useCallback(() => {
    if (!draft || !saved) return;
    // A newer revision is already known: merge locally instead of forcing
    // a guaranteed 409 round trip.
    if (remoteBase) {
      setConflict({ base: remoteBase, local: toContent(draft), server: saved });
      return;
    }
    doSave(saved, toContent(draft));
  }, [draft, saved, remoteBase, doSave]);

  const createNew = useCallback(async () => {
    const loaded = await api.create('未命名实验');
    await refreshList();
    await load(loaded.experiment.id);
  }, [load, refreshList]);

  // Cmd/Ctrl+S saves without leaving the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Unicode 工作台</h1>
        <select
          aria-label="experiment"
          value={currentId}
          onChange={(e) => load(e.target.value)}
        >
          {list.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}（r{e.revision}）
            </option>
          ))}
        </select>
        <button className="btn" onClick={createNew}>
          新建
        </button>
        <input
          className="name-input"
          value={draft?.name ?? ''}
          onChange={(e) => patch({ name: e.target.value })}
          aria-label="name"
          placeholder="实验名称"
        />
        {saved && <span className="rev-badge">revision {saved.revision}</span>}
        <span className="spacer" />
        {remoteNotice && (
          <span
            className="save-state dirty"
            title="点击可基于最新服务器版本打开合并对话框"
            onClick={() =>
              conflict === null &&
              draft &&
              saved &&
              remoteBase &&
              setConflict({ base: remoteBase, local: toContent(draft), server: saved })
            }
          >
            {remoteNotice}
          </span>
        )}
        <SaveIndicator state={saveState} dirty={dirty} />
        <button className="btn primary" onClick={save} disabled={!dirty || saveState.kind === 'saving' || !!localeError}>
          {saveState.kind === 'saving' ? '保存中…' : '保存 (⌘S)'}
        </button>
      </header>

      <nav className="pane-tabs" aria-label="面板切换">
        <button
          className={`pane-tab ${activePane === 'editor' ? 'active' : ''}`}
          onClick={() => setActivePane('editor')}
        >
          编辑
        </button>
        <button
          className={`pane-tab ${activePane === 'results' ? 'active' : ''}`}
          onClick={() => setActivePane('results')}
        >
          结果{selected.size > 0 ? `（已选 ${selected.size}）` : ''}
        </button>
      </nav>

      <main className="workspace">
        {draft && (
          <Editor
            draft={draft}
            onChange={patch}
            onSampleText={patchSampleText}
            onAddSample={addSample}
            onRemoveSample={removeSample}
            localeError={localeError}
            hiddenNarrow={activePane !== 'editor'}
          />
        )}
        <ResultsPane
          results={results}
          selected={selected}
          onToggle={toggle}
          hiddenNarrow={activePane !== 'results'}
        />
      </main>

      {loading && !draft && <div className="no-hits">加载中…</div>}

      {conflict && (
        <ConflictModal
          base={conflict.base}
          local={conflict.local}
          server={conflict.server}
          onCancel={() => setConflict(null)}
          onResolved={(merged) => {
            // Merged content is saved against the WINNING revision; the base
            // shown in the modal stays available for another conflict.
            const mergedBase: Experiment = {
              ...conflict.server,
              ...merged,
            };
            setConflict(null);
            doSave(mergedBase, merged);
          }}
        />
      )}
    </div>
  );
}

function SaveIndicator({ state, dirty }: { state: SaveState; dirty: boolean }) {
  if (state.kind === 'saving') return <span className="save-state">保存中…</span>;
  if (state.kind === 'error')
    return <span className="save-state error" title={state.message}>保存失败：{state.message}</span>;
  if (state.kind === 'saved')
    return <span className="save-state saved">已保存 r{state.revision}</span>;
  return (
    <span className={`save-state ${dirty ? 'dirty' : 'saved'}`}>
      {dirty ? '● 有未保存更改' : '已与服务器同步'}
    </span>
  );
}
