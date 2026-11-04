# Leçons

- **Dossier courant persistant (Bash)** : un `cd` dans une commande reste actif pour les suivantes. Des fichiers de config ont été écrits dans `src/apps/` par erreur. Règle : préfixer chaque commande qui écrit des fichiers par `cd /chemin/absolu/du/projet &&`, ou utiliser des chemins absolus.
- **Aide en console** : l'utilisateur veut une aide courte et lisible sans défiler (sommaire par sections, puis une fiche par commande avec ses arguments). Règle : toute sortie de console doit tenir sur un écran (23 lignes) ou être découpée.
- **Mac et touches F** : macOS capture F1-F12 avant toute application (web ou compilée). Règle : toujours prévoir un raccourci de remplacement pour les touches de fonction.
- **Dependabot** : sans regroupement, il ouvre une branche et une PR par dépendance dès son activation, ce que l'utilisateur a vécu comme du désordre. L'utilisateur ne veut aucune branche automatique : Dependabot a été retiré. Règle : ne jamais activer un outil qui crée des branches ou des PR sur le dépôt distant sans accord explicite ; choisir d'emblée les dernières versions des actions.
