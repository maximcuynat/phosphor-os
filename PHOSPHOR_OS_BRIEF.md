# PHOSPHOR OS : brief de développement pour Claude Code

Ce document décrit tout ce qu'il faut pour coder PHOSPHOR OS, un faux système d'exploitation des années 1980 dans le navigateur : écran cathodique vert, 100 % clavier, interface en anglais.

Les maquettes de chaque écran se trouvent sur le canevas Claude « PHOSPHOR OS » (25 planches). Les numéros entre crochets, par exemple [13], renvoient au numéro de chaque planche.

---

## 1. Contraintes non négociables

- **Clavier uniquement.** Aucune action à la souris, aucun curseur visible. Les clics sont ignorés.
- **Interface 100 % en anglais**, en MAJUSCULES, avec des noms de fichiers au format 8.3 (`README.TXT`).
- **Grille texte de 80 colonnes × 25 lignes.** Tout est aligné sur cette grille.
- **Phosphore vert monochrome** (avec les thèmes ambre et blanc en option dans SETUP).
- **Aucune dépendance réseau à l'exécution**, sauf la police VT323 (Google Fonts), qu'il vaut mieux embarquer en local.
- Le réseau (DIAL, BBS) est **entièrement simulé**.

## 2. Stack proposée (modifiable)

- **TypeScript + Vite**, application monopage, sans framework UI.
- Rendu dans le DOM : un conteneur de 80 × 25 cellules, ou un `<pre>` par ligne. Le canvas 2D est à éviter pour garder le texte net et sélectionnable par les outils.
- **Tests** : Vitest pour le noyau (système de fichiers, parseur du shell, processus).
- **Persistance** : tout l'état dans `localStorage`, sous la clé `phosphor.state.v1` (voir §8).

## 3. Architecture

```
src/
  main.ts                 démarrage, boucle de rendu, routage des touches
  render/
    screen.ts             grille 80x25, écriture de cellules, inverse vidéo
    crt.css               scanlines, lueur, fond radial, curseur
    theme.ts              palettes vert / ambre / blanc
  kernel/
    vfs.ts                système de fichiers : lecteurs, nœuds, attributs, corbeille
    users.ts              comptes, connexion, verrouillage
    sessions.ts           TTY1 à TTY4 : cwd, env, alias, historique
    processes.ts          PID, jobs, arrière-plan, mémoire 640K
    scheduler.ts          tâches AT
    log.ts                journal EVENTS.LOG
    clipboard.ts
    devices.ts            CON, KBD, CLOCK, PRN, COM1, A:, C: (simulés)
    state.ts              état global, sauvegarde et chargement
  shell/
    lexer.ts  parser.ts   jetons, pipes, redirections, &, variables, alias
    commands/*.ts         une commande par fichier (DIR, COPY, ...)
    batch.ts              exécution des .BAT (IF, FOR, ECHO, %1)
    complete.ts           autocomplétion avec Tab
  apps/
    boot.ts setup.ts login.ts safemode.ts shutdown.ts
    screensaver.ts fatal.ts poweron.ts
    files.ts view.ts edit.ts help.ts top.ts sysinfo.ts log.ts dial.ts install.ts
  data/
    default-disk.json     disque de départ (voir §9)
    help/*.txt            pages du manuel
```

Chaque application expose la même interface :

```ts
interface App {
  id: string;
  memK: number;                  // mémoire réservée au lancement
  onEnter(ctx: Ctx, args: string[]): void;
  onKey(ctx: Ctx, e: KeyEvent): void;   // ESC = retour à la console
  render(screen: Screen): void;
  onExit?(ctx: Ctx): void;
}
```

## 4. Rendu et design (voir [25] Référence)

| Rôle | Couleur |
|---|---|
| Fond d'écran | `#031407` |
| Texte, fond de sélection | `#33FF66` |
| Texte vif : titres, dossiers, alertes | `#7DFF9A` |
| Texte atténué : libellés, panneau inactif | `#23A84A` |
| Fond de la barre de touches, filets | `#1A7A36` |
| Texte sur la barre de touches | `#C8FFD6` |

