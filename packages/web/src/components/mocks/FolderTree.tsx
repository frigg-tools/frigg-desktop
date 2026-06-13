import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MockFolder } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import * as api from '../../api/client';

interface FolderNode {
  folder: MockFolder;
  children: FolderNode[];
}

export function flattenFolderTree(folders: MockFolder[]): Array<{ folder: MockFolder; depth: number }> {
  const flat: Array<{ folder: MockFolder; depth: number }> = [];
  const walk = (nodes: FolderNode[], depth: number) => {
    for (const node of nodes) {
      flat.push({ folder: node.folder, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(buildFolderTree(folders), 0);
  return flat;
}

function buildFolderTree(folders: MockFolder[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>(
    folders.map((folder) => [folder.id, { folder, children: [] }]),
  );
  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.folder.parentId === null ? undefined : nodes.get(node.folder.parentId);
    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const byName = (a: FolderNode, b: FolderNode) =>
    a.folder.name.localeCompare(b.folder.name) || a.folder.createdAt - b.folder.createdAt;
  const sortDeep = (list: FolderNode[]) => {
    list.sort(byName);
    for (const node of list) sortDeep(node.children);
  };
  sortDeep(roots);
  return roots;
}

function FolderIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 5.5h5l2 2.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function LayersIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13.5 9 5 9-5" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
    >
      <path d="M17 3.5 20.5 7 8 19.5l-4.5 1 1-4.5L17 3.5Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
    >
      <path d="M4 7h16M9 7V4.5h6V7m-9.5 0 1 13.5h9l1-13.5" />
    </svg>
  );
}

interface InlineNameInputProps {
  defaultValue: string;
  placeholder: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

function InlineNameInput({ defaultValue, placeholder, onCommit, onCancel }: InlineNameInputProps) {
  const [value, setValue] = useState(defaultValue);

  const commit = () => {
    const name = value.trim();
    if (name.length > 0) {
      onCommit(name);
    } else {
      onCancel();
    }
  };

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onCancel();
      }}
      placeholder={placeholder}
      spellCheck={false}
      className="min-w-0 flex-1 rounded border border-emerald-500/40 bg-zinc-900/80 px-1.5 py-0.5 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
    />
  );
}

interface TreeRowProps {
  depth: number;
  active: boolean;
  onSelect: () => void;
  icon: ReactNode;
  children: ReactNode;
}

function TreeRow({ depth, active, onSelect, icon, children }: TreeRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{ paddingLeft: `${10 + depth * 14}px` }}
      className={`group flex h-8 cursor-pointer items-center gap-2 pr-2 text-[13px] transition-colors ${
        active ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200'
      }`}
    >
      {icon}
      {children}
    </div>
  );
}

