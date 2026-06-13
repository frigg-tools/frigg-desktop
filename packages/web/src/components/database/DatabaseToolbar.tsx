import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import DatabaseDevicePicker from './DatabaseDevicePicker';
import DatabaseAppPicker from './DatabaseAppPicker';
import DatabaseFilePicker from './DatabaseFilePicker';
import Spinner from './Spinner';

export default function DatabaseToolbar() {
  const t = useT();
  const dbBusy = useAppStore((s) => s.dbBusy);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 px-4 py-2.5">
      <h1 className="font-display text-base font-semibold tracking-wide text-zinc-100">
        {t('database.title')}
      </h1>
      <div className="flex-1" />
      {dbBusy ? <Spinner /> : null}
      <DatabaseDevicePicker />
      <DatabaseAppPicker />
      <DatabaseFilePicker />
    </div>
  );
}