- **Police** : VT323, 22 px, interligne 25 px.
- **Sélection** : vidéo inverse (fond `#33FF66`, texte `#031407`, sans lueur).
- **Panneaux** : bordure double de 4 px.
- **Scanlines** : une ligne noire de 1 px à 28 % d'opacité toutes les 3 px, en calque au-dessus de tout.
- **Lueur** : `text-shadow: 0 0 3px rgba(51,255,102,.85), 0 0 12px rgba(51,255,102,.35)` (niveau 6 sur 12, réglable).
- **Curseur** : bloc plein, clignotement de 1,06 s.
- **Allumage [01]** : écran noir, puis un point (120 ms), puis une ligne (260 ms), puis l'écran complet (420 ms) avec une luminosité de départ à 160 % qui redescend à 100 %. L'extinction joue la même animation à l'envers en 300 ms.
- **Messages** : erreur en vidéo inverse, avertissement en vif, info en atténué. Toujours une seule ligne qui dit ce qui s'est passé, puis quoi faire.

## 5. Écrans

| # | Écran | On y entre par | Touches principales |
|---|---|---|---|
| 01 | Power on | chargement de la page, ou REBOOT | aucune |
| 02 | Boot | après l'allumage | ESC : SETUP, F8 : SAFE MODE |
| 03 | Setup | ESC pendant le boot | ↑↓ sélectionner, ←→ changer, F9 valeurs par défaut, F10 enregistrer et redémarrer, ESC quitter sans enregistrer |
| 04 | Safe mode | F8 au boot ou au login | console réduite, sans AUTOEXEC.BAT ni login |
| 05 | Login | fin du boot | Tab champ suivant, Entrée, F8, F10, Alt+F2 |
| 06 | Screensaver | 5 min d'inactivité | n'importe quelle touche (mot de passe si verrouillé) |
| 07 | Fatal error | plantage d'une application | n'importe quelle touche : redémarrer, F8 : safe mode |
| 08 | Shutdown | `SHUTDOWN` | n'importe quelle touche : rallumer |
| 09-11 | Console | connexion réussie | historique ↑↓, Tab, Alt+F1 à F4 |
| 12 | Help | `HELP [CMD]` ou F1 | ↑↓ sujet, Entrée, Tab liens, `/` recherche |
| 13 | Files | `FILES` | ↑↓, Entrée, Retour arrière, Tab, F1 à F10 (voir barre), Ctrl+C/X/V |
| 14 | Confirmation | F8 dans FILES | Y, N, ←→, Entrée, ESC. Shift+F8 : supprimer définitivement |
| 15 | View | F3 ou `VIEW FICHIER` | ↑↓, PgUp/PgDn, `/`, N, G, F4 |
| 16 | Edit | F4 ou `EDIT FICHIER` | Ctrl+S, Ctrl+F, Ctrl+G, Ctrl+X, Ins, ESC |
| 17 | Top | `TOP` | ↑↓, K, S, +/-, H |
| 18 | Sysinfo | `SYSINFO`, `MEM`, `CHKDSK` | C, M, D, R |
| 19 | Log | `LOG` | ↑↓, F filtre, `/`, Fin, E |
| 20 | Dial | `DIAL NUMÉRO` | lettres du menu BBS, Alt+H raccrocher |
| 21 | Install | `INSTALL FICHIER.PKG` | Entrée, ESC |

Dans tout programme, **ESC ramène à la console**. La carte complète des enchaînements est sur [22].

## 6. Navigation (machine à états)

```
POWER_ON -> BOOT -> LOGIN -> CONSOLE(tty) -> SHUTDOWN -> POWER_ON
BOOT --ESC--> SETUP --F10--> POWER_ON
BOOT|LOGIN --F8--> SAFE_MODE
CONSOLE --commande--> APP --ESC--> CONSOLE
FILES --F3--> VIEW --F4--> EDIT ;  FILES --F4--> EDIT ;  FILES --F8--> CONFIRM
global : inactivité -> SCREENSAVER ; plantage -> FATAL ; Alt+F1..F4 -> autre TTY
```

