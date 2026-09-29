import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  AGENT_RESOURCE_STATE,
  type AgentSkillStatus,
  type AgentResourceStatus,
} from '@frigg/shared';
import type { ManagedResourceRecord } from './registry.ts';

export interface BundledSkill {
  name: string;
  sourcePath: string;
  version: string;
  hash: string;
}

export interface SkillsInspection {
  status: AgentResourceStatus;
  skills: AgentSkillStatus[];
}

export interface SkillInstallResult {
  status: AgentResourceStatus;
  fileHashes?: Record<string, string>;
  paths?: string[];
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

async function readSkillVersion(directory: string): Promise<string | null> {
  try {
    const version = (await readFile(path.join(directory, 'VERSION'), 'utf8')).trim();
    return SEMVER_PATTERN.test(version) ? version : null;
  } catch (error) {
    if (isMissing(error)) return null;
    throw new Error('Unable to read a skill version file.');
  }
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index]! - rightParts[index]!;
  }
  return 0;
}

async function hashTree(directory: string): Promise<string | null> {
  let root;
  try {
    root = await lstat(directory);
  } catch (error) {
    if (isMissing(error)) return null;
    throw new Error('Unable to inspect an installed skill directory.');
  }
  if (!root.isDirectory() || root.isSymbolicLink()) return null;

  const files: Array<[string, string]> = [];
  async function visit(current: string, prefix: string): Promise<boolean> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      throw new Error('Unable to read an installed skill directory.');
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = prefix ? path.posix.join(prefix, entry.name) : entry.name;
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) return false;
      if (entry.isDirectory()) {
        if (!await visit(fullPath, relative)) return false;
      } else if (entry.isFile()) {
        let contents: Buffer;
        try {
          contents = await open(fullPath, 'r').then(async (handle) => {
            try { return await handle.readFile(); } finally { await handle.close(); }
          });
        } catch {
          throw new Error('Unable to read an installed skill file.');
        }
        files.push([relative, sha256(contents)]);
      } else {
        return false;
      }
    }
    return true;
  }

  if (!await visit(directory, '')) return null;
  if (!files.some(([name]) => name === 'SKILL.md')) return null;
  return sha256(JSON.stringify(files));
}

export async function discoverBundledSkills(sourceRoot: string): Promise<BundledSkill[]> {
  let entries;
  try {
    entries = await readdir(sourceRoot, { withFileTypes: true });
  } catch {
    throw new Error('The bundled Frigg skills are unavailable.');
  }

  const skills: BundledSkill[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) continue;
    const sourcePath = path.join(sourceRoot, entry.name);
    const hash = await hashTree(sourcePath);
    if (hash !== null) {
      const version = await readSkillVersion(sourcePath);
      if (version === null) throw new Error(`Skill ${entry.name} has no valid VERSION file.`);
      skills.push({ name: entry.name, sourcePath, version, hash });
    }
  }
  return skills;
}

function registeredHash(
  record: ManagedResourceRecord | undefined,
  skillName: string,
  targetPath: string,
): string | undefined {
  if (!record?.paths.includes(targetPath)) return undefined;
  return record?.fileHashes?.[skillName];
}

function resourceStatus(
  state: AgentResourceStatus['state'],
  managed: boolean,
  paths: string[],
  message?: string,
  updateAvailable = false,
): AgentResourceStatus {
  return { state, managed, paths, updateAvailable, ...(message ? { message } : {}) };
}

interface SkillCheck {
  skill: BundledSkill;
  target: string;
  currentExists: boolean;
  currentHash: string | null;
  managedHash?: string;
  installedVersion: string | null;
  shared: Array<{ path: string; hash: string; version: string | null }>;
}

async function checkSkills(
  skills: BundledSkill[],
  targetRoot: string,
  managed?: ManagedResourceRecord,
  sharedRoots: string[] = [],
): Promise<SkillCheck[]> {
  const checks: SkillCheck[] = [];
  for (const skill of skills) {
    const target = path.join(targetRoot, skill.name);
    const currentHash = await hashTree(target);
    let currentExists = currentHash !== null;
    if (!currentExists) {
      try {
        await lstat(target);
        currentExists = true;
      } catch (error) {
        if (!isMissing(error)) throw new Error('Unable to inspect an installed skill directory.');
      }
    }
    const installedVersion = currentHash === null ? null : await readSkillVersion(target);
    const shared: SkillCheck['shared'] = [];
    for (const root of sharedRoots) {
      const sharedPath = path.join(root, skill.name);
      const hash = await hashTree(sharedPath);
      if (hash !== null) shared.push({ path: sharedPath, hash, version: await readSkillVersion(sharedPath) });
      else {
        try {
          await lstat(sharedPath);
          shared.push({ path: sharedPath, hash: '', version: null });
        } catch (error) {
          if (!isMissing(error)) throw new Error('Unable to inspect a shared skill directory.');
        }
      }
    }
    checks.push({
      skill,
      target,
      currentExists,
      currentHash,
      managedHash: registeredHash(managed, skill.name, target),
      installedVersion,
      shared,
    });
  }
  return checks;
}

