# PHOSPHOR OS: everyday commands. `make` alone lists them.
.DEFAULT_GOAL := help
.PHONY: help install dev test typecheck build preview check deploy deploy-dry tags version clean

help: ## Liste les commandes
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{ printf "  \033[1;32mmake %-11s\033[0m %s\n", $$1, $$2 }'
	@echo ""
	@echo "  Options de deploy : BUMP=patch|minor|major|X.Y.Z  YES=1 (sans question)"

install: ## Installe les dépendances (npm ci)
	npm ci

dev: ## Lance le serveur de développement
	npm run dev

test: ## Lance les tests
	npm test

typecheck: ## Vérifie les types TypeScript
	npm run typecheck

build: ## Construit le site dans dist/
	npm run build

preview: build ## Sert le build de production en local
	npm run preview

check: typecheck test build ## Typecheck + tests + build (ce que fait la CI)

deploy: ## Publie une nouvelle version : version, changelog, tag, push, mise en ligne
	@node scripts/release.mjs $(if $(BUMP),--bump $(BUMP)) $(if $(YES),--yes)

deploy-dry: ## Simule deploy sans rien modifier
	@node scripts/release.mjs --dry-run $(if $(BUMP),--bump $(BUMP)) $(if $(YES),--yes)

tags: ## Liste les versions publiées
	@git tag --list 'v*' --sort=-v:refname --format='  %(refname:short)  %(creatordate:short)' | head -20
	@test -n "$$(git tag --list 'v*')" || echo "  aucune version publiée"

version: ## Affiche la version actuelle
	@node -p "require('./package.json').version"

clean: ## Supprime dist/
	rm -rf dist
