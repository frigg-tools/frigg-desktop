import { describe, expect, it } from 'vitest';
import { cleanFridaLine } from '../src/frida/frida-session.ts';

describe('cleanFridaLine', () => {
  it('drops the Frida REPL banner art and help block', () => {
    const banner = [
      '    ____',
      '   / _  |   Frida 17.9.11 - A world-class dynamic instrumentation',
      '  | (_| |',
      '   > _  |   Commands:',
      '  /_/ |_|       help      -> Displays the help system',
      "  . . . .       object?   -> Display information about 'object'",
      '  . . . .       More info at https://frida.re/docs/home/',
    ];
    for (const line of banner) {
      expect(cleanFridaLine(line)).toBeNull();
    }
  });

  it('drops an empty REPL prompt line', () => {
    expect(cleanFridaLine('[Android Emulator 5554::com.example.app ]-> ')).toBeNull();
    expect(cleanFridaLine('')).toBeNull();
  });

  it('extracts the payload of a send() message', () => {
    const cleaned = cleanFridaLine(
      "[Android Emulator 5554::com.example.app ]-> message: {'type': 'send', 'payload': 'hello world'} data: None",
    );
    expect(cleaned).toEqual({ text: 'hello world', kind: 'send' });
  });

  it('keeps console.log output as a log line, stripping the prompt prefix', () => {
    expect(cleanFridaLine('[Device::pid ]-> loaded classes: 42')).toEqual({
      text: 'loaded classes: 42',
      kind: 'log',
    });
    expect(cleanFridaLine('plain output')).toEqual({ text: 'plain output', kind: 'log' });
  });

  it('keeps the spawn lifecycle line as a log entry', () => {
    const cleaned = cleanFridaLine('Spawned `com.example.app`. Resuming main thread!');
    expect(cleaned?.kind).toBe('log');
  });
});
