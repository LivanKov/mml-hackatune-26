PYTHON ?= python3
VENV := .venv
API_PYTHON := $(VENV)/bin/python
API_PIP := $(VENV)/bin/pip
API_DIR := src/api
CLIENT_DIR := src/client

$(API_PYTHON):
	$(PYTHON) -m venv $(VENV)

api-deps: $(API_PYTHON)
	$(API_PIP) install -r $(API_DIR)/requirements.txt

client-deps:
	cd $(CLIENT_DIR) && npm install

run: api-deps client-deps
	@set -e; \
	api_pid=""; \
	client_pid=""; \
	cleanup() { \
		if [ -n "$$api_pid" ]; then kill "$$api_pid" 2>/dev/null || true; fi; \
		if [ -n "$$client_pid" ]; then kill "$$client_pid" 2>/dev/null || true; fi; \
	}; \
	trap cleanup INT TERM EXIT; \
	$(API_PYTHON) $(API_DIR)/app.py & api_pid=$$!; \
	(cd $(CLIENT_DIR) && npm run dev) & client_pid=$$!; \
	wait $$api_pid $$client_pid

debug: api-deps client-deps
	@set -e; \
	api_pid=""; \
	client_pid=""; \
	cleanup() { \
		if [ -n "$$api_pid" ]; then kill "$$api_pid" 2>/dev/null || true; fi; \
		if [ -n "$$client_pid" ]; then kill "$$client_pid" 2>/dev/null || true; fi; \
	}; \
	trap cleanup INT TERM EXIT; \
	BOTTLE_DEBUG=1 BOTTLE_RELOADER=1 $(API_PYTHON) $(API_DIR)/app.py & api_pid=$$!; \
	(cd $(CLIENT_DIR) && npm run dev) & client_pid=$$!; \
	wait $$api_pid $$client_pid

.PHONY: api-deps client-deps run debug
