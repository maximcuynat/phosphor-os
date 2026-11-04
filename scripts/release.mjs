#!/usr/bin/env node
// Publie une nouvelle version de PHOSPHOR OS.
//
//   make deploy                      interactif
//   make deploy BUMP=minor YES=1     sans question
//   make deploy-dry                  simulation : rien n'est modifié
//
// Étapes : contrôles git, choix de la version (proposée d'après les commits),
// typecheck + tests + build, CHANGELOG.md, commit "chore(release): vX.Y.Z",
// tag annoté vX.Y.Z, push de main et du tag. Le tag déclenche le workflow
// .github/workflows/pages.yml qui met le site en ligne. Ensuite, si `gh` est
// installé : release GitHub et suivi du déploiement.
//
// Options : --bump patch|minor|major|X.Y.Z   --yes   --dry-run   --help

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';

// ------------------------------------------------------------------ options

const argv = process.argv.slice(2);
const opt = { bump: null, yes: false, dry: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--yes' || a === '-y') opt.yes = true;
  else if (a === '--dry-run') opt.dry = true;
  else if (a === '--bump') opt.bump = argv[++i] ?? null;
  else if (a.startsWith('--bump=')) opt.bump = a.slice(7);
  else if (a === '--help' || a === '-h') {
    console.log('Usage : node scripts/release.mjs [--bump patch|minor|major|X.Y.Z] [--yes] [--dry-run]');
    process.exit(0);
  } else fail(`Option inconnue : ${a}`);
}

// ------------------------------------------------------------------ affichage

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = paint('32');
const bright = paint('92;1');
const dim = paint('2');
const red = paint('31;1');
const yellow = paint('33');

const step = (s) => console.log(`\n${bright('▸')} ${bright(s)}`);
const ok = (s) => console.log(`  ${green('✓')} ${s}`);
const info = (s) => console.log(`  ${dim(s)}`);
const warn = (s) => console.log(`  ${yellow('!')} ${s}`);
function fail(msg, hint = '') {
  console.error(`\n${red('✗')} ${msg}`);
  if (hint) console.error(`  ${dim(hint)}`);
  process.exit(1);
}

// ------------------------------------------------------------------ outils

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (...a) => {
  try {
    return git(...a);
  } catch {
    return null;
  }
};
const has = (cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;
const run = (cmd, a) => spawnSync(cmd, a, { stdio: 'inherit' }).status === 0;

let rl = null;
async function ask(question, def = '') {
  if (opt.yes) return def;
  if (!process.stdin.isTTY) fail('Pas de terminal interactif.', 'Relancez avec BUMP=patch|minor|major YES=1, ou depuis un vrai terminal.');
  rl ??= createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(`  ${question}${def ? dim(` [${def}]`) : ''} `)).trim();
  return a || def;
}
async function confirm(question, def = true) {
  const a = (await ask(`${question} ${dim(def ? '(O/n)' : '(o/N)')}`, def ? 'o' : 'n')).toLowerCase();
  return a.startsWith('o') || a.startsWith('y');
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
function bump(v, kind) {
  const [, M, m, p] = SEMVER.exec(v).map(Number);
  if (kind === 'major') return `${M + 1}.0.0`;
  if (kind === 'minor') return `${M}.${m + 1}.0`;
  return `${M}.${m}.${p + 1}`;
}
function cmpSemver(a, b) {
  const x = SEMVER.exec(a).slice(1).map(Number);
  const y = SEMVER.exec(b).slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

const GROUPS = [
  ['feat', 'Nouveautés'],
  ['fix', 'Corrections'],
  ['perf', 'Performances'],
  ['refactor', 'Refonte'],
  ['docs', 'Documentation'],
  ['test', 'Tests'],
  ['build', 'Build et CI'],
  ['ci', 'Build et CI'],
  ['style', 'Style'],
  ['chore', 'Maintenance'],
];

function parseCommit(line) {
  const [hash, subject] = line.split('\t');
  const m = /^(\w+)(\([^)]*\))?(!)?:\s*(.+)$/.exec(subject);
  return { hash, subject, type: m ? m[1] : 'other', scope: m?.[2]?.slice(1, -1) ?? '', breaking: !!m?.[3], text: m ? m[4] : subject };
}

function changelogSection(version, commits, date) {
  const lines = [`## v${version} (${date})`, ''];
  const breaking = commits.filter((c) => c.breaking);
  if (breaking.length) {
    lines.push('### Changements majeurs', '', ...breaking.map((c) => `- ${c.scope ? `**${c.scope}** : ` : ''}${c.text} (${c.hash})`), '');
  }
  const titles = [...new Set(GROUPS.map(([, t]) => t)), 'Autres'];
  for (const title of titles) {
    const types = GROUPS.filter(([, t]) => t === title).map(([k]) => k);
    const list = commits.filter((c) => (title === 'Autres' ? !GROUPS.some(([k]) => k === c.type) : types.includes(c.type)));
    if (!list.length) continue;
    lines.push(`### ${title}`, '', ...list.map((c) => `- ${c.scope ? `**${c.scope}** : ` : ''}${c.text} (${c.hash})`), '');
  }
  return lines.join('\n');
}

function setJsonVersion(file, version) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  json.version = version;
  if (json.packages?.['']) json.packages[''].version = version;
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
}

