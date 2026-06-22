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
    id: 'replace-text',
    name: 'Replace text in UI',
    builtin: true,
    source: `// Replace one text with another in any TextView. Edit FROM / TO.
const FROM = 'Entrar';
const TO = 'Frigg';
Java.perform(() => {
  const JString = Java.use('java.lang.String');
  const TextView = Java.use('android.widget.TextView');
  TextView.setText.overload('java.lang.CharSequence').implementation = function (text) {
    const value = text ? text.toString() : '';
    if (value.indexOf(FROM) !== -1) {
      send('replaced "' + FROM + '" with "' + TO + '"');
      this.setText(JString.$new(value.split(FROM).join(TO)));
      return;
    }
    this.setText(text);
  };
  send('hooked TextView.setText');
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
