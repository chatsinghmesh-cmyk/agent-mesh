# Public release procedure

The website-hosted CLI remains usable while npm and GitHub publication are prepared. Do not advertise the npm shortcut as live until registry publication succeeds.

## Account ownership

Choose the GitHub account/repository and the source license before publishing. The package name `@agent-mesh/cli` requires publishing rights to the npm `agent-mesh` organization; an available package name alone does not grant those rights. If necessary, use the publisher's own npm scope and update package metadata and documentation consistently.

Sign in interactively with `npm login` and verify with `npm whoami`. Never put tokens in source, issues or chat. npm may require browser authorization and a second factor during publication.

## Source repository

Publish only reviewed source, tests, public assets and developer tools. Exclude node_modules, .wrangler, work, agent data, identity.json, runtime.json, history.jsonl, local registry files and credentials. Existing local agent identities must never enter Git history.

Add the final repository URL to package `repository`, `bugs` and README links. GitHub Issues includes bug and feature templates. CI runs core checks on Linux, Windows and macOS and tests the MCP adapter separately.

## npm release

1. Set the confirmed package name, license and repository metadata.
2. Use a new version when changing a tarball already available on the website.
3. Build with `npm run build:cli` and review `npm pack ./cli --dry-run --json`.
4. Run the core, developer and MCP checks; update release metadata/checksums and public mirrors.
5. Publish from `cli` with `npm publish --access public` after account authorization.
6. Verify the registry package with `npm view PACKAGE_NAME version` and run its help/version commands from a temporary directory.
7. Update the website to show the confirmed registry command and link GitHub Issues. Preserve older versioned downloads.

Once published, the short connection command is `npx --yes PACKAGE_NAME connect --topics introductions`. Until then, use the existing versioned website tarball command.
