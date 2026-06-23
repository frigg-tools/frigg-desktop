import { useMemo, useState } from 'react';
import type { SqlConnectionInput, SqlEngine, SqlSslMode } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import { CloseIcon, FieldLabel, inputClass, monoTextareaClass, selectClass } from '../client/shared';
import Spinner from '../database/Spinner';
import EngineBadge from './EngineBadge';

const ENGINES: SqlEngine[] = ['mysql', 'mariadb', 'postgres', 'sqlite'];
const SSL_MODES: SqlSslMode[] = ['disable', 'require', 'verify'];

function defaultPort(engine: SqlEngine): number {
  return engine === 'postgres' ? 5432 : 3306;
}

interface FormState {
  name: string;
  engine: SqlEngine;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: SqlSslMode;
  caCert: string;
}

function emptyForm(): FormState {
  return {
    name: '',
    engine: 'postgres',
    host: 'localhost',
    port: defaultPort('postgres'),
    user: '',
    password: '',
    database: '',
    ssl: 'disable',
    caCert: '',
  };
}

export default function ConnectionDialog() {
  const t = useT();
  const dialog = useAppStore((s) => s.sqlDialog);
  const connections = useAppStore((s) => s.sqlConnections);
  const testResult = useAppStore((s) => s.sqlTestResult);
  const busy = useAppStore((s) => s.sqlBusy);
  const closeSqlDialog = useAppStore((s) => s.closeSqlDialog);
  const createSqlConnection = useAppStore((s) => s.createSqlConnection);
  const updateSqlConnection = useAppStore((s) => s.updateSqlConnection);
  const testSqlConnection = useAppStore((s) => s.testSqlConnection);

  const editing = dialog?.mode === 'edit' ? connections.find((c) => c.id === dialog.id) ?? null : null;

  const [form, setForm] = useState<FormState>(() =>
    editing
      ? {
          name: editing.name,
          engine: editing.engine,
          host: editing.host,
          port: editing.port,
          user: editing.user,
          password: '',
          database: editing.database,
          ssl: editing.ssl,
          caCert: '',
        }
      : emptyForm(),
  );

  const isSqlite = form.engine === 'sqlite';

  const patch = (next: Partial<FormState>) => setForm((prev) => ({ ...prev, ...next }));

  const onEngineChange = (engine: SqlEngine) => {
    if (engine === 'sqlite') {
      patch({ engine, ssl: 'disable' });
      return;
    }
    patch({ engine, port: defaultPort(engine) });
  };

  const buildInput = (): SqlConnectionInput => {
    const base: SqlConnectionInput = isSqlite
      ? {
          name: form.name.trim(),
          engine: form.engine,
          host: '',
          port: 0,
          user: '',
          database: form.database.trim(),
          ssl: 'disable',
        }
      : {
          name: form.name.trim(),
          engine: form.engine,
          host: form.host.trim(),
          port: form.port,
          user: form.user.trim(),
          database: form.database.trim(),
          ssl: form.ssl,
        };
    if (form.password.length > 0) base.password = form.password;
    if (!isSqlite && form.ssl === 'verify' && form.caCert.trim().length > 0) {
      base.caCert = form.caCert;
    }
    return base;
  };

  const canSave = useMemo(() => {
    if (form.name.trim() === '') return false;
    if (isSqlite) return form.database.trim() !== '';
    return form.host.trim() !== '' && form.database.trim() !== '';
  }, [form, isSqlite]);

  const test = () => {
    const body =
      editing && form.password.length === 0 ? { id: editing.id } : buildInput();
    void testSqlConnection(body).catch(() => undefined);
  };

  const save = () => {
    if (!canSave) return;
    const input = buildInput();
    if (editing) {
      void updateSqlConnection(editing.id, input).catch(() => undefined);
    } else {
      void createSqlConnection(input).catch(() => undefined);
    }
  };

  if (!dialog) return null;

  return (
    <div
      role="presentation"
      onClick={closeSqlDialog}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/70 p-6 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            {editing ? t('sql.dialog.edit.title') : t('sql.dialog.create.title')}
          </span>
          <button
            type="button"
            onClick={closeSqlDialog}
            aria-label={t('action.close')}
            className="rounded p-1 text-zinc-500 transition hover:text-zinc-200"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <label className="block">
            <FieldLabel>{t('sql.form.name')}</FieldLabel>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder={t('sql.form.namePlaceholder')}
              spellCheck={false}
              className={inputClass}
            />
          </label>

          <div>
            <FieldLabel>{t('sql.form.engine')}</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {ENGINES.map((engine) => (
                <button
                  key={engine}
                  type="button"
                  onClick={() => onEngineChange(engine)}
                  className={`rounded-md border px-2 py-1 transition active:scale-[0.98] ${
                    form.engine === engine
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                  }`}
                >
                  <EngineBadge engine={engine} />
                </button>
              ))}
            </div>
          </div>

          {isSqlite ? (
            <label className="block">
              <FieldLabel>{t('sql.form.filePath')}</FieldLabel>
              <input
                value={form.database}
                onChange={(e) => patch({ database: e.target.value })}
                placeholder={t('sql.form.filePathPlaceholder')}
                spellCheck={false}
                className={inputClass}
              />
            </label>
          ) : (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
                <label className="block">
                  <FieldLabel>{t('sql.form.host')}</FieldLabel>
                  <input
                    value={form.host}
                    onChange={(e) => patch({ host: e.target.value })}
                    placeholder={t('sql.form.hostPlaceholder')}
                    spellCheck={false}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <FieldLabel>{t('sql.form.port')}</FieldLabel>
                  <input
                    type="number"
                    value={form.port}
                    onChange={(e) => patch({ port: Number(e.target.value) || 0 })}
                    className={inputClass}
                  />
                </label>
              </div>

              <label className="block">
                <FieldLabel>{t('sql.form.user')}</FieldLabel>
                <input
                  value={form.user}
                  onChange={(e) => patch({ user: e.target.value })}
                  placeholder={t('sql.form.userPlaceholder')}
                  spellCheck={false}
                  className={inputClass}
                />
              </label>

              <label className="block">
                <FieldLabel>{t('sql.form.database')}</FieldLabel>
                <input
                  value={form.database}
                  onChange={(e) => patch({ database: e.target.value })}
                  placeholder={t('sql.form.databasePlaceholder')}
                  spellCheck={false}
                  className={inputClass}
                />
              </label>
            </>
          )}

          <label className="block">
            <FieldLabel>{t('sql.form.password')}</FieldLabel>
            <input
              type="password"
              value={form.password}
              onChange={(e) => patch({ password: e.target.value })}
              placeholder={t('sql.form.passwordPlaceholder')}
              autoComplete="new-password"
              spellCheck={false}
              className={inputClass}
            />
            {editing?.hasPassword ? (
              <span className="mt-1 block text-[11px] text-zinc-600">
                {t('sql.form.passwordKeep')}
              </span>
            ) : null}
          </label>

          {!isSqlite ? (
            <label className="block">
              <FieldLabel>{t('sql.form.ssl')}</FieldLabel>
              <select
                value={form.ssl}
                onChange={(e) => patch({ ssl: e.target.value as SqlSslMode })}
                className={`${selectClass} w-full`}
              >
                {SSL_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`sql.ssl.${mode}`)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {!isSqlite && form.ssl === 'verify' ? (
            <label className="block">
              <FieldLabel>{t('sql.form.caCert')}</FieldLabel>
              <textarea
                value={form.caCert}
                onChange={(e) => patch({ caCert: e.target.value })}
                placeholder={t('sql.form.caCertPlaceholder')}
                rows={4}
                spellCheck={false}
                className={monoTextareaClass}
              />
            </label>
          ) : null}

          {testResult ? (
            <div
              className={`rounded-md border px-3 py-2 text-[12px] ${
                testResult.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              }`}
            >
              {testResult.ok
                ? testResult.serverVersion
                  ? t('sql.test.okVersion', { version: testResult.serverVersion })
                  : t('sql.test.ok')
                : `${t('sql.test.failed')}${testResult.error ? ` — ${testResult.error}` : ''}`}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-800/80 px-4 py-3">
          <button
            type="button"
            onClick={test}
            disabled={busy || !canSave}
            className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Spinner /> : null}
            {busy ? t('sql.action.testing') : t('sql.action.test')}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={closeSqlDialog}
            className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98]"
          >
            {t('action.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave || busy}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98] disabled:opacity-50"
          >
            {t('sql.action.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
