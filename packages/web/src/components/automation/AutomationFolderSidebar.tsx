import { useState, type FormEvent } from 'react';
import type { AutomationFolder } from '@frigg/shared';
import { useT } from '../../i18n';

export type AutomationFolderFilter = 'all' | 'unfiled' | string;

interface AutomationFolderSidebarProps {
  folders: AutomationFolder[];
  filter: AutomationFolderFilter;
  totalCount: number;
  unfiledCount: number;
  folderCounts: Record<string, number>;
  onFilterChange: (filter: AutomationFolderFilter) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
}

const selectedClass = 'bg-emerald-500/10 text-emerald-200';
const idleClass = 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100';

export default function AutomationFolderSidebar({
  folders,
  filter,
  totalCount,
  unfiledCount,
  folderCounts,
  onFilterChange,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: AutomationFolderSidebarProps) {
  const t = useT();
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'rename'; folder: AutomationFolder } | null>(null);
  const [name, setName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AutomationFolder | null>(null);
  const [busy, setBusy] = useState(false);

  const openCreate = () => {
    setName('');
    setDialog({ mode: 'create' });
  };

  const openRename = (folder: AutomationFolder) => {
    setName(folder.name);
    setDialog({ mode: 'rename', folder });
  };

  const saveFolder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || !name.trim()) return;
    setBusy(true);
    try {
      if (dialog.mode === 'create') await onCreateFolder(name.trim());
      else await onRenameFolder(dialog.folder.id, name.trim());
      setDialog(null);
    } catch {
      // Keep the dialog open so the user can correct the name or retry.
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await onDeleteFolder(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Leave the confirmation open if the request failed.
    } finally {
      setBusy(false);
    }
  };

  const folderButtonClass = (selected: boolean) => `flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${selected ? selectedClass : idleClass}`;

  return (
    <>
      <aside aria-label={t('automation.folders.title')} className="h-fit rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
        <div className="space-y-1">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => onFilterChange('all')} className={folderButtonClass(filter === 'all')}>
            <span className="truncate">{t('automation.folders.all')}</span><span className="shrink-0 text-[10px] opacity-70">{totalCount}</span>
          </button>
          <button type="button" aria-pressed={filter === 'unfiled'} onClick={() => onFilterChange('unfiled')} className={folderButtonClass(filter === 'unfiled')}>
            <span className="truncate">{t('automation.folders.unfiled')}</span><span className="shrink-0 text-[10px] opacity-70">{unfiledCount}</span>
          </button>
        </div>

        <div className="mb-2 mt-5 flex items-center justify-between gap-2 px-2.5">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{t('automation.folders.title')}</h2>
          <button type="button" onClick={openCreate} aria-label={t('automation.folders.create')} title={t('automation.folders.create')} className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">＋</button>
        </div>

        {folders.length === 0 ? (
          <p className="px-2.5 py-2 text-[11px] leading-relaxed text-zinc-600">{t('automation.folders.empty')}</p>
        ) : (
          <ul className="space-y-1">
            {[...folders].sort((a, b) => a.name.localeCompare(b.name)).map((folder) => (
              <li key={folder.id} className="group flex min-w-0 items-center gap-1">
                <button type="button" aria-pressed={filter === folder.id} onClick={() => onFilterChange(folder.id)} className={folderButtonClass(filter === folder.id)}>
                  <span className="flex min-w-0 items-center gap-2 truncate"><span aria-hidden="true" className="text-[11px] opacity-60">▰</span><span className="truncate">{folder.name}</span></span>
                  <span className="shrink-0 text-[10px] opacity-70">{folderCounts[folder.id] ?? 0}</span>
                </button>
                <button type="button" aria-label={t('automation.folders.renameLabel', { name: folder.name })} title={t('automation.folders.rename')} onClick={() => openRename(folder)} className="rounded px-1.5 py-1 text-[11px] text-zinc-600 hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">✎</button>
                <button type="button" aria-label={t('automation.folders.deleteLabel', { name: folder.name })} title={t('automation.folders.delete')} onClick={() => setDeleteTarget(folder)} className="rounded px-1.5 py-1 text-xs text-zinc-600 hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-300">×</button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialog(null); }}>
          <form onSubmit={(event) => void saveFolder(event)} role="dialog" aria-modal="true" aria-labelledby="automation-folder-dialog-title" className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <h2 id="automation-folder-dialog-title" className="font-display text-lg font-semibold text-zinc-100">{dialog.mode === 'create' ? t('automation.folders.createTitle') : t('automation.folders.renameTitle')}</h2>
            <label className="mt-4 block space-y-1.5">
              <span className="text-xs font-medium text-zinc-400">{t('automation.folders.name')}</span>
              <input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={t('automation.folders.namePlaceholder')} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/70" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setDialog(null)} className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">{t('automation.folders.cancel')}</button>
              <button type="submit" disabled={busy || !name.trim()} className="rounded-md bg-emerald-400 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-50">{busy ? t('automation.folders.saving') : t('automation.folders.save')}</button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDeleteTarget(null); }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="automation-folder-delete-title" className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <h2 id="automation-folder-delete-title" className="font-display text-lg font-semibold text-zinc-100">{t('automation.folders.deleteTitle')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t('automation.folders.deleteBody')}</p>
            <p className="mt-2 truncate text-sm font-medium text-zinc-200">{deleteTarget.name}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setDeleteTarget(null)} className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">{t('automation.folders.cancel')}</button>
              <button type="button" disabled={busy} onClick={() => void confirmDelete()} className="rounded-md bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-400 disabled:opacity-50">{busy ? t('automation.folders.deleting') : t('automation.folders.delete')}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
