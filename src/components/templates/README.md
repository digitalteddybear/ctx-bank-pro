# CTX templates

Place adapted templates under their dashboard area, for example `agents/`,
`home/` or `knowledge-bank/`, once supplied. Record source, title, version,
tags, intended behaviour and status in `docs/ui/component-catalogue.md`.

Inspect installer changes before allowing overwrites. Use Astryx for layout,
controls and overlays; reuse application theme and tokens. Keep package code
in npm dependencies rather than copying it into this directory.
