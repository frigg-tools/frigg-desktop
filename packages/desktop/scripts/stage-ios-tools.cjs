const {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const desktopRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(desktopRoot, 'build', 'ios-tools');
const binaryOutput = path.join(outputRoot, 'bin', 'idevicesyslog');
const libraryOutput = path.join(outputRoot, 'lib');
const noticesOutput = path.join(outputRoot, 'THIRD_PARTY_NOTICES.md');
const systemPrefixes = ['/System/Library/', '/usr/lib/', '/Library/Apple/System/Library/'];

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', ...options }).trim();
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message || String(error);
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }
}

function parseArgs() {
  const archIndex = process.argv.indexOf('--arch');
  const arch = archIndex >= 0 ? process.argv[archIndex + 1] : null;
  if (arch !== 'arm64' && arch !== 'x64') {
    throw new Error('Usage: node stage-ios-tools.cjs --arch arm64|x64');
  }
  return arch;
}

function isSystemPath(value) {
  return systemPrefixes.some((prefix) => value.startsWith(prefix));
}

function parseOtoolDependencies(filePath) {
  const output = run('otool', ['-L', filePath]);
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.match(/^\s*(.+?)\s+\(compatibility version /)?.[1] ?? null)
    .filter((dependency) => dependency !== null);
}

function parseRpaths(filePath) {
  const lines = run('otool', ['-l', filePath]).split(/\r?\n/);
  const rpaths = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== 'cmd LC_RPATH') continue;
    const pathLine = lines.slice(index + 1, index + 5).find((line) => /^\s*path /.test(line));
    const match = pathLine?.match(/^\s*path (.+) \(offset \d+\)$/);
    if (match) rpaths.push(match[1]);
  }
  return rpaths;
}

function expandMachPath(value, imagePath, executablePath) {
  if (value.startsWith('@loader_path/')) return path.resolve(path.dirname(imagePath), value.slice('@loader_path/'.length));
  if (value.startsWith('@executable_path/')) return path.resolve(path.dirname(executablePath), value.slice('@executable_path/'.length));
  if (value.startsWith('@rpath/')) return null;
  return value;
}

function resolveDependency(value, imagePath, executablePath) {
  if (isSystemPath(value)) return { system: true, source: value };

  const candidates = [];
  if (value.startsWith('@rpath/')) {
    const suffix = value.slice('@rpath/'.length);
    for (const rpath of parseRpaths(imagePath)) {
      const expanded = expandMachPath(rpath, imagePath, executablePath);
      if (expanded !== null) candidates.push(path.resolve(expanded, suffix));
    }
  } else {
    const expanded = expandMachPath(value, imagePath, executablePath);
    if (expanded !== null) candidates.push(expanded);
  }

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const source = realpathSync(candidate);
    if (isSystemPath(source)) return { system: true, source };
    return { system: false, source };
  }

  throw new Error(`Could not resolve non-system dependency ${value} from ${imagePath}`);
}

