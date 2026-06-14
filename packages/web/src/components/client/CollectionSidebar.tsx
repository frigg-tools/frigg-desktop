import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ApiFolder, ApiRequest } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import MethodBadge from '../MethodBadge';
import EnvironmentEditor from './EnvironmentEditor';
import {
  FolderIcon,
  InlineNameInput,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  selectClass,
} from './shared';

interface FolderNode {
  folder: ApiFolder;
  children: FolderNode[];
}

function buildFolderTree(folders: ApiFolder[]): FolderNode[] {
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

interface PendingCreate {
  type: 'folder' | 'request';
  parentId: string | null;
}

function HoverActions({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover:flex">{children}</span>
  );
}

function RequestRow({
  request,
  active,
  onSelect,
  onRename,
  onDelete,
  renaming,
  confirming,
}: {
  request: ApiRequest;
  active: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  renaming: ReactNode | null;
  confirming: boolean;
}) {
  const t = useT();
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
      className={`group flex h-8 cursor-pointer items-center gap-2 pr-2 text-[13px] transition-colors ${
        active ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200'
      }`}
      style={{ paddingLeft: '10px' }}
    >
      <MethodBadge method={request.method} />
      {renaming ?? (
        <>
          <span className="min-w-0 flex-1 truncate">
            {request.name.trim().length > 0 ? request.name : t('client.tree.untitledRequest')}
          </span>
          <HoverActions>
            <button
              type="button"
              aria-label={t('action.rename')}
              onClick={(e) => {
                e.stopPropagation();
                onRename();
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
                  onDelete();
                }}
                className="rounded px-1 py-0.5 text-[10px] font-medium uppercase tracking-widest text-rose-400 transition active:scale-[0.98]"
              >
                {t('action.confirm')}
              </button>
            ) : (
              <button
                type="button"
                aria-label={t('action.delete')}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="rounded p-1 text-zinc-500 transition hover:text-rose-400 active:scale-[0.98]"
              >
                <TrashIcon />
              </button>
            )}
          </HoverActions>
        </>
      )}
    </div>
  );
}

