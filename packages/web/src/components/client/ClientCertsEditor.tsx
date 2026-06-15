import { useEffect, useState } from 'react';
import type { ApiClientCert, ApiWorkspace } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import { CloseIcon, PlusIcon, inputClass } from './shared';

interface CertRow {
  id: string;
  host: string;
  certPath: string;
  keyPath: string;
  caPath: string;
  passphrase: string;
}

function toRows(certs: ApiClientCert[]): CertRow[] {
  return certs.map((cert) => ({
    id: cert.id,
    host: cert.host,
    certPath: cert.certPath,
    keyPath: cert.keyPath,
    caPath: cert.caPath ?? '',
    passphrase: cert.passphrase ?? '',
  }));
}

function fromRows(rows: CertRow[]): ApiClientCert[] {
  return rows
    .filter((row) => row.host.trim() !== '')
    .map((row) => {
      const caPath = row.caPath.trim();
      const passphrase = row.passphrase;
      const cert: ApiClientCert = {
        id: row.id,
        host: row.host.trim(),
        certPath: row.certPath.trim(),
        keyPath: row.keyPath.trim(),
      };
      if (caPath !== '') cert.caPath = caPath;
      if (passphrase !== '') cert.passphrase = passphrase;
      return cert;
    });
}

interface ClientCertsEditorProps {
  workspace: ApiWorkspace;
  onClose: () => void;
}

export default function ClientCertsEditor({ workspace, onClose }: ClientCertsEditorProps) {
  const t = useT();
  const updateClientCerts = useAppStore((s) => s.updateClientCerts);

  const [rows, setRows] = useState<CertRow[]>(() => toRows(workspace.clientCerts));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const updateRow = (id: string, patch: Partial<CertRow>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), host: '', certPath: '', keyPath: '', caPath: '', passphrase: '' },
    ]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  const save = () => {
    setSaving(true);
    void updateClientCerts(fromRows(rows))
      .then(() => onClose())
      .catch(() => setSaving(false));
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-6 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
          <span className="text-[13px] font-medium text-zinc-200">{t('client.certs.title')}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('action.close')}
            className="rounded p-1 text-zinc-500 transition hover:text-zinc-200"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <p className="mb-3 text-xs text-zinc-500">{t('client.certs.hint')}</p>

          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={row.host}
                    onChange={(e) => updateRow(row.id, { host: e.target.value })}
                    placeholder={t('client.certs.hostPlaceholder')}
                    spellCheck={false}
                    aria-label={t('client.certs.host')}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    aria-label={t('action.remove')}
                    className="shrink-0 rounded p-1 text-zinc-600 transition hover:text-rose-400 active:scale-[0.98]"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                      {t('client.certs.cert')}
                    </span>
                    <input
                      value={row.certPath}
                      onChange={(e) => updateRow(row.id, { certPath: e.target.value })}
                      placeholder={t('client.certs.pathPlaceholder')}
                      spellCheck={false}
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                      {t('client.certs.key')}
                    </span>
                    <input
                      value={row.keyPath}
                      onChange={(e) => updateRow(row.id, { keyPath: e.target.value })}
                      placeholder={t('client.certs.pathPlaceholder')}
                      spellCheck={false}
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                      {t('client.certs.ca')}
                    </span>
                    <input
                      value={row.caPath}
                      onChange={(e) => updateRow(row.id, { caPath: e.target.value })}
                      placeholder={t('client.certs.pathPlaceholder')}
                      spellCheck={false}
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                      {t('client.certs.passphrase')}
                    </span>
                    <input
                      type="password"
                      value={row.passphrase}
                      onChange={(e) => updateRow(row.id, { passphrase: e.target.value })}
                      spellCheck={false}
                      autoComplete="off"
                      className={inputClass}
                    />
                  </label>
                </div>
              </div>
            ))}
            {rows.length === 0 ? (
              <p className="text-xs text-zinc-600">{t('client.certs.empty')}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="mt-3 flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition hover:border-emerald-500/30 hover:text-emerald-400 active:scale-[0.98]"
          >
            <PlusIcon />
            {t('client.certs.add')}
          </button>
        </div>

        <div className="flex items-center gap-2 border-t border-zinc-800/80 px-4 py-3">
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98]"
          >
            {t('action.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? t('action.saving') : t('action.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
