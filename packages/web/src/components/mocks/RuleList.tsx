import { useMemo } from 'react';
import type { MockRule } from '@frigg/shared';
import { useAppStore } from '../../store';
import * as api from '../../api/client';

function EnabledSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`relative h-4 w-7 shrink-0 rounded-full border transition-colors ${
        enabled ? 'border-emerald-500/40 bg-emerald-500/25' : 'border-zinc-700 bg-zinc-800/80'
      }`}
    >
      <span
        className={`absolute left-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full transition-transform ${
          enabled ? 'translate-x-[15px] bg-emerald-400' : 'translate-x-[3px] bg-zinc-500'
        }`}
      />
    </button>
  );
}

function NewMockButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="h-3 w-3"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      New mock
    </button>
  );
}

function RuleRow({
  rule,
  active,
  onOpen,
  onToggle,
}: {
  rule: MockRule;
  active: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const method = (rule.matcher.method ?? 'ANY').toUpperCase();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`flex cursor-pointer items-center gap-2.5 border-b border-zinc-800/40 px-3 py-2 transition-colors ${
        active ? 'bg-emerald-500/5' : 'hover:bg-zinc-900/50'
      }`}
    >
      <EnabledSwitch enabled={rule.enabled} onToggle={onToggle} />
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-[13px] font-medium ${
            rule.enabled ? 'text-zinc-200' : 'text-zinc-500'
          }`}
        >
          {rule.name}
        </p>
        <p className="truncate font-mono text-[11px] text-zinc-500">
          {method} {rule.matcher.pathPattern}
        </p>
      </div>
      {rule.hitCount > 0 ? (
        <span className="shrink-0 rounded border border-zinc-800 px-1.5 py-px font-mono text-[10px] tabular-nums text-zinc-500">
          x{rule.hitCount}
        </span>
      ) : null}
    </div>
  );
}

function RuleListEmptyState({ inFolder, onNew }: { inFolder: boolean; onNew: () => void }) {
  return (
    <div className="dot-grid flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-zinc-700">
        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
      </svg>
      <p className="text-sm text-zinc-500">{inFolder ? 'No mocks in this folder' : 'No mocks yet'}</p>
      <p className="max-w-56 text-xs text-zinc-600">
        Create one here, or hit Create mock on any captured exchange
      </p>
      <NewMockButton onClick={onNew} />
    </div>
  );
}

export default function RuleList() {
  const rules = useAppStore((s) => s.rules);
  const folders = useAppStore((s) => s.folders);
  const selectedFolderId = useAppStore((s) => s.selectedFolderId);
  const editingRule = useAppStore((s) => s.editingRule);
  const openRuleEditor = useAppStore((s) => s.openRuleEditor);
  const refreshMocks = useAppStore((s) => s.refreshMocks);

  const visible = useMemo(() => {
    const scoped =
      selectedFolderId === null ? rules : rules.filter((rule) => rule.folderId === selectedFolderId);
    return [...scoped].sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
  }, [rules, selectedFolderId]);

  const folderName =
    selectedFolderId === null
      ? 'All mocks'
      : (folders.find((folder) => folder.id === selectedFolderId)?.name ?? 'Folder');

  const editingRuleId = editingRule !== null && editingRule !== 'new' ? editingRule.id : null;

  const toggleEnabled = (rule: MockRule) => {
    void api
      .updateRule(rule.id, { enabled: !rule.enabled })
      .then(() => refreshMocks())
      .catch(() => undefined);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[10px] uppercase tracking-widest text-zinc-500">
            {folderName}
          </span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
            {visible.length}
          </span>
        </div>
        <NewMockButton onClick={() => openRuleEditor('new')} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <RuleListEmptyState
            inFolder={selectedFolderId !== null}
            onNew={() => openRuleEditor('new')}
          />
        ) : (
          visible.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              active={rule.id === editingRuleId}
              onOpen={() => openRuleEditor(rule)}
              onToggle={() => toggleEnabled(rule)}
            />
          ))
        )}
      </div>
    </div>
  );
}
