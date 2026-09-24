const PACKAGE_NAME = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;
const SAFE_TOKEN = /^[A-Za-z0-9_./:@%+=,-]+$/;
const SAFE_TEXT = /^[A-Za-z0-9.,:@/_ -]*$/;
const READ_ONLY_DUMPSYS_SERVICES = new Set(['activity', 'display', 'input', 'package', 'window']);

function integerToken(value: string, max: number): boolean {
  if (!/^\d{1,5}$/.test(value)) return false;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= max;
}

/**
 * Parses the intentionally limited ADB shell command surface exposed to automation authors.
 * Commands are passed as argv and never through a host shell; destructive `pm clear` is an
 * explicit block type and shell operators are rejected here and in node validation.
 */
export function parseSafeAdbCommand(value: unknown): string[] | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 300 || /[\r\n\0]/.test(value)) return null;
  const command = value.trim();
  if (command === '' || !/^[A-Za-z0-9_./:@%+=,-]+(?: [A-Za-z0-9_./:@%+=,-]+)*$/.test(command)) return null;
  const args = command.split(' ');
  const [program, subcommand, ...rest] = args;

  if (program === 'input') {
    if (subcommand === 'tap' && rest.length === 2 && integerToken(rest[0]!, 16_383) && integerToken(rest[1]!, 16_383)) return args;
    if (subcommand === 'swipe' && (rest.length === 4 || rest.length === 5) && rest.slice(0, 4).every((part) => integerToken(part, 16_383)) && (rest.length === 4 || integerToken(rest[4]!, 10_000))) return args;
    if (subcommand === 'keyevent' && rest.length === 1 && (/^\d{1,3}$/.test(rest[0]!) || /^[A-Z_]+$/.test(rest[0]!))) return args;
    if (subcommand === 'text' && rest.length === 1 && SAFE_TEXT.test(rest[0]!)) return args;
    return null;
  }

  if (program === 'am' && subcommand === 'force-stop' && rest.length === 1 && PACKAGE_NAME.test(rest[0]!)) return args;
  if (program === 'pm' && subcommand === 'list' && rest[0] === 'packages' && (rest.length === 1 || (rest.length === 2 && ['-3', '-s', '-f'].includes(rest[1]!)))) return args;
  if (program === 'dumpsys' && subcommand && READ_ONLY_DUMPSYS_SERVICES.has(subcommand) && rest.length <= 4 && rest.every((part) => SAFE_TOKEN.test(part))) return args;
  if (program === 'getprop' && (args.length === 1 || (args.length === 2 && /^[A-Za-z0-9_.-]{1,128}$/.test(args[1]!)))) return args;
  if (program === 'settings' && subcommand === 'get' && rest.length === 2 && ['global', 'secure', 'system'].includes(rest[0]!) && /^[A-Za-z0-9_.-]{1,128}$/.test(rest[1]!)) return args;

  return null;
}
