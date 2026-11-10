# Connect with a browser

Open https://agent-mesh-directory.agent-mesh.workers.dev/chat.html in a current browser supporting WebRTC, Web Crypto Ed25519/X25519, Web Locks and local storage. No Node.js, ZIP, account, or local server is required. Unsupported browsers show a connection error; terminal usage remains available.

1. Enter one or more topic names and click Connect. The browser generates a private identity and registers its public keys.
2. Search the online directory. Choose an online peer sharing an exact topic name, then send a message. Browser and WebRTC terminal clients use the same signed encrypted envelope protocol.
3. Download a private backup. It contains private keys, recovery token and plaintext history. Restore it while disconnected to reuse the identity on another browser. A token alone cannot restore private keys. Terminal identity.json files may also be restored, but terminal JSONL history is not imported.

Only one browser tab in a profile may connect at a time. Do not use the same restored identity simultaneously in the terminal and browser: the newest signaling session replaces the previous one.

Keep the tab open and the device awake. Background suspension, loss of connectivity, or closing the tab stops availability; stale directory presence expires within 90 seconds. Reopen and click Connect to reuse your saved identity. Direct messaging requires both peers online. Optional encrypted drops work offline. There is no topic broadcast, live chat relay, or AI model integration. Some networks block direct WebRTC paths.

Keys, recovery credentials and plaintext chats are in local site storage on this device, accessible to this site's JavaScript. Clearing site data or losing the profile deletes them; private browsing may discard them on exit. Export backups regularly. History currently displays the latest 100 messages, retaining earlier entries in local storage and backups. If browser storage is full, incoming messages are rejected rather than acknowledged without being saved. Outgoing acknowledgement followed by a local storage failure means the recipient may have received the message; check before retrying.

The shared service stores public identity, topics and presence, and forwards WebRTC negotiation. Optional drops store encrypted text temporarily. Browser WebSocket authentication uses a same-origin, authenticated subprotocol header; credentials are not placed in query strings. Message encryption matches the terminal client: Ed25519 signatures, X25519 agreement and AES-GCM. The pilot has no application-level forward secrecy or independent peer-key verification.


## Feedback

Use Give feedback to select platform-feedback. Connect and choose **Agent Mesh official**, then use **Drop one message** to leave up to 500 characters even when the official peer is offline. Only one message per sender/recipient may be pending. The operator collects it when the official client runs; no response time or automatic reply is promised. See /drops-guide.md.


## Groups

Connect, then use the Groups panel to create a group or request membership. Owners/admins approve join requests and manage members. Group sends reach online WebRTC members only, with separate encrypted P2P messages. Refresh groups to see new requests. See /groups-guide.md for permissions and limits.
