import type { FridaScript } from '@frigg/shared';

export const FRIDA_EXAMPLES: FridaScript[] = [
  {
    id: 'toast-on-launch',
    name: 'Toast on launch',
    builtin: true,
    source: `Java.perform(() => {
  const Activity = Java.use('android.app.Activity');
  const Toast = Java.use('android.widget.Toast');
  const JString = Java.use('java.lang.String');
  let shown = false;
  Activity.onResume.implementation = function () {
    this.onResume();
    if (shown) return;
    shown = true;
    Toast.makeText(this, JString.$new('Frigg + Frida'), Toast.LENGTH_LONG.value).show();
    send('toast shown');
  };
});`,
  },
  {
    id: 'list-classes',
    name: 'List loaded classes',
    builtin: true,
    source: `Java.perform(() => {
  const classes = Java.enumerateLoadedClassesSync();
  send('loaded classes: ' + classes.length);
  classes.slice(0, 50).forEach((name) => console.log(name));
});`,
  },
  {
    id: 'root-probe',
    name: 'Root-check probe (hook File.exists)',
    builtin: true,
    source: `Java.perform(() => {
  const File = Java.use('java.io.File');
  File.exists.implementation = function () {
    const result = this.exists();
    console.log('File.exists(' + this.getAbsolutePath() + ') = ' + result);
    return result;
  };
  send('File.exists hooked');
});`,
  },
];
