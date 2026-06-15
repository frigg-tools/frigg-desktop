import { useAppStore } from '../store';
import { useT } from '../i18n';
import FolderTree from '../components/mocks/FolderTree';
import RuleList from '../components/mocks/RuleList';
import RuleEditor from '../components/mocks/RuleEditor';
import { ResizeHandle, useResizable } from '../components/ResizeHandle';

function EditorEmptyState() {
  const t = useT();
  return (
    <div className="dot-grid flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-8 w-8 text-zinc-700"
      >
        <path d="M17 3.5 20.5 7 8 19.5l-4.5 1 1-4.5L17 3.5Z" />
      </svg>
      <p className="text-sm text-zinc-500">{t('mocks.editor.emptyTitle')}</p>
      <p className="max-w-60 text-xs text-zinc-600">{t('mocks.editor.emptyHint')}</p>
    </div>
  );
}

export default function MocksScreen() {
  const t = useT();
  const editingRule = useAppStore((s) => s.editingRule);
  const draftId = useAppStore((s) => s.draftFromExchange?.id ?? null);
  const rulesCount = useAppStore((s) => s.rules.length);

  const tree = useResizable('mocks.tree', 240, { axis: 'x', min: 160, max: 420 });
  const editor = useResizable('mocks.editor', 460, { axis: 'x', min: 320, max: 900, invert: true });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-800/80 px-4 py-2.5">
        <h1 className="font-display text-base font-semibold tracking-wide text-zinc-100">{t('mocks.title')}</h1>
        <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-500">
          {rulesCount}
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div style={{ width: tree.size }} className="shrink-0 border-r border-zinc-800/80">
          <FolderTree />
        </div>
        <ResizeHandle axis="x" onPointerDown={tree.onPointerDown} />
        <div className="min-w-0 flex-1 border-r border-zinc-800/80">
          <RuleList />
        </div>
        <ResizeHandle axis="x" onPointerDown={editor.onPointerDown} />
        <div style={{ width: editor.size }} className="shrink-0">
          {editingRule === null ? (
            <EditorEmptyState />
          ) : (
            <RuleEditor
              key={editingRule === 'new' ? `new:${draftId ?? 'blank'}` : editingRule.id}
              rule={editingRule}
            />
          )}
        </div>
      </div>
    </div>
  );
}