function pagesUrl() {
  const url = tryGit('remote', 'get-url', 'origin') ?? '';
  const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
  return m ? { repo: `${m[1]}/${m[2]}`, site: `https://${m[1]}.github.io/${m[2]}/` } : null;
}

// ------------------------------------------------------------------ 1. contrôles

console.log(bright('\nPHOSPHOR OS · nouvelle version') + (opt.dry ? yellow('  (simulation)') : ''));

step('Contrôles');
if (!tryGit('rev-parse', '--is-inside-work-tree')) fail('Ce dossier n’est pas un dépôt git.');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') fail(`Vous êtes sur la branche ${branch}.`, 'Les versions se publient depuis main : git switch main');
ok('branche main');
const dirty = git('status', '--porcelain');
if (dirty && !opt.dry) fail('Des modifications ne sont pas commitées.', 'Commitez-les ou mettez-les de côté (git stash), puis relancez.');
if (dirty) warn('modifications non commitées (ignoré en simulation)');
else ok('aucune modification en attente');
if (!tryGit('remote', 'get-url', 'origin')) fail('Pas de remote origin.', 'git remote add origin <url>');
if (tryGit('fetch', 'origin', 'main', '--tags', '--quiet') === null) warn('git fetch impossible (hors ligne ?) : état distant non vérifié');
else {
  const behind = Number(tryGit('rev-list', '--count', 'HEAD..origin/main') ?? 0);
  if (behind > 0) fail(`main a ${behind} commit(s) de retard sur origin/main.`, 'git pull --rebase, puis relancez.');
  ok('à jour avec origin/main');
}

// ------------------------------------------------------------------ 2. changements

step('Changements');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const current = pkg.version;
if (!SEMVER.test(current)) fail(`Version invalide dans package.json : ${current}`);
const lastTag = tryGit('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*');
const range = lastTag ? [`${lastTag}..HEAD`] : ['HEAD'];
const commits = (tryGit('log', ...range, '--no-merges', '--format=%h\t%s') ?? '')
  .split('\n')
  .filter(Boolean)
  .map(parseCommit)
  .filter((c) => !/^chore\(release\)/.test(c.subject));
info(`version actuelle : ${current}${lastTag ? `   dernier tag : ${lastTag}` : '   aucun tag pour l’instant'}`);
if (!commits.length) fail('Aucun commit depuis la dernière version : rien à publier.');
for (const c of commits) console.log(`  ${dim(c.hash)} ${c.breaking ? red(c.subject) : c.subject}`);

// ------------------------------------------------------------------ 3. version

step('Version');
const firstRelease = !lastTag && !tryGit('rev-parse', '-q', '--verify', `refs/tags/v${current}`);
const suggested = commits.some((c) => c.breaking) ? 'major' : commits.some((c) => c.type === 'feat') ? 'minor' : 'patch';
const choices = [];
if (firstRelease) choices.push({ label: `${current}  première version (version actuelle)`, version: current });
for (const kind of ['patch', 'minor', 'major']) {
  const why = kind === suggested && !firstRelease ? '  ← proposé d’après les commits' : '';
  choices.push({ label: `${bump(current, kind)}  ${kind}${why}`, version: bump(current, kind), kind });
}
const defIndex = firstRelease ? 1 : choices.findIndex((c) => c.kind === suggested) + 1;

let version;
if (opt.bump) {
  version = SEMVER.test(opt.bump) ? opt.bump : ['patch', 'minor', 'major'].includes(opt.bump) ? bump(current, opt.bump) : fail(`--bump invalide : ${opt.bump}`);
} else {
  choices.forEach((c, i) => console.log(`  ${bright(`${i + 1})`)} ${c.label}`));
  console.log(`  ${bright(`${choices.length + 1})`)} autre numéro`);
  console.log(`  ${bright('0)')} annuler`);
  const a = await ask('Votre choix :', String(defIndex));
  const n = Number(a);
  if (n === 0) fail('Annulé, rien n’a été modifié.');
  if (n === choices.length + 1) version = await ask('Numéro (X.Y.Z) :');
  else if (choices[n - 1]) version = choices[n - 1].version;
  else if (SEMVER.test(a)) version = a;
  else fail(`Choix invalide : ${a}`);
}
if (!SEMVER.test(version)) fail(`Numéro invalide : ${version}`, 'Format attendu : X.Y.Z');
if (!(firstRelease && version === current) && cmpSemver(version, current) <= 0) fail(`v${version} n’est pas plus récente que ${current}.`);
const tag = `v${version}`;
if (tryGit('rev-parse', '-q', '--verify', `refs/tags/${tag}`)) fail(`Le tag ${tag} existe déjà.`);
if (tryGit('ls-remote', '--tags', 'origin', `refs/tags/${tag}`)) fail(`Le tag ${tag} existe déjà sur origin.`);
ok(`version retenue : ${bright(tag)}`);

