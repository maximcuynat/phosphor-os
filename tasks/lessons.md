# Leçons

- **Dossier courant persistant (Bash)** : un `cd` dans une commande reste actif pour les suivantes. Des fichiers de config ont été écrits dans `src/apps/` par erreur. Règle : préfixer chaque commande qui écrit des fichiers par `cd /chemin/absolu/du/projet &&`, ou utiliser des chemins absolus.
- **Aide en console** : l'utilisateur veut une aide courte et lisible sans défiler (sommaire par sections, puis une fiche par commande avec ses arguments). Règle : toute sortie de console doit tenir sur un écran (23 lignes) ou être découpée.
- **Mac et touches F** : macOS capture F1-F12 avant toute application (web ou compilée). Règle : toujours prévoir un raccourci de remplacement pour les touches de fonction.