function formulaForPath(filePath, cellarPath) {
  const relative = path.relative(cellarPath, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Bundled dependency is outside the Homebrew Cellar: ${filePath}`);
  }
  const [formula] = relative.split(path.sep);
  if (!formula) throw new Error(`Could not identify Homebrew formula for ${filePath}`);
  return formula;
}

function architectureMatches(filePath, arch) {
  const archs = run('lipo', ['-archs', filePath]).split(/\s+/);
  const expected = arch === 'arm64' ? 'arm64' : 'x86_64';
  if (!archs.includes(expected)) {
    throw new Error(`${filePath} does not contain ${expected}; found ${archs.join(', ')}`);
  }
}

function licenseFilesForFormula(formula) {
  const listed = run('brew', ['list', '--verbose', formula]);
  return listed
    .split(/\r?\n/)
    .filter((filePath) => /(?:^|\/)(?:COPYING(?:\.[^/]*)?|LICEN[CS]E(?:\.[^/]*)?|NOTICE(?:\.[^/]*)?)$/i.test(filePath))
    .filter((filePath) => existsSync(filePath) && lstatSync(filePath).isFile())
    .sort();
}

function formulaMetadata(formula) {
  const response = JSON.parse(run('brew', ['info', '--json=v2', formula]));
  const item = response.formulae?.find((entry) => entry.full_name === formula || entry.name === formula);
  if (!item) throw new Error(`Homebrew returned no formula metadata for ${formula}`);
  const files = licenseFilesForFormula(formula);
  if (files.length === 0) throw new Error(`No license text found in the installed ${formula} formula`);

  const source = item.urls?.stable?.url ?? item.homepage;
  if (!item.license || !source) throw new Error(`Missing license or source metadata for ${formula}`);
  return {
    name: item.full_name ?? item.name,
    version: item.installed?.[0]?.version ?? item.versions?.stable ?? 'unknown',
    license: item.license,
    source,
    files,
  };
}

function stage() {
  if (process.platform !== 'darwin') throw new Error('iOS log helper staging requires macOS');
  const arch = parseArgs();
  const prefix = run('brew', ['--prefix', 'libimobiledevice']);
  const sourceExecutable = realpathSync(path.join(prefix, 'bin', 'idevicesyslog'));
  architectureMatches(sourceExecutable, arch);

  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(path.dirname(binaryOutput), { recursive: true });
  mkdirSync(libraryOutput, { recursive: true });
  copyFileSync(sourceExecutable, binaryOutput);
  chmodSync(binaryOutput, 0o755);

  const cellarPath = realpathSync(run('brew', ['--cellar']));
  const stagedImages = new Map([[sourceExecutable, binaryOutput]]);
  const formulaNames = new Set([formulaForPath(sourceExecutable, cellarPath)]);
  const pending = [sourceExecutable];

  while (pending.length > 0) {
    const sourceImage = pending.pop();
    const stagedImage = stagedImages.get(sourceImage);
    architectureMatches(sourceImage, arch);

    for (const dependencyName of parseOtoolDependencies(sourceImage)) {
      const dependency = resolveDependency(dependencyName, sourceImage, sourceExecutable);
      if (dependency.system) continue;

      const basename = path.basename(dependency.source);
      const destination = path.join(libraryOutput, basename);
      const existing = [...stagedImages.entries()].find(([, stagedPath]) => stagedPath === destination);
      if (existing && existing[0] !== dependency.source) {
        throw new Error(`Two different dylibs share the staged name ${basename}`);
      }
      if (!existing) {
        copyFileSync(dependency.source, destination);
        stagedImages.set(dependency.source, destination);
        pending.push(dependency.source);
        formulaNames.add(formulaForPath(dependency.source, cellarPath));
      }

      const replacement = stagedImage === binaryOutput
        ? `@loader_path/../lib/${basename}`
        : `@loader_path/${basename}`;
      run('install_name_tool', ['-change', dependencyName, replacement, stagedImage]);
    }

    if (stagedImage !== binaryOutput) {
      run('install_name_tool', ['-id', `@loader_path/${path.basename(stagedImage)}`, stagedImage]);
    }
  }

  for (const stagedImage of stagedImages.values()) {
    const rpaths = parseRpaths(stagedImage);
    for (const rpath of rpaths) {
      if (rpath.startsWith('/System/Library/') || rpath.startsWith('/usr/lib/') || rpath.startsWith('@loader_path/')) continue;
      run('install_name_tool', ['-delete_rpath', rpath, stagedImage]);
    }
  }

  // install_name_tool invalidates Homebrew's signatures. Re-sign every staged
  // Mach-O ad hoc so macOS can load the helper and its bundled dylibs.
  for (const stagedImage of stagedImages.values()) {
    run('codesign', ['--force', '--sign', '-', stagedImage]);
  }

  for (const stagedImage of stagedImages.values()) {
    for (const dependencyName of parseOtoolDependencies(stagedImage)) {
      if (isSystemPath(dependencyName) || dependencyName.startsWith('@loader_path/')) continue;
      throw new Error(`Staged image still references a build-machine dependency: ${dependencyName}`);
    }
  }

  const metadata = [...formulaNames].sort().map(formulaMetadata);
  const notice = [
    '# Third-party notices: iOS device log support',
    '',
    `Bundled architecture: ${arch}`,
    `Helper version: ${run(binaryOutput, ['--version'])}`,
    '',
    'The following Homebrew formulae are included with this application to support physical iOS device logs.',
    '',
    ...metadata.flatMap((item) => [
      `## ${item.name} ${item.version}`,
      '',
      `- License: ${item.license}`,
      `- Source: ${item.source}`,
      '',
      ...item.files.flatMap((filePath) => [
        `### ${path.basename(filePath)}`,
        '',
        '```text',
        readFileSync(filePath, 'utf8').trimEnd(),
        '```',
        '',
      ]),
    ]),
  ].join('\n');
  writeFileSync(noticesOutput, notice, 'utf8');

  const version = run(binaryOutput, ['--version']);
  if (!version.includes('idevicesyslog')) throw new Error(`Unexpected helper version output: ${version}`);
  console.log(`[frigg] staged ${version} (${arch}) with ${stagedImages.size - 1} dylib(s) and ${metadata.length} license notice(s)`);
}

try {
  stage();
} catch (error) {
  console.error(`[frigg] iOS log helper staging failed: ${error.message}`);
  process.exitCode = 1;
}
