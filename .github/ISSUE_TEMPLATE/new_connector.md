---
name: New Connector
about: Propose or track implementation of a new data source connector
title: "connector: Add [connector name] connector"
labels: ["connector", "enhancement"]
assignees: []
---

## Connector

**Name**: <!-- e.g. PagerDuty -->
**Category**: <!-- e.g. Incident Management -->
**API docs**: <!-- Link to API documentation -->

## Data to Sync

<!-- What data would this connector sync? -->

- [ ] Item type 1 (e.g. incidents)
- [ ] Item type 2

## Authentication Method

<!-- How does authentication work? PAT? OAuth? API key? -->

## Embeddable Fields

<!-- Which text fields would be embedded for semantic search? -->

## Schema Changes Needed

<!-- Does this require new database tables, or does it fit the existing unified schema? -->

- [ ] New table needed
- [ ] Fits `tickets` table (for issue trackers)
- [ ] Fits `sentry_issues` table (for error trackers)
- [ ] Other:

## Implementation Notes

<!-- Any notes about rate limits, pagination, data volume, etc. -->

## Checklist

- [ ] `types.ts` — credential + config types
- [ ] `client.ts` — API client factory
- [ ] `sync.ts` — extends `BaseConnector`, full sync + incremental sync
- [ ] Register in `sync.worker.ts` `resolveConnector()`
- [ ] Add embed sources in `embed.worker.ts`
- [ ] Add keyword + vector search cases
- [ ] Tests
- [ ] Documentation
