# PHOSPHOR OS

Faux système d'exploitation des années 1980 dans le navigateur : écran cathodique vert 80 × 25, 100 % clavier, interface en anglais.
Spécifications : `PHOSPHOR_OS_BRIEF.md` et le canevas « PHOSPHOR OS » (25 planches).

En ligne : https://maximcuynat.github.io/phosphor-os/ (publié par `.github/workflows/pages.yml` à chaque push sur `main`).

## Lancer

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest (98 tests)
npm run build      # site statique dans dist/, sans dépendance réseau
```

L'état complet est sauvegardé dans `localStorage` (clé `phosphor.state.v1`). Pour repartir du disque d'origine, effacer cette clé (console du navigateur : `localStorage.removeItem('phosphor.state.v1')`).

## Premiers pas

- Connexion : `ADMIN`, `USER` ou `GUEST`. Les mots de passe initiaux sont vides (brief §9 : [À COMPLÉTER], à définir dans `src/config.ts`) ; `PASSWD` en fixe un.
- `HELP` : sommaire par section. `HELP DISKS` : une ligne par commande. `HELP COPY` : arguments et exemples. `HELP COPY /M` ou F1 : manuel plein écran.
- PgUp / PgDn ou Shift+↑ / Shift+↓ font défiler la console.

## Clavier sur Mac

macOS garde F1 à F12 pour la luminosité, Mission Control, le volume. Au choix :
- Réglages Système → Clavier → Raccourcis clavier → Touches de fonction → « Utiliser F1, F2, etc. comme touches de fonction standard », ou maintenir `fn` ;
- ou utiliser **Ctrl+1 … Ctrl+0 = F1 … F10** (Ctrl+Maj+8 = Shift+F8).
Alt+1 à Alt+4 valent Alt+F1 à Alt+F4 (changer de console).

## Architecture

```
src/
  main.ts            démarrage, boucle de rendu (100 ms), routage des touches
  os.ts              machine à états : allumage, boot, setup, consoles, programmes, jobs, AT, veille, plantage
  tty.ts             console virtuelle : session, pile de programmes, écran de login
  input.ts           normalisation clavier (souris ignorée)
  render/            grille 80x25, rendu DOM, thèmes vert/ambre/blanc, effets CRT
  kernel/            VFS, utilisateurs, sessions, processus et mémoire 640K, AT, journal, presse-papiers, périphériques, état
  shell/             lexer, parseur, exécuteur, .BAT, Tab, console, commandes (regroupées par domaine)
  apps/              écrans système et programmes (FILES, VIEW, EDIT, HELP, TOP, SYSINFO, LOG, DIAL, INSTALL)
  data/              disque de départ, manuel, pages d'aide, contenu du BBS
tests/               Vitest
```

Écarts au brief : les commandes sont regroupées par domaine (`shell/commands/files.ts`, …) au lieu d'un fichier par commande ; le disque par défaut est un module TypeScript (`data/default-disk.ts`) au lieu d'un JSON.

Police VT323 : SIL Open Font License 1.1 (paquet `@fontsource/vt323`, fichier LICENSE inclus).