Chaque TTY garde son propre utilisateur, son dossier courant, son historique et l'écran ouvert.

## 7. Shell (voir [09] à [11])

- **Invite** : définie par `PROMPT`. Valeur par défaut `$U@$P$G`, ce qui donne `ADMIN@A:\DOCS>`. Codes : `$U` utilisateur, `$P` chemin, `$G` `>`, `$T` heure.
- **Grammaire** : `commande [args] [> fichier | >> fichier] [| commande ...] [&]`
- **Variables** : `SET VAR=VALEUR`, lues avec `%VAR%`. `PATH` sert à trouver les `.BAT` et les programmes installés.
- **Alias** : `ALIAS LS=DIR /W`, développés avant l'analyse.
- **Jokers** : `*` et `?` dans les noms.
- **Fichiers .BAT** : une commande par ligne, avec `ECHO`, `ECHO OFF`, `IF EXIST`, `IF NOT`, `FOR %%F IN (*.TXT) DO ...` et les paramètres `%1` à `%9`.
- **Tab** : complète les commandes, puis les fichiers du dossier courant. Plusieurs choix s'affichent dans une bulle sous la ligne.
- **Jobs** : `&` lance en arrière-plan, `JOBS` liste, `FG N` ramène au premier plan, Ctrl+Z renvoie en arrière-plan, `KILL PID` arrête. Un message s'affiche à la fin d'un job (`[1] DONE ...`).
- **Droits** : `GUEST` ne peut pas modifier les fichiers `S`, ni lancer `SHUTDOWN`, `INSTALL` ou `ATTR +S`.

La liste complète des commandes est sur la planche [25].

## 8. Modèle de données (voir [24])

L'état global est un seul objet JSON, sauvegardé à chaque changement :

```json
{
  "version": 1,
  "drives": { "A": { "label": "SYSTEM", "capacity": 368640, "root": { } }, "B": { }, "C": { } },
  "users": [ { "name": "ADMIN", "role": "admin", "passwordHash": "", "failedTries": 0, "lockedUntil": null, "lastLogin": null } ],
  "sessions": [ { "tty": 1, "user": "ADMIN", "cwd": "A:\\", "env": { }, "aliases": { }, "history": [], "screen": "console" } ],
  "processes": [ ],
  "tasks": [ ],
  "log": [ ],
  "clipboard": null,
  "settings": { "phosphor": "green", "glow": 6, "scanlines": true, "cursorBlinkMs": 1060, "screensaverMin": 5, "lockOnWake": true, "powerOnEffect": true }
}
```

Un nœud de fichier contient : `name`, `ext`, `type` (`file` ou `dir`), `attrs` (4 caractères `RSHA`, `-` si absent), `size`, `modified`, `owner`, `content`, et `children` pour un dossier.

**Mémoire** : 640K au total. Le noyau (96K) et les pilotes (64K) sont fixes. Chaque processus réserve `memK` au lancement. Si la mémoire libre est insuffisante, le lancement est refusé avec `NOT ENOUGH MEMORY: X FREE, Y NEEDED.`

## 9. Disque par défaut (premier démarrage)

```
A:\  (SYSTEM)
  AUTOEXEC.BAT ---A   CONFIG.SYS RS--    README.TXT ---A   NOTES.TXT ---A
  TODO.TXT ---A       LOGO.TXT ----      PHOSPHOR.SYS RSH- SECRET.TXT --H-
  DOCS\     MANUAL.TXT  CHANGES.TXT  IDEAS.TXT  BUDGET.DAT  LETTERS\
  GAMES\
  SYSTEM\   -SH-   EVENTS.LOG  CRASH.LOG
B:\  (DATA)   BACKUP\   SNAKE.PKG
C:\  (HARD DISK)   BIN\   TEMP\   TRASH\   GAMES\
```

