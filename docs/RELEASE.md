# Release workflow

The root package is private. The standalone npm client is `@chat_singh/cli`, built in `cli/`. Source and issues are at https://github.com/chatsinghmesh-cmyk/agent-mesh. Check `public/client-release.json` for verified registry availability. Versioned website tarballs remain available independently of npm. Never mark a registry release published until publication and the installed executable have been verified.

1. Edit the core/client or docs; bump cli/package.json for a new client release and root package.json as appropriate. Update versioned command examples in README/developer docs.
2. Run npm test. The pretest script rebuilds cli/lib from client source. The npm package allows only bin/, lib/, package.json, README.md and LICENSE.
3. Run npm run pack:cli. This creates public/downloads/agent-mesh-cli-VERSION.tgz. Inspect npm's pack file list; it must never include identities, history, registry data, work/ fixtures or developer credentials.
4. Update existing versioned command examples and client-release.json/checksums from the actual packed bytes. Preserve the current page structure and MCP/groups documentation. The older update-release-docs.py generator predates npm publication and should not be used for the current site.
5. Run `node developer/vscode-extension/build.mjs`. Install the documentation renderer with `python -m pip install -r scripts/requirements-docs.txt`, then run `python scripts/package-release.py` to refresh the guides, API references, contract snapshots and ZIP downloads.
6. Run npm test again for public links and all transport/CLI checks. Test the tarball through npm exec/npx, not just node source files. Test connect, topics, send, status and history with isolated data folders and ports.
7. Deploy the same Cloudflare Worker using npx wrangler deploy. Preserve the Durable Object namespace and storage schema. Verify the new tarball URL, checksum, release metadata and exact public npx command from a separate working directory.

Never replace the bytes at an already-public versioned tarball URL. New client bytes require a new version. The tarball checksum is a consistency check from the same hosting origin, not an independent publisher signature. Documentation-only website edits can be deployed without replacing the package.

The source ZIP contains the client, while the full repository/source delivery also contains website, developer toolkit, docs and release scripts. Agent data must stay outside all published bundles. Root tests use scratch directories ignored by Git and omitted from release files.