function sharedSkillIsExact(check: SkillCheck): boolean {
  return check.shared.length > 0 && check.shared.every(({ hash }) => hash === check.skill.hash);
}

export async function getSkillsStatus(
  sourceRoot: string,
  targetRoot: string,
  managed?: ManagedResourceRecord,
  sharedRoots: string[] = [],
): Promise<AgentResourceStatus> {
  return (await inspectSkills(sourceRoot, targetRoot, managed, sharedRoots)).status;
}

function skillUpdateAvailable(skill: BundledSkill, installedVersion: string | null, installedHash: string | null): boolean {
  if (installedHash === skill.hash) return false;
  if (installedVersion && compareVersions(skill.version, installedVersion) < 0) return false;
  return true;
}

export async function inspectSkills(
  sourceRoot: string,
  targetRoot: string,
  managed?: ManagedResourceRecord,
  sharedRoots: string[] = [],
): Promise<SkillsInspection> {
  let skills: BundledSkill[];
  try {
    skills = await discoverBundledSkills(sourceRoot);
    if (skills.length === 0) {
      return {
        status: resourceStatus(AGENT_RESOURCE_STATE.error, false, [targetRoot], 'No bundled Frigg skills were found.'),
        skills: [],
      };
    }
    const checks = await checkSkills(skills, targetRoot, managed, sharedRoots);
    const details = checks.map((check): AgentSkillStatus => {
      const sharedResolves = sharedSkillIsExact(check);
      if (check.shared.length > 0 && !sharedResolves) {
        return {
          name: check.skill.name,
          state: AGENT_RESOURCE_STATE.conflict,
          managed: false,
          paths: check.shared.map(({ path: sharedPath }) => sharedPath),
          installedVersion: check.shared[0]?.version ?? null,
          availableVersion: check.skill.version,
          updateAvailable: false,
          message: 'Cursor sees a different skill with this name in a shared skills folder. Resolve that shared folder before installing a Cursor copy.',
        };
      }
      if (check.currentExists) {
        if (check.currentHash === null || check.managedHash === undefined || check.currentHash !== check.managedHash) {
          return {
            name: check.skill.name,
            state: AGENT_RESOURCE_STATE.conflict,
            managed: false,
            paths: [check.target],
            installedVersion: check.installedVersion,
            availableVersion: check.skill.version,
            updateAvailable: false,
            message: 'A Frigg skill name is already used by content that Frigg cannot safely replace. Choose Replace to overwrite the client skill folder.',
          };
        }
        return {
          name: check.skill.name,
          state: AGENT_RESOURCE_STATE.installed,
          managed: true,
          paths: [check.target],
          installedVersion: check.installedVersion,
          availableVersion: check.skill.version,
          updateAvailable: skillUpdateAvailable(check.skill, check.installedVersion, check.currentHash),
        };
      }
      if (sharedResolves) {
        return {
          name: check.skill.name,
          state: AGENT_RESOURCE_STATE.installed,
          managed: false,
          paths: check.shared.map(({ path: sharedPath }) => sharedPath),
          installedVersion: check.shared[0]?.version ?? null,
          availableVersion: check.skill.version,
          updateAvailable: false,
        };
      }
      return {
        name: check.skill.name,
        state: AGENT_RESOURCE_STATE.missing,
        managed: false,
        paths: [check.target],
        installedVersion: null,
        availableVersion: check.skill.version,
        updateAvailable: false,
      };
    });
    const paths = [...new Set(details.flatMap(({ paths: skillPaths }) => skillPaths))];
    const conflict = details.find(({ state }) => state === AGENT_RESOURCE_STATE.conflict);
    const missing = details.some(({ state }) => state === AGENT_RESOURCE_STATE.missing);
    const updateAvailable = details.some(({ updateAvailable: update }) => update);
    const status = conflict
      ? resourceStatus(AGENT_RESOURCE_STATE.conflict, false, paths, conflict.message)
      : missing
        ? resourceStatus(AGENT_RESOURCE_STATE.missing, false, paths)
        : resourceStatus(
            AGENT_RESOURCE_STATE.installed,
            details.some(({ managed: isManaged }) => isManaged),
            paths,
            updateAvailable ? 'One or more Frigg skills are ready to update.' : undefined,
            updateAvailable,
          );
    return { status, skills: details };
  } catch {
    return {
      status: resourceStatus(AGENT_RESOURCE_STATE.error, false, [targetRoot], 'Unable to inspect Frigg skills.'),
      skills: [],
    };
  }
}

async function stageSkill(sourcePath: string, target: string): Promise<string> {
  const temporary = `${target}.frigg-${randomUUID()}.tmp`;
  try {
    await cp(sourcePath, temporary, { recursive: true, errorOnExist: true, force: false });
    const sourceHash = await hashTree(sourcePath);
    const stagedHash = await hashTree(temporary);
    if (sourceHash === null || stagedHash !== sourceHash) throw new Error('Staged skill validation failed.');
    return temporary;
  } catch {
    await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
    throw new Error('Unable to stage a bundled Frigg skill.');
  }
}

