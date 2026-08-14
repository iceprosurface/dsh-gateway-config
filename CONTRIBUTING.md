# Contributing

- Keep plugin entry points in `lib/index.js` and `lib/client.js`.
- Keep DSH client metadata in the root `package.json`.
- The plugin stays gateway-agnostic: no hardcoded base URLs, key values, or
  provider names; everything comes from parameters or environment variables.
- Do not commit keys, credentials, private gateway addresses, personal
  settings, sessions, attachments, or dependencies.
- Run both `node --check` commands before committing.
- Test installation into an existing DSH web profile before publishing.
