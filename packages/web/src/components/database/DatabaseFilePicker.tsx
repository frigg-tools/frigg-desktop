import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import { formatSize } from './size';

export default function DatabaseFilePicker() {
  const t = useT();
  const dbFiles = useAppStore((s) => s.dbFiles);
  const dbFileRef = useAppStore((s) => s.dbFileRef);
  const openDbFile = useAppStore((s) => s.openDbFile);

  return (
    <select
      value={dbFileRef ?? ''}
      onChange={(e) => {
        if (e.target.value) void openDbFile(e.target.value).catch(() => undefined);
      }}
      disabled={dbFiles.length === 0}
      className="max-w-[18rem] rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="">{t('database.file.placeholder')}</option>
      {dbFiles.map((file) => (
        <option key={file.ref} value={file.ref}>
          {file.name} · {formatSize(file.sizeBytes)}
        </option>
      ))}
    </select>
  );
}
