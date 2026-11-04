# PHOSPHOR OS : plan de réalisation

Sources : `PHOSPHOR_OS_BRIEF.md` et canevas « PHOSPHOR OS » (25 planches).

## Décisions
- Stack : TypeScript + Vite, sans framework, Vitest (+ jsdom pour les tests de rendu).
- Rendu : 25 lignes DOM de 80 cellules (spans par plages de style), cadres/barres en calques CSS positionnés sur la grille (bordure double 4 px).
- Police VT323 embarquée via `@fontsource/vt323` (SIL OFL 1.1, fichier de licence fourni par le paquet).
- Mots de passe initiaux ADMIN/USER : vides par défaut (brief [À COMPLÉTER]), modifiables dans `src/config.ts` ; avertissement à la connexion tant qu'ils ne sont pas définis.
- Alt+F1..F4 : aussi Alt+1..4 (Alt+F4 ferme la fenêtre sous Windows et ne peut pas être intercepté).

## Étapes
- [x] 1. Socle : grille, thème, CRT, routeur de touches, état + sauvegarde
- [x] 2. Démarrage : POWER ON, BOOT, SETUP, LOGIN, SHUTDOWN, SAFE MODE
- [x] 3. VFS + console + commandes de base + messages d'erreur (tests VFS)
- [x] 4. FILES, VIEW, EDIT, corbeille, attributs, presse-papiers
- [x] 5. Shell avancé : pipes, redirections, variables, alias, .BAT, Tab (rejouer [10])
- [x] 6. Processus : jobs, KILL, AT, mémoire, TOP, SYSINFO, LOG (rejouer [11])
- [x] 7. TTY1 à TTY4, comptes multiples, droits
- [x] 8. HELP, DIAL, INSTALL, écran de veille, erreur fatale

## Revue (2026-11-04)
- 8 étapes livrées. 98 tests Vitest verts, `tsc` propre, build Vite OK (police embarquée).
- Planches [10] et [11] rejouées à l'identique en test (erreur `NOT ENOUGH MEMORY: 228K FREE, 256K NEEDED.` comprise).
- Programmes FILES/VIEW/EDIT, TOP/SYSINFO/LOG, HELP/DIAL/INSTALL écrits par 3 agents en parallèle, puis intégrés.
- Ajouts à la demande : HELP par sections + fiche arguments/exemples ; Ctrl+1..0 = F1..F10 (Mac) ; défilement Shift+↑/↓.
- Choix assumés : trace des .BAT toujours affichée en interactif (planche [10]) ; AUTOEXEC.BAT exécuté à chaque connexion, sans trace.
- Non vérifié : rendu visuel réel (serveur local et Chrome headless bloqués par le bac à sable).
- Reste ouvert : mots de passe initiaux [À COMPLÉTER].

