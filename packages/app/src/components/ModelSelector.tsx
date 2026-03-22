import { useState, useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';
import { useAppState } from '../store/context';
import type { ModelInfo } from '../store/reducer';

interface ModelSelectorProps {
  onClose: () => void;
}

export default function ModelSelector({ onClose }: ModelSelectorProps) {
  const { state, dispatch } = useAppState();
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const { data: models, isLoading } = trpc.models.list.useQuery();

  useEffect(() => {
    if (!models) return;
    dispatch({ type: 'SET_AVAILABLE_MODELS', models });
    if (!state.selectedModel) {
      const firstBuiltIn = models.find(m => m.isBuiltIn);
      if (firstBuiltIn) dispatch({ type: 'SET_SELECTED_MODEL', model: firstBuiltIn });
    }
  }, [models]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  function selectModel(model: ModelInfo) {
    dispatch({ type: 'SET_SELECTED_MODEL', model });
    // Also associate with active session if one exists
    if (state.activeSessionId) {
      dispatch({ type: 'SET_SESSION_MODEL', sessionId: state.activeSessionId, model });
    }
    onClose();
  }

  const allModels = models ?? state.availableModels;
  const filtered = allModels.filter(m => {
    const q = search.toLowerCase();
    return (
      m.modelName.toLowerCase().includes(q) ||
      m.modelId.toLowerCase().includes(q) ||
      m.providerId.toLowerCase().includes(q)
    );
  });

  const builtIn = filtered.filter(m => m.isBuiltIn);
  const custom = filtered.filter(m => !m.isBuiltIn);

  const currentModel = state.activeSessionId
    ? (state.sessionModels.get(state.activeSessionId) ?? state.selectedModel)
    : state.selectedModel;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
    >
      <div className="w-120 rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="border-b border-neutral-700 px-4 py-3">
          <h2 className="mb-2 text-sm font-semibold text-neutral-200">Select Model</h2>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search models…"
            className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 outline-none focus:border-neutral-400"
          />
        </div>

        {/* Model list */}
        <div className="max-h-80 overflow-y-auto py-1">
          {isLoading && (
            <p className="px-4 py-3 text-sm text-neutral-500">Loading models…</p>
          )}

          {!isLoading && filtered.length === 0 && (
            <p className="px-4 py-3 text-sm text-neutral-500">No models found.</p>
          )}

          {builtIn.length > 0 && (
            <>
              <p className="px-4 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
                Built-in
              </p>
              {builtIn.map(model => (
                <ModelRow
                  key={`${model.providerId}/${model.modelId}`}
                  model={model}
                  isActive={
                    currentModel?.providerId === model.providerId &&
                    currentModel?.modelId === model.modelId
                  }
                  onSelect={selectModel}
                />
              ))}
            </>
          )}

          {custom.length > 0 && (
            <>
              <p className="px-4 pb-1 pt-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
                Custom Providers
              </p>
              {custom.map(model => (
                <ModelRow
                  key={`${model.providerId}/${model.modelId}`}
                  model={model}
                  isActive={
                    currentModel?.providerId === model.providerId &&
                    currentModel?.modelId === model.modelId
                  }
                  onSelect={selectModel}
                />
              ))}
            </>
          )}
        </div>

        <div className="border-t border-neutral-700 px-4 py-2 text-center text-xs text-neutral-600">
          Esc to close · Custom models from ~/.pi/agent/models.json
        </div>
      </div>
    </div>
  );
}

interface ModelRowProps {
  model: ModelInfo;
  isActive: boolean;
  onSelect: (model: ModelInfo) => void;
}

function ModelRow({ model, isActive, onSelect }: ModelRowProps) {
  return (
    <button
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-neutral-800 ${isActive ? 'bg-neutral-800' : ''}`}
      onClick={() => onSelect(model)}
    >
      <div className="flex-1 min-w-0">
        <p className={`truncate text-sm font-medium ${isActive ? 'text-blue-400' : 'text-neutral-200'}`}>
          {model.modelName}
        </p>
        <p className="truncate text-xs text-neutral-500">
          {model.providerId} · {model.modelId}
        </p>
      </div>
      {isActive && (
        <span className="shrink-0 text-xs text-blue-400">✓ Active</span>
      )}
    </button>
  );
}