**Comptes de départ** : `ADMIN` (admin), `USER` (utilisateur) et `GUEST` (sans mot de passe). Les mots de passe initiaux de `ADMIN` et `USER` sont : **[À COMPLÉTER]**. Il faudra les changer à la première connexion avec `PASSWD`.

Le contenu des fichiers texte reprend celui des maquettes ([16] README, [15] MANUAL chapitre 4, [04] AUTOEXEC.BAT).

## 10. États et messages d'erreur (voir [23])

Il faut utiliser exactement ces textes :

- `NO FILES IN <PATH>.  F7 TO MAKE A FOLDER.`
- `DISK FULL: 0 BYTES FREE ON B:.  COPY CANCELLED.`
- `ACCESS DENIED: <FILE> IS READ-ONLY.`
- `TRASH IS EMPTY.`
- `FILE NOT FOUND: <NAME>.  DID YOU MEAN <SUGGESTION>?` (suggestion si la distance est de 1 ou 2 lettres)
- `REQUIRED PARAMETER MISSING.  USAGE: <USAGE>`
- `BAD COMMAND OR FILE NAME.  TYPE HELP.`
- `ADMIN ONLY: <CMD>.  YOU ARE <USER>.`
- `NOT READY READING DRIVE <X>:  ABORT, RETRY, FAIL?` (bloquant, seules A, R et F sont acceptées)
- `SAVE CHANGES TO <FILE>?  (Y/N/ESC)`
- `FILE TOO LARGE TO EDIT (MAX 64K).  OPEN IN VIEW? (Y/N)`
- `LOGIN INCORRECT.  <N> ATTEMPTS LEFT.` puis `ACCOUNT LOCKED.  TRY AGAIN IN 60 S.`
- `NOT ENOUGH MEMORY: <X>K FREE, <Y>K NEEDED.`
- `BUSY.  NO CARRIER.  R TO REDIAL, ESC TO CANCEL.`

Chaque erreur et chaque avertissement est aussi inscrit dans `EVENTS.LOG`.

## 11. Plan de livraison

Chaque étape doit être jouable de bout en bout avant de passer à la suivante.

1. **Socle** : grille 80×25, thème, effets cathodiques, routeur de touches, état et sauvegarde. *Fini quand* un écran de texte s'affiche avec scanlines, lueur et curseur, et que l'état survit à un rechargement de la page.
2. **Démarrage** : allumage, boot, setup, login, shutdown. *Fini quand* on peut démarrer, se connecter, changer le thème dans SETUP et éteindre.
3. **Système de fichiers et console** : VFS, commandes de base (DIR, CD, TYPE, COPY, MOVE, DEL, MKDIR), messages d'erreur. *Fini quand* les tests du VFS passent et que toutes les commandes de [09] fonctionnent.
4. **FILES, VIEW, EDIT** avec corbeille, attributs et presse-papiers. *Fini quand* on peut copier, déplacer, mettre à la corbeille, restaurer et éditer un fichier sans souris.
5. **Shell avancé** : pipes, redirections, variables, alias, .BAT, Tab. *Fini quand* la session de la planche [10] se rejoue à l'identique.
6. **Processus** : jobs, KILL, AT, mémoire, TOP, SYSINFO, LOG. *Fini quand* la session de la planche [11] se rejoue, y compris l'erreur de mémoire.
7. **Consoles virtuelles** TTY1 à TTY4, comptes multiples et droits.
8. **HELP, DIAL (BBS simulé), INSTALL**, écran de veille et erreur fatale.

## 12. Hors périmètre pour l'instant

Sons, options d'accessibilité, jeux (SNAKE est seulement un paquet d'exemple à installer), easter eggs, vrai réseau.

## 13. À vérifier ou compléter

- Mots de passe initiaux des comptes : **[À COMPLÉTER]**.
- Contenu complet des pages d'aide et de `MANUAL.TXT` : à rédiger (seuls des extraits figurent sur les maquettes).
- Licence de la police VT323 (SIL Open Font License) : à confirmer avant de l'embarquer dans le projet.