export default function FolderTree() {
  const t = useT();
  const folders = useAppStore((s) => s.folders);
  const rules = useAppStore((s) => s.rules);
  const selectedFolderId = useAppStore((s) => s.selectedFolderId);
  const selectFolder = useAppStore((s) => s.selectFolder);
  const refreshMocks = useAppStore((s) => s.refreshMocks);

  const [creatingIn, setCreatingIn] = useState<{ parentId: string | null } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
    };
  }, []);

  const tree = useMemo(() => buildFolderTree(folders), [folders]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const rule of rules) {
      if (rule.folderId !== null) {
        map.set(rule.folderId, (map.get(rule.folderId) ?? 0) + 1);
      }
    }
    return map;
  }, [rules]);

  const armDeleteConfirm = (id: string) => {
    setConfirmDeleteId(id);
    if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
    confirmTimer.current = window.setTimeout(() => setConfirmDeleteId(null), 2500);
  };

  const commitCreate = (name: string, parentId: string | null) => {
    setCreatingIn(null);
    void api
      .createFolder(name, parentId)
      .then(() => refreshMocks())
      .catch(() => undefined);
  };

  const commitRename = (id: string, name: string) => {
    setRenamingId(null);
    void api
      .updateFolder(id, { name })
      .then(() => refreshMocks())
      .catch(() => undefined);
  };

  const deleteFolder = (id: string) => {
    setConfirmDeleteId(null);
    if (selectedFolderId === id) selectFolder(null);
    void api
      .deleteFolder(id)
      .then(() => refreshMocks())
      .catch(() => undefined);
  };

  const renderCreateInput = (parentId: string | null, depth: number) => (
    <div className="flex h-8 items-center pr-2" style={{ paddingLeft: `${10 + depth * 14}px` }}>
      <FolderIcon className="mr-2 h-3.5 w-3.5 shrink-0 text-zinc-600" />
      <InlineNameInput
        defaultValue=""
        placeholder={t('mocks.folders.namePlaceholder')}
        onCommit={(name) => commitCreate(name, parentId)}
        onCancel={() => setCreatingIn(null)}
      />
    </div>
  );

  const renderNode = (node: FolderNode, depth: number): ReactNode => {
    const { folder } = node;
    const active = selectedFolderId === folder.id;
    const count = counts.get(folder.id) ?? 0;
    const confirming = confirmDeleteId === folder.id;
    return (
      <div key={folder.id}>
        <TreeRow
          depth={depth}
          active={active}
          onSelect={() => selectFolder(folder.id)}
          icon={
            <FolderIcon
              className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-emerald-400' : 'text-zinc-600'}`}
            />
          }
        >
          {renamingId === folder.id ? (
            <InlineNameInput
              defaultValue={folder.name}
              placeholder={t('mocks.folders.namePlaceholder')}
              onCommit={(name) => commitRename(folder.id, name)}
              onCancel={() => setRenamingId(null)}
            />
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1">
                <span className="font-mono text-[10px] tabular-nums text-zinc-600 group-hover:hidden">
                  {count > 0 ? count : ''}
                </span>
                <span className="hidden items-center gap-0.5 group-hover:flex">
                  <button
                    type="button"
                    aria-label={t('mocks.folders.rename')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingId(folder.id);
                    }}
                    className="rounded p-1 text-zinc-500 transition hover:text-zinc-200 active:scale-[0.98]"
                  >
                    <PencilIcon />
                  </button>
                  {confirming ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFolder(folder.id);
                      }}
                      className="rounded px-1 py-0.5 text-[10px] font-medium uppercase tracking-widest text-rose-400 transition active:scale-[0.98]"
                    >
                      {t('action.confirm')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={t('mocks.folders.delete')}
                      onClick={(e) => {
                        e.stopPropagation();
                        armDeleteConfirm(folder.id);
                      }}
                      className="rounded p-1 text-zinc-500 transition hover:text-rose-400 active:scale-[0.98]"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </span>
              </span>
            </>
          )}
        </TreeRow>
        {node.children.map((child) => renderNode(child, depth + 1))}
        {creatingIn !== null && creatingIn.parentId === folder.id
          ? renderCreateInput(folder.id, depth + 1)
          : null}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">{t('mocks.folders.label')}</span>
        <button
          type="button"
          aria-label={t('mocks.folders.new')}
          onClick={() => setCreatingIn({ parentId: selectedFolderId })}
          className="rounded border border-zinc-800 bg-zinc-900/60 p-1 text-zinc-400 transition hover:border-emerald-500/30 hover:text-emerald-400 active:scale-[0.98]"
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
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        <TreeRow
          depth={0}
          active={selectedFolderId === null}
          onSelect={() => selectFolder(null)}
          icon={
            <LayersIcon
              className={`h-3.5 w-3.5 shrink-0 ${
                selectedFolderId === null ? 'text-emerald-400' : 'text-zinc-600'
              }`}
            />
          }
        >
          <span className="min-w-0 flex-1 truncate">{t('mocks.folders.allMocks')}</span>
          <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
            {rules.length > 0 ? rules.length : ''}
          </span>
        </TreeRow>
        {tree.map((node) => renderNode(node, 0))}
        {creatingIn !== null && creatingIn.parentId === null ? renderCreateInput(null, 0) : null}
      </div>
    </div>
  );
}
