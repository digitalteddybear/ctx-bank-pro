# Netron renderer subset

This directory contains a pinned subset of Netron `v9.1.8`:

- `grapher.js`
- `dagre.js`
- `grapher.css` as an upstream styling reference
- `LICENSE`

Upstream: https://github.com/lutzroeder/netron

Pinned tag commit: `11f2019c52cfd51df63bcab99e873cb0fa728fd7`

Local modifications:

- Graph edge identity includes an optional `name`.
- The name is passed through Dagre layout so parallel typed relationships between
  the same source and target remain distinct.
- A test-only dynamic `fs` import was removed so the renderer can be bundled for
  the browser by Next.js.

The application imports only `grapher.js` and its dynamic `dagre.js` dependency.
Netron model parsers, Electron code, browser host, and application shell are not
included.