export async function installSkills(
  sourceRoot: string,
  targetRoot: string,
  managed: ManagedResourceRecord | undefined,
  replaceConflict: boolean,
  sharedRoots: string[] = [],
  onCommit?: (fileHashes: Record<string, string>, managedPaths: string[]) => Promise<void>,
  skillName?: string,
): Promise<SkillInstallResult> {
  try {
    const bundledSkills = await discoverBundledSkills(sourceRoot);
    const skills = skillName ? bundledSkills.filter((skill) => skill.name === skillName) : bundledSkills;
    if (skills.length === 0) {
      if (skillName) {
        return { status: resourceStatus(AGENT_RESOURCE_STATE.error, false, [targetRoot], 'The requested Frigg skill is unavailable.') };
      }
      return { status: resourceStatus(AGENT_RESOURCE_STATE.error, false, [targetRoot], 'No bundled Frigg skills were found.') };
    }
    const checks = await checkSkills(skills, targetRoot, managed, sharedRoots);
    const visiblePaths: string[] = [];
    const managedPaths: string[] = [];
    const conflicts: SkillCheck[] = [];
    const toInstall: SkillCheck[] = [];

    for (const check of checks) {
      const sharedResolves = sharedSkillIsExact(check);
      if (check.shared.length > 0) {
        if (sharedResolves) {
          visiblePaths.push(...check.shared.map(({ path: sharedPath }) => sharedPath));
        } else {
          return {
            status: resourceStatus(
              AGENT_RESOURCE_STATE.conflict,
              false,
              check.shared.map(({ path: sharedPath }) => sharedPath),
              'Cursor already sees a different skill with this name in a shared skills folder. Resolve that shared folder before installing a Cursor copy.',
            ),
          };
        }
      }
      if (!check.currentExists && sharedResolves) continue;
      if (check.currentExists && (
        check.currentHash === null || check.managedHash === undefined || check.currentHash !== check.managedHash
      )) {
        conflicts.push(check);
      }
      if (!check.currentExists || check.currentHash !== check.skill.hash) toInstall.push(check);
      else {
        managedPaths.push(check.target);
        visiblePaths.push(check.target);
      }
    }

    if (conflicts.length > 0 && !replaceConflict) {
      return {
        status: resourceStatus(
          AGENT_RESOURCE_STATE.conflict,
          false,
          conflicts.map(({ target }) => target),
          'A Frigg skill folder contains unrecognized or edited content. Choose Replace to overwrite only the client skill folder.',
        ),
      };
    }

    const staged = new Map<string, string>();
    const promoted: Array<{ target: string; backup?: string; didPromote: boolean }> = [];
    try {
      for (const check of toInstall) {
        await mkdir(path.dirname(check.target), { recursive: true, mode: 0o700 });
        staged.set(check.target, await stageSkill(check.skill.sourcePath, check.target));
      }
      for (const check of toInstall) {
        const backup = check.currentExists ? `${check.target}.frigg-${randomUUID()}.bak` : undefined;
        const transaction = { target: check.target, ...(backup ? { backup } : {}), didPromote: false };
        promoted.push(transaction);
        if (backup) await rename(check.target, backup);
        await rename(staged.get(check.target)!, check.target);
        transaction.didPromote = true;
        managedPaths.push(check.target);
        visiblePaths.push(check.target);
      }
    } catch {
      for (const transaction of promoted.reverse()) {
        if (transaction.didPromote) await rm(transaction.target, { recursive: true, force: true }).catch(() => undefined);
        if (transaction.backup) await rename(transaction.backup, transaction.target).catch(() => undefined);
      }
      for (const temporary of staged.values()) await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
      throw new Error('Unable to promote Frigg skill directories.');
    }
    const installedNames = new Set(managedPaths.map((installedPath) => path.basename(installedPath)));
    const fileHashes = Object.fromEntries(skills
      .filter((skill) => installedNames.has(skill.name))
      .map((skill) => [skill.name, skill.hash]));
    try {
      await onCommit?.(fileHashes, [...new Set(managedPaths)]);
    } catch {
      for (const transaction of promoted.reverse()) {
        if (transaction.didPromote) await rm(transaction.target, { recursive: true, force: true }).catch(() => undefined);
        if (transaction.backup) await rename(transaction.backup, transaction.target).catch(() => undefined);
      }
      throw new Error('Unable to record installed Frigg skills.');
    }
    for (const transaction of promoted) {
      if (transaction.backup) await rm(transaction.backup, { recursive: true, force: true }).catch(() => undefined);
    }
    return {
      status: resourceStatus(AGENT_RESOURCE_STATE.installed, true, [...new Set(visiblePaths)]),
      fileHashes,
      paths: [...new Set(managedPaths)],
    };
  } catch {
    return {
      status: resourceStatus(AGENT_RESOURCE_STATE.error, false, [targetRoot], 'Unable to install Frigg skills. Existing skill directories were restored when promotion failed.'),
    };
  }
}
