.PHONY: help install dev build test lint format db-migrate db-reset docker-build docker-up docker-down deploy-staging deploy-production

help:
	@echo "Legal Automation Tool - Commands"
	@echo "=================================="
	@echo "Development:"
	@echo "  make install       - Install dependencies"
	@echo "  make dev           - Start development server"
	@echo "  make build         - Build TypeScript"
	@echo "  make test          - Run tests"
	@echo "  make lint          - Run linter"
	@echo "  make format        - Format code"
	@echo ""
	@echo "Database:"
	@echo "  make db-migrate    - Run migrations"
	@echo "  make db-reset      - Reset database"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build  - Build Docker image"
	@echo "  make docker-up     - Start containers"
	@echo "  make docker-down   - Stop containers"
	@echo ""
	@echo "Deployment:"
	@echo "  make deploy-staging     - Deploy to staging"
	@echo "  make deploy-production  - Deploy to production"

install:
	npm install

dev:
	npm run dev

build:
	npm run build

test:
	npm test

test-watch:
	npm test -- --watch

test-coverage:
	npm test -- --coverage

lint:
	npm run lint

lint-fix:
	npm run lint:fix

format:
	npm run format

type-check:
	npm run type-check

db-migrate:
	npm run db:migrate

db-reset:
	npm run db:reset

docker-build:
	docker build -t legal-automation:latest .

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f app

docker-shell:
	docker-compose exec app sh

deploy-staging:
	@echo "Deploying to staging..."
	git push origin $(shell git rev-parse --abbrev-ref HEAD)
	@echo "✓ Pushed to remote"
	@echo "TODO: Configure actual staging deployment"

deploy-production:
	@echo "⚠️  Production deployment!"
	@read -p "Are you sure? (yes/no) " confirm && [ "$$confirm" = "yes" ] || exit 1
	git push origin main
	@echo "✓ Pushed to main"
	@echo "TODO: Configure actual production deployment"

clean:
	rm -rf dist node_modules coverage .turbo

fresh: clean install build

logs:
	npm run dev 2>&1 | tail -f

check: lint type-check test
	@echo "✓ All checks passed"

ready: install lint type-check build test
	@echo "✓ Project ready for deployment"
