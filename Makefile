SHELL := /bin/zsh

PNPM := corepack pnpm
SIGNOZ_OTLP_HTTP_ENDPOINT ?= http://127.0.0.1:4318

.PHONY: help check-env install dev

help:
	@echo "Available targets:"
	@echo "  make install  Install workspace dependencies with pnpm 10.13.1"
	@echo "  make dev      Start the Electron desktop app in development mode"

check-env:
	@command -v node >/dev/null 2>&1 || { \
		echo "Node.js is not installed. Install Node.js 22 first."; \
		exit 1; \
	}
	@node -e 'const major = Number(process.versions.node.split(".")[0]); if (major !== 20 && major !== 22) { console.error(`Expected Node.js 20 or 22, found $${process.version}. Run: nvm use 22`); process.exit(1) }'
	@command -v corepack >/dev/null 2>&1 || { \
		echo "Corepack is unavailable. Enable it with: corepack enable"; \
		exit 1; \
	}

install: check-env
	$(PNPM) install

dev: check-env
	UNILABOS_OTLP_HTTP_ENDPOINT=$(SIGNOZ_OTLP_HTTP_ENDPOINT) \
	UNILABOS_OTEL_ENABLED=true \
	OTEL_EXPORTER_OTLP_ENDPOINT=$(SIGNOZ_OTLP_HTTP_ENDPOINT) \
	OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf \
	OTEL_EXPORTER_OTLP_INSECURE=true \
	OTEL_SERVICE_NAME=uni-lab-edge-local \
	OTEL_DEPLOYMENT_ENVIRONMENT=development \
	$(PNPM) dev:desktop
