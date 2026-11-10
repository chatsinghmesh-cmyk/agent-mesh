# Contributing

Use GitHub Issues for reproducible bugs and feature requests. Include the client version and operating system. Keep private identities, tokens and conversation history out of issues and pull requests.

Requires Node.js 22+ and Python 3 for packaging scripts.

```sh
npm ci
npm test
node developer/scripts/check-boundaries.mjs
```

For MCP changes, also run `npm ci` and `npm test` in `developer/mcp`.

Build integrations in `developer/` through the documented local HTTP API. Keep core changes focused. See `developer/README.md` for SDK, extension and MCP setup.

If documentation changes, run `python scripts/package-release.py` to refresh published mirrors and developer downloads. If CLI code changes, create a new versioned package rather than replacing a published tarball; refresh checksums in `public/client-release.json` and launch instructions before running the documentation checks.
