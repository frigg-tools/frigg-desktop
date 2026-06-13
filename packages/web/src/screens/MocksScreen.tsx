import { useAppStore } from '../store';
import FolderTree from '../components/mocks/FolderTree';
import RuleList from '../components/mocks/RuleList';
import RuleEditor from '../components/mocks/RuleEditor';

function EditorEmptyState() {
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
      <p className="text-sm text-zinc-500">Select a mock to edit it</p>
      <p className="max-w-60 text-xs text-zinc-600">
        Matching requests are answered by Frigg without touching the upstream server
      </p>
    </div>
  );
}

export default function MocksScreen() {
  const editingRule = useAppStore((s) => s.editingRule);
  const rulesCount = useAppStore((s) => s.rules.length);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-800/80 px-4 py-2.5">
        <h1 className="font-display text-base font-semibold tracking-wide text-zinc-100">Mocks</h1>
        <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-500">
          {rulesCount}
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-60 shrink-0 border-r border-zinc-800/80">
          <FolderTree />
        </div>
        <div className="min-w-0 flex-1 border-r border-zinc-800/80">
          <RuleList />
        </div>
        <div className="w-[42%] min-w-[400px] shrink-0">
          {editingRule === null ? (
            <EditorEmptyState />
          ) : (
            <RuleEditor key={editingRule === 'new' ? 'new' : editingRule.id} rule={editingRule} />
          )}
        </div>
      </div>
    </div>
  );
}