export default function CollectionSidebar() {
  const t = useT();
  const workspaces = useAppStore((s) => s.apiWorkspaces);
  const folders = useAppStore((s) => s.apiFolders);
  const requests = useAppStore((s) => s.apiRequests);
  const environments = useAppStore((s) => s.apiEnvironments);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const selectedApiRequestId = useAppStore((s) => s.selectedApiRequestId);
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace);
  const createWorkspace = useAppStore((s) => s.createWorkspace);
  const renameWorkspace = useAppStore((s) => s.renameWorkspace);
  const deleteWorkspace = useAppStore((s) => s.deleteWorkspace);
  const createApiFolder = useAppStore((s) => s.createApiFolder);
  const renameApiFolder = useAppStore((s) => s.renameApiFolder);
  const deleteApiFolder = useAppStore((s) => s.deleteApiFolder);
  const createApiRequest = useAppStore((s) => s.createApiRequest);
  const updateApiRequest = useAppStore((s) => s.updateApiRequest);
  const deleteApiRequest = useAppStore((s) => s.deleteApiRequest);
  const selectApiRequest = useAppStore((s) => s.selectApiRequest);
  const createEnvironment = useAppStore((s) => s.createEnvironment);
  const setActiveEnvironment = useAppStore((s) => s.setActiveEnvironment);

  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [renamingWorkspace, setRenamingWorkspace] = useState(false);
  const [confirmDeleteWorkspace, setConfirmDeleteWorkspace] = useState(false);
  const [creatingEnvironment, setCreatingEnvironment] = useState(false);
  const [editingEnvironment, setEditingEnvironment] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingRequestId, setRenamingRequestId] = useState<string | null>(null);
  const [confirmFolderId, setConfirmFolderId] = useState<string | null>(null);
  const [confirmRequestId, setConfirmRequestId] = useState<string | null>(null);
  const confirmTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
    };
  }, []);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  );

  const workspaceFolders = useMemo(
    () => folders.filter((f) => f.workspaceId === activeWorkspaceId),
    [folders, activeWorkspaceId],
  );

  const workspaceEnvironments = useMemo(
    () => environments.filter((e) => e.workspaceId === activeWorkspaceId),
    [environments, activeWorkspaceId],
  );

  const activeEnvironment = useMemo(
    () => workspaceEnvironments.find((e) => e.id === activeWorkspace?.activeEnvironmentId) ?? null,
    [workspaceEnvironments, activeWorkspace],
  );

  const tree = useMemo(() => buildFolderTree(workspaceFolders), [workspaceFolders]);

  const requestsByFolder = useMemo(() => {
    const map = new Map<string | null, ApiRequest[]>();
    for (const request of requests) {
      if (request.workspaceId !== activeWorkspaceId) continue;
      const list = map.get(request.folderId) ?? [];
      list.push(request);
      map.set(request.folderId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name) || a.createdAt - b.createdAt);
    }
    return map;
  }, [requests, activeWorkspaceId]);

  const armConfirm = (set: (value: string | null) => void, id: string) => {
    set(id);
    if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
    confirmTimer.current = window.setTimeout(() => set(null), 2500);
  };

  const armWorkspaceDelete = () => {
    setConfirmDeleteWorkspace(true);
    if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
    confirmTimer.current = window.setTimeout(() => setConfirmDeleteWorkspace(false), 2500);
  };

  const indentStyle = (depth: number) => ({ paddingLeft: `${10 + depth * 14}px` });

  const renderCreateInput = (depth: number) => {
    if (!pendingCreate) return null;
    const placeholder =
      pendingCreate.type === 'folder'
        ? t('client.tree.folderNamePlaceholder')
        : t('client.tree.requestNamePlaceholder');
    return (
      <div className="flex h-8 items-center pr-2" style={indentStyle(depth)}>
        <FolderIcon className="mr-2 h-3.5 w-3.5 shrink-0 text-zinc-600" />
        <InlineNameInput
          defaultValue=""
          placeholder={placeholder}
          onCommit={(name) => {
            const target = pendingCreate;
            setPendingCreate(null);
            if (target.type === 'folder') {
              void createApiFolder(name, target.parentId).catch(() => undefined);
            } else {
              void createApiRequest(target.parentId)
                .then(() => {
                  const created = useAppStore
                    .getState()
                    .apiRequests.find((r) => r.id === useAppStore.getState().selectedApiRequestId);
                  if (created) void updateApiRequest(created.id, { name }).catch(() => undefined);
                })
                .catch(() => undefined);
            }
          }}
          onCancel={() => setPendingCreate(null)}
        />
      </div>
    );
  };

  const renderRequests = (folderId: string | null, depth: number) => {
    const list = requestsByFolder.get(folderId) ?? [];
    return list.map((request) => (
      <div key={request.id} style={{ paddingLeft: `${depth * 14}px` }}>
        <RequestRow
          request={request}
          active={request.id === selectedApiRequestId}
          onSelect={() => selectApiRequest(request.id)}
          onRename={() => setRenamingRequestId(request.id)}
          onDelete={() =>
            confirmRequestId === request.id
              ? void deleteApiRequest(request.id).catch(() => undefined)
              : armConfirm(setConfirmRequestId, request.id)
          }
          confirming={confirmRequestId === request.id}
          renaming={
            renamingRequestId === request.id ? (
              <InlineNameInput
                defaultValue={request.name}
                placeholder={t('client.tree.requestNamePlaceholder')}
                onCommit={(name) => {
                  setRenamingRequestId(null);
                  void updateApiRequest(request.id, { name }).catch(() => undefined);
                }}
                onCancel={() => setRenamingRequestId(null)}
              />
            ) : null
          }
        />
      </div>
    ));
  };

  const renderFolder = (node: FolderNode, depth: number): ReactNode => {
    const { folder } = node;
    const confirming = confirmFolderId === folder.id;
    return (
      <div key={folder.id}>
        <div
          className="group flex h-8 items-center gap-2 pr-2 text-[13px] text-zinc-300 transition-colors hover:bg-zinc-900/60"
          style={indentStyle(depth)}
        >
          <FolderIcon className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
          {renamingFolderId === folder.id ? (
            <InlineNameInput
              defaultValue={folder.name}
              placeholder={t('client.tree.folderNamePlaceholder')}
              onCommit={(name) => {
                setRenamingFolderId(null);
                void renameApiFolder(folder.id, name).catch(() => undefined);
              }}
              onCancel={() => setRenamingFolderId(null)}
            />
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
              <HoverActions>
                <button
                  type="button"
                  aria-label={t('client.tree.newRequest')}
                  onClick={() => setPendingCreate({ type: 'request', parentId: folder.id })}
                  className="rounded p-1 text-zinc-500 transition hover:text-emerald-400 active:scale-[0.98]"
                >
                  <PlusIcon className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label={t('client.tree.newFolder')}
                  onClick={() => setPendingCreate({ type: 'folder', parentId: folder.id })}
                  className="rounded p-1 text-zinc-500 transition hover:text-emerald-400 active:scale-[0.98]"
                >
                  <FolderIcon className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label={t('action.rename')}
                  onClick={() => setRenamingFolderId(folder.id)}
                  className="rounded p-1 text-zinc-500 transition hover:text-zinc-200 active:scale-[0.98]"
                >
                  <PencilIcon />
                </button>
                {confirming ? (
                  <button
                    type="button"
                    onClick={() => void deleteApiFolder(folder.id).catch(() => undefined)}
                    className="rounded px-1 py-0.5 text-[10px] font-medium uppercase tracking-widest text-rose-400 transition active:scale-[0.98]"
                  >
                    {t('action.confirm')}
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label={t('action.delete')}
                    onClick={() => armConfirm(setConfirmFolderId, folder.id)}
                    className="rounded p-1 text-zinc-500 transition hover:text-rose-400 active:scale-[0.98]"
                  >
                    <TrashIcon />
                  </button>
                )}
              </HoverActions>
            </>
          )}
        </div>
        {pendingCreate && pendingCreate.parentId === folder.id
          ? renderCreateInput(depth + 1)
          : null}
        {node.children.map((child) => renderFolder(child, depth + 1))}
        {renderRequests(folder.id, depth + 1)}
      </div>
    );
  };

  if (!activeWorkspace) {
    return (
      <div className="dot-grid flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <FolderIcon className="h-8 w-8 text-zinc-700" />
        <p className="text-sm text-zinc-500">{t('client.empty.noWorkspace')}</p>
        <button
          type="button"
          onClick={() => setCreatingWorkspace(true)}
          className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98]"
        >
          <PlusIcon />
          {t('client.workspace.create')}
        </button>
        {creatingWorkspace ? (
          <div className="w-full max-w-56">
            <InlineNameInput
              defaultValue=""
              placeholder={t('client.workspace.namePlaceholder')}
              onCommit={(name) => {
                setCreatingWorkspace(false);
                void createWorkspace(name).catch(() => undefined);
              }}
              onCancel={() => setCreatingWorkspace(false)}
              className="w-full rounded border border-emerald-500/40 bg-zinc-900/80 px-2 py-1.5 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
        ) : null}
      </div>
    );
  }

  const rootRequests = renderRequests(null, 0);
  const treeEmpty =
    tree.length === 0 && (requestsByFolder.get(null)?.length ?? 0) === 0 && !pendingCreate;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-zinc-800/80 px-3 py-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              {t('client.workspace.label')}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label={t('action.rename')}
                onClick={() => setRenamingWorkspace(true)}
                className="rounded p-1 text-zinc-500 transition hover:text-zinc-200 active:scale-[0.98]"
              >
                <PencilIcon />
              </button>
              {confirmDeleteWorkspace ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDeleteWorkspace(false);
                    void deleteWorkspace(activeWorkspace.id).catch(() => undefined);
                  }}
                  className="rounded px-1 py-0.5 text-[10px] font-medium uppercase tracking-widest text-rose-400 transition active:scale-[0.98]"
                >
                  {t('action.confirm')}
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={t('action.delete')}
                  onClick={armWorkspaceDelete}
                  className="rounded p-1 text-zinc-500 transition hover:text-rose-400 active:scale-[0.98]"
                >
                  <TrashIcon />
                </button>
              )}
              <button
                type="button"
                aria-label={t('client.workspace.create')}
                onClick={() => setCreatingWorkspace(true)}
                className="rounded p-1 text-zinc-500 transition hover:text-emerald-400 active:scale-[0.98]"
              >
                <PlusIcon />
              </button>
            </div>
          </div>
          {renamingWorkspace ? (
            <InlineNameInput
              defaultValue={activeWorkspace.name}
              placeholder={t('client.workspace.namePlaceholder')}
              onCommit={(name) => {
                setRenamingWorkspace(false);
                void renameWorkspace(activeWorkspace.id, name).catch(() => undefined);
              }}
              onCancel={() => setRenamingWorkspace(false)}
              className="w-full rounded border border-emerald-500/40 bg-zinc-900/80 px-2 py-1.5 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          ) : (
            <select
              value={activeWorkspace.id}
              onChange={(e) => setActiveWorkspace(e.target.value)}
              aria-label={t('client.workspace.label')}
              className={`${selectClass} w-full`}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          )}
          {creatingWorkspace ? (
            <div className="mt-1.5">
              <InlineNameInput
                defaultValue=""
                placeholder={t('client.workspace.namePlaceholder')}
                onCommit={(name) => {
                  setCreatingWorkspace(false);
                  void createWorkspace(name).catch(() => undefined);
                }}
                onCancel={() => setCreatingWorkspace(false)}
                className="w-full rounded border border-emerald-500/40 bg-zinc-900/80 px-2 py-1.5 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          ) : null}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              {t('client.env.label')}
            </span>
            <div className="flex items-center gap-0.5">
              {activeEnvironment ? (
                <button
                  type="button"
                  onClick={() => setEditingEnvironment(true)}
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500 transition hover:text-emerald-400 active:scale-[0.98]"
                >
                  {t('client.env.edit')}
                </button>
              ) : null}
              <button
                type="button"
                aria-label={t('client.env.create')}
                onClick={() => setCreatingEnvironment(true)}
                className="rounded p-1 text-zinc-500 transition hover:text-emerald-400 active:scale-[0.98]"
              >
                <PlusIcon />
              </button>
            </div>
          </div>
          <select
            value={activeWorkspace.activeEnvironmentId ?? ''}
            onChange={(e) =>
              void setActiveEnvironment(e.target.value === '' ? null : e.target.value).catch(
                () => undefined,
              )
            }
            aria-label={t('client.env.label')}
            className={`${selectClass} w-full`}
          >
            <option value="">{t('client.env.none')}</option>
            {workspaceEnvironments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </select>
          {creatingEnvironment ? (
            <div className="mt-1.5">
              <InlineNameInput
                defaultValue=""
                placeholder={t('client.env.namePlaceholder')}
                onCommit={(name) => {
                  setCreatingEnvironment(false);
                  void createEnvironment(name).catch(() => undefined);
                }}
                onCancel={() => setCreatingEnvironment(false)}
                className="w-full rounded border border-emerald-500/40 bg-zinc-900/80 px-2 py-1.5 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          {t('client.tree.label')}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t('client.tree.newFolder')}
            onClick={() => setPendingCreate({ type: 'folder', parentId: null })}
            className="rounded border border-zinc-800 bg-zinc-900/60 p-1 text-zinc-400 transition hover:border-emerald-500/30 hover:text-emerald-400 active:scale-[0.98]"
          >
            <FolderIcon className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label={t('client.tree.newRequest')}
            onClick={() => setPendingCreate({ type: 'request', parentId: null })}
            className="rounded border border-zinc-800 bg-zinc-900/60 p-1 text-zinc-400 transition hover:border-emerald-500/30 hover:text-emerald-400 active:scale-[0.98]"
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {treeEmpty ? (
          <div className="dot-grid flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-xs text-zinc-600">{t('client.tree.empty')}</p>
            <button
              type="button"
              onClick={() => setPendingCreate({ type: 'request', parentId: null })}
              className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98]"
            >
              <PlusIcon />
              {t('client.tree.newRequest')}
            </button>
          </div>
        ) : (
          <>
            {tree.map((node) => renderFolder(node, 0))}
            {rootRequests}
            {pendingCreate && pendingCreate.parentId === null ? renderCreateInput(0) : null}
          </>
        )}
      </div>

      {editingEnvironment && activeEnvironment ? (
        <EnvironmentEditor
          environment={activeEnvironment}
          onClose={() => setEditingEnvironment(false)}
        />
      ) : null}
    </div>
  );
}
