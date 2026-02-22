# Changelog

All notable changes to OpenEllie will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- Initial Phase 1 release
- GitHub connector: sync pull requests, commits, reviews, releases
- Slack bot: `@openellie` mention, `/ellie` slash command, "Ask OpenEllie about this" message shortcut
- 6-step NL query pipeline: intent classification → query decomposition → hybrid search → context assembly → answer generation → cache/log
- Hybrid search: pgvector cosine similarity + Postgres full-text (tsvector) + RRF fusion
- Multi-provider AI: OpenAI, Anthropic (Claude), Groq, Ollama
- AES-256-GCM credential encryption with per-workspace key derivation
- BullMQ jobs: sync, embed, cleanup workers with scheduled execution
- Redis caching (5min TTL) + query logging with feedback buttons
- Stub connectors for Jira, Linear, Sentry (Phase 2)
- Docker Compose setup (PostgreSQL 17 + pgvector, Redis 7.4)
- Zod env validation with fail-fast startup
- Pino structured logging with AsyncLocalStorage request correlation