// ------------------------------------------------------------------ 4. vérifications

step('Vérifications (typecheck, tests, build)');
for (const [label, a] of [
  ['typecheck', ['run', 'typecheck']],
  ['tests', ['test']],
  ['build', ['run', 'build']],
]) {
  if (!run('npm', a)) fail(`Échec : ${label}.`, 'Corrigez avant de publier. Rien n’a été modifié.');
  ok(label);
}

// ------------------------------------------------------------------ 5. récapitulatif

const date = new Date().toISOString().slice(0, 10);
const section = changelogSection(version, commits, date);
const remote = pagesUrl();
step('Récapitulatif');
console.log(section.split('\n').map((l) => `  ${dim('│')} ${l}`).join('\n'));
info(`package.json${existsSync('package-lock.json') ? ', package-lock.json' : ''} et CHANGELOG.md passeront en ${version}`);
info(`commit « chore(release): ${tag} », tag annoté ${tag}, push de main et de ${tag}`);
if (remote) info(`le tag déclenche la mise en ligne sur ${remote.site}`);

if (opt.dry) {
  console.log(`\n${yellow('Simulation terminée : rien n’a été modifié.')}`);
  rl?.close();
  process.exit(0);
}
if (!(await confirm('Publier ?'))) fail('Annulé, rien n’a été modifié.');

// ------------------------------------------------------------------ 6. publication

step('Publication');
setJsonVersion('package.json', version);
if (existsSync('package-lock.json')) setJsonVersion('package-lock.json', version);
const head = '# Changelog\n\nToutes les versions publiées de PHOSPHOR OS.\n\n';
const previous = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8').replace(/^# Changelog\n\n(?:Toutes les versions[^\n]*\n\n)?/, '') : '';
writeFileSync('CHANGELOG.md', head + section + (previous ? '\n' + previous : ''));
ok('version et changelog mis à jour');

git('add', 'package.json', 'CHANGELOG.md', ...(existsSync('package-lock.json') ? ['package-lock.json'] : []));
git('commit', '-m', `chore(release): ${tag}`);
git('tag', '-a', tag, '-m', `${tag}\n\n${section}`);
ok(`commit et tag ${tag} créés`);

const pushed = run('git', ['push', 'origin', 'main']) && run('git', ['push', 'origin', tag]);
if (!pushed) {
  fail('Le push a échoué. Le commit et le tag existent en local.', `Réessayez : git push origin main && git push origin ${tag}\n  Ou annulez : git tag -d ${tag} && git reset --hard HEAD~1`);
}
ok(`main et ${tag} poussés`);

// ------------------------------------------------------------------ 7. GitHub

if (has('gh') && remote) {
  if (await confirm('Créer la release GitHub ?')) {
    if (run('gh', ['release', 'create', tag, '--title', tag, '--notes', section.split('\n').slice(2).join('\n')])) ok('release GitHub créée');
    else warn(`release non créée : gh release create ${tag} --generate-notes`);
  }
  if (await confirm('Suivre le déploiement ?')) {
    let id = '';
    for (let i = 0; i < 15 && !id; i++) {
      id = spawnSync('gh', ['run', 'list', '--workflow=pages.yml', '--branch', tag, '--limit', '1', '--json', 'databaseId', '-q', '.[0].databaseId'], { encoding: 'utf8' }).stdout?.trim() ?? '';
      if (!id) await new Promise((r) => setTimeout(r, 2000));
    }
    if (!id) warn('déploiement introuvable pour l’instant : gh run list --workflow=pages.yml');
    else if (run('gh', ['run', 'watch', id, '--compact', '--exit-status'])) ok(`en ligne : ${remote.site}`);
    else warn(`le déploiement a échoué : gh run view ${id} --log-failed`);
  }
} else if (remote) info(`Mise en ligne en cours : ${remote.site} (2 à 3 minutes).`);

console.log(`\n${green('✓')} ${bright(tag)} publiée.`);
rl?.close();
