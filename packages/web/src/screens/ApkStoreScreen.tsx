import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  APK_STORE_MAX_FILE_BYTES,
  APK_STORE_COMPRESSION,
  ANDROID_DEVICE_STATE,
  type ApkStoreEntry,
} from '@frigg/shared';
import { useT } from '../i18n';
import {
  deleteApk,
  getApkStore,
  importApk,
  installApk,
} from '../api/client';
import { useAppStore } from '../store';

type DialogState = { type: 'import' } | { type: 'delete'; entry: ApkStoreEntry } | null;
type RowNotice = { tone: 'success' | 'error'; message: string };

function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : 'Unknown error';
}

export default function ApkStoreScreen() {
  const t = useT();
  const devices = useAppStore((state) => state.devices);
  const refreshDevices = useAppStore((state) => state.refreshDevices);
  const locale = useAppStore((state) => state.locale);
  const availableDevices = (devices?.android ?? []).filter((device) => device.state === ANDROID_DEVICE_STATE.connected);
  const [entries, setEntries] = useState<ApkStoreEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeInstallId, setActiveInstallId] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [selectedSerials, setSelectedSerials] = useState<Record<string, string>>({});
  const [rowNotices, setRowNotices] = useState<Record<string, RowNotice>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setError('');
    try {
      const snapshot = await getApkStore();
      setEntries(snapshot.entries);
    } catch (loadError) {
      setError(t('apkStore.loadFailed', { error: errorMessage(loadError) }));
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const refresh = async () => {
    await Promise.all([
      load(),
      refreshDevices().catch((deviceError: unknown) => {
        setError(t('apkStore.refreshFailed', { error: errorMessage(deviceError) }));
      }),
    ]);
  };

  useEffect(() => {
    void Promise.all([load(true), refreshDevices().catch((deviceError: unknown) => {
      setError(t('apkStore.refreshFailed', { error: errorMessage(deviceError) }));
    })]);
  }, []);

  const pickFile = (selected: File | undefined) => {
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.apk')) {
      setError(t('apkStore.invalidExtension'));
      return;
    }
    if (selected.size > APK_STORE_MAX_FILE_BYTES) {
      setError(t('apkStore.fileTooLarge'));
      return;
    }
    setError('');
    setFile(selected);
    setName(selected.name);
    setDescription('');
    setDialog({ type: 'import' });
  };

  const submitImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    setSaving(true);
    setUploadProgress(0);
    setError('');
    try {
      await importApk(file, { name, description }, setUploadProgress);
      setDialog(null);
      setFile(null);
      setName('');
      setDescription('');
      await load();
    } catch (uploadError) {
      setError(t('apkStore.importFailed', { error: errorMessage(uploadError) }));
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  const confirmDelete = async () => {
    if (dialog?.type !== 'delete') return;
    const entry = dialog.entry;
    setDeleting(true);
    setError('');
    try {
      await deleteApk(entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setDialog(null);
      setRowNotices((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
    } catch (deleteError) {
      setError(t('apkStore.deleteFailed', { error: errorMessage(deleteError) }));
    } finally {
      setDeleting(false);
    }
  };

  const runInstall = async (entry: ApkStoreEntry) => {
    const serial = selectedSerials[entry.id] ?? availableDevices[0]?.serial;
    if (!serial) return;
    setInstallingId(entry.id);
    setRowNotices((current) => ({ ...current, [entry.id]: { tone: 'success', message: t('apkStore.installing') } }));
    try {
      const result = await installApk(entry.id, serial);
      setRowNotices((current) => ({
        ...current,
        [entry.id]: {
          tone: 'success',
          message: t('apkStore.installed', { serial: result.serial, duration: formatDuration(result.durationMs) }),
        },
      }));
      setActiveInstallId(null);
    } catch (installError) {
      setRowNotices((current) => ({
        ...current,
        [entry.id]: { tone: 'error', message: t('apkStore.installationFailed', { error: errorMessage(installError) }) },
      }));
    } finally {
      setInstallingId(null);
    }
  };

  const originalBytes = entries.reduce((total, entry) => total + entry.originalSizeBytes, 0);
  const storedBytes = entries.reduce((total, entry) => total + entry.storedSizeBytes, 0);
  const savedBytes = Math.max(0, originalBytes - storedBytes);
  const savedPercent = originalBytes > 0 ? Math.round((savedBytes / originalBytes) * 100) : 0;
  const numberLocale = locale === 'pt' ? 'pt-BR' : 'en-US';

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="shrink-0 border-b border-zinc-800/80">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center border border-zinc-800 bg-zinc-900 text-emerald-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
              <path d="M5 3.5h9l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20v-15A1.5 1.5 0 0 1 6.5 3.5Z" />
              <path d="M14 3.5V9h5M8 14h8M8 17h5" />
            </svg>
          </div>
          <div className="min-w-[12rem] flex-1">
            <h1 className="font-display text-lg font-semibold tracking-wide text-zinc-100">{t('apkStore.title')}</h1>
            <p className="text-xs text-zinc-500">{t('apkStore.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center justify-center rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
          >
            {t('apkStore.refresh')}
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-400 px-3.5 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          >
            <span aria-hidden="true" className="text-lg leading-none">+</span>
            {t('apkStore.import')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".apk,application/vnd.android.package-archive"
            className="sr-only"
            aria-label={t('apkStore.apkFile')}
            onChange={(event) => {
              pickFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
        </div>
        <dl className="flex flex-wrap items-center border-t border-zinc-900 px-5 py-2.5 text-xs">
          <div className="mr-6 flex items-baseline gap-2">
            <dt className="text-zinc-500">{t('apkStore.count', { count: entries.length })}</dt>
          </div>
          <div className="mr-6 flex items-baseline gap-2 border-l border-zinc-800 pl-5">
            <dt className="text-zinc-600">{t('apkStore.original')}</dt>
            <dd className="font-mono text-zinc-300">{formatBytes(originalBytes, numberLocale)}</dd>
          </div>
          <div className="mr-6 flex items-baseline gap-2 border-l border-zinc-800 pl-5">
            <dt className="text-zinc-600">{t('apkStore.stored')}</dt>
            <dd className="font-mono text-zinc-300">{formatBytes(storedBytes, numberLocale)}</dd>
          </div>
          <div className="flex items-baseline gap-2 border-l border-zinc-800 pl-5">
            <dt className="text-zinc-600">{t('apkStore.saved')}</dt>
            <dd className="font-mono text-emerald-300">{formatBytes(savedBytes, numberLocale)} ({savedPercent}%)</dd>
          </div>
        </dl>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        {error ? <p role="alert" className="mt-4 border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p> : null}
        {loading ? (
          <p className="py-12 text-center text-sm text-zinc-500">{t('apkStore.loading')}</p>
        ) : entries.length === 0 ? (
          <div className="mx-auto flex max-w-lg flex-col items-start py-20 text-left">
            <span className="mb-4 h-px w-12 bg-emerald-400" />
            <h2 className="font-display text-xl font-semibold text-zinc-100">{t('apkStore.emptyTitle')}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">{t('apkStore.emptyBody')}</p>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="mt-5 rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-emerald-400/60 hover:text-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
            >
              {t('apkStore.import')}
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/80">
            {entries.map((entry) => {
              const smallerPercent = entry.originalSizeBytes > 0
                ? Math.max(0, Math.round((1 - entry.storedSizeBytes / entry.originalSizeBytes) * 100))
                : 0;
              const notice = rowNotices[entry.id];
              const installOpen = activeInstallId === entry.id;
              const installing = installingId === entry.id;
              return (
                <li key={entry.id} className="py-4 first:pt-5">
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h2 className="break-all text-sm font-semibold text-zinc-100">{entry.name}</h2>
                        <span className="font-mono text-[11px] text-zinc-500">{entry.fileName}</span>
                      </div>
                      <p className="mt-1 max-w-3xl whitespace-pre-wrap text-sm leading-5 text-zinc-400">
                        {entry.description || <span className="italic text-zinc-600">{t('apkStore.noDescription')}</span>}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                        <span>{t('apkStore.original')}: <span className="font-mono text-zinc-300">{formatBytes(entry.originalSizeBytes, numberLocale)}</span></span>
                        <span>{t('apkStore.stored')}: <span className="font-mono text-zinc-300">{formatBytes(entry.storedSizeBytes, numberLocale)}</span></span>
                        <span className={entry.compression === APK_STORE_COMPRESSION.gzip ? 'text-emerald-300' : 'text-zinc-600'}>
                          {entry.compression === APK_STORE_COMPRESSION.gzip ? t('apkStore.compressed', { percent: smallerPercent }) : t('apkStore.originalStored')}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveInstallId(installOpen ? null : entry.id);
                          setRowNotices((current) => {
                            const next = { ...current };
                            delete next[entry.id];
                            return next;
                          });
                        }}
                        disabled={installing}
                        className="rounded-md bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60"
                      >
                        {installing ? t('apkStore.installing') : t('apkStore.install')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDialog({ type: 'delete', entry })}
                        disabled={installing}
                        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
                      >
                        {t('apkStore.delete')}
                      </button>
                    </div>
                  </div>
                  {installOpen ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-l-2 border-emerald-400/50 pl-3">
                      <label className="text-xs text-zinc-500" htmlFor={`apk-device-${entry.id}`}>{t('apkStore.installTo')}</label>
                      <select
                        id={`apk-device-${entry.id}`}
                        value={selectedSerials[entry.id] ?? availableDevices[0]?.serial ?? ''}
                        onChange={(event) => setSelectedSerials((current) => ({ ...current, [entry.id]: event.currentTarget.value }))}
                        disabled={installing || availableDevices.length === 0}
                        className="min-w-56 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200"
                      >
                        {availableDevices.length === 0 ? (
                          <option value="">{t('apkStore.selectDevice')}</option>
                        ) : availableDevices.map((device) => (
                          <option key={device.serial} value={device.serial}>
                            {device.avdName ?? device.model} · {device.serial}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void runInstall(entry)}
                        disabled={installing || availableDevices.length === 0}
                        className="rounded-md border border-emerald-400/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {installing ? t('apkStore.installing') : t('apkStore.installNow')}
                      </button>
                      <button type="button" onClick={() => setActiveInstallId(null)} disabled={installing} className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">
                        {t('apkStore.cancel')}
                      </button>
                      {availableDevices.length === 0 ? <span className="text-xs text-amber-300">{t('apkStore.noDevices')}</span> : null}
                    </div>
                  ) : null}
                  {notice ? (
                    <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`mt-2 text-xs ${notice.tone === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {notice.message}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="sr-only" aria-live="polite" />

      {dialog?.type === 'import' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="apk-import-title"
            onSubmit={(event) => void submitImport(event)}
            className="w-full max-w-lg border border-zinc-700 bg-zinc-950 p-5 shadow-xl shadow-black/40"
          >
            <h2 id="apk-import-title" className="font-display text-lg font-semibold text-zinc-100">{t('apkStore.importTitle')}</h2>
            {file ? (
              <div className="mt-4 flex items-baseline justify-between gap-3 border-y border-zinc-800 py-2 text-xs">
                <span className="min-w-0 break-all font-mono text-zinc-300">{file.name}</span>
                <span className="shrink-0 text-zinc-500">{formatBytes(file.size, numberLocale)}</span>
              </div>
            ) : null}
            <label className="mt-4 block text-xs font-medium text-zinc-400" htmlFor="apk-name">{t('apkStore.name')}</label>
            <input
              id="apk-name"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder={t('apkStore.namePlaceholder')}
              required
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
            <label className="mt-4 block text-xs font-medium text-zinc-400" htmlFor="apk-description">{t('apkStore.description')}</label>
            <textarea
              id="apk-description"
              value={description}
              maxLength={2_000}
              onChange={(event) => setDescription(event.currentTarget.value)}
              placeholder={t('apkStore.descriptionPlaceholder')}
              rows={3}
              className="mt-1 w-full resize-y rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
            <p className="mt-2 text-xs leading-5 text-zinc-500">{t('apkStore.maxSize')}</p>
            {saving ? (
              <div className="mt-3" role="status" aria-live="polite">
                <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
                  <span>
                    {uploadProgress === null ? t('apkStore.uploadingUnknown') : uploadProgress < 100 ? t('apkStore.uploading', { percent: uploadProgress }) : t('apkStore.saving')}
                  </span>
                  {uploadProgress !== null ? <span className="font-mono">{uploadProgress}%</span> : null}
                </div>
                <div className="h-1 overflow-hidden bg-zinc-800">
                  <div className={`h-full bg-emerald-400 transition-[width] ${uploadProgress === null ? 'w-1/3 animate-pulse' : ''}`} style={uploadProgress === null ? undefined : { width: `${uploadProgress}%` }} />
                </div>
              </div>
            ) : null}
            {error ? <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)} disabled={saving} className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40">
                {t('apkStore.cancel')}
              </button>
              <button type="submit" disabled={saving || !file || !name.trim()} className="rounded-md bg-emerald-400 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-50">
                {saving ? t('apkStore.saving') : t('apkStore.save')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {dialog?.type === 'delete' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
          <div role="alertdialog" aria-modal="true" aria-labelledby="apk-delete-title" className="w-full max-w-md border border-zinc-700 bg-zinc-950 p-5 shadow-xl shadow-black/40">
            <h2 id="apk-delete-title" className="font-display text-lg font-semibold text-zinc-100">{t('apkStore.deleteTitle')}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{t('apkStore.deleteBody', { name: dialog.entry.name })}</p>
            {error ? <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)} disabled={deleting} className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40">
                {t('apkStore.keep')}
              </button>
              <button type="button" onClick={() => void confirmDelete()} disabled={deleting} className="rounded-md bg-rose-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-400 disabled:cursor-wait disabled:opacity-50">
                {deleting ? t('apkStore.saving') : t('apkStore.deleteConfirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
