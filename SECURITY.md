# Security notes

## Threat model

The `.trp` logfile is **untrusted input** and is parsed **entirely in the student's browser**
(in a Web Worker). It is never uploaded, so there is no server-side data to leak and no cross-user
exposure. A malformed or malicious file can only affect the tab that opened it.

Parsed logs are cached **locally in the browser** (IndexedDB) for the "Recent files" list so a log
can be reopened without re-selecting it. This data never leaves the device and is not reachable by
the server. It auto-expires after 180 days, is capped (20 files / 500 MB, oldest evicted), and is
clearable from the UI (**Clear all** / per-file **Delete**). On a **shared machine** this cache is
visible to the next user of the same browser profile — and a `.trp` contains the GPS track of the
walk — so the UI discloses this and offers one-click clearing. All IndexedDB access is wrapped so a
blocked/absent store (private mode) degrades to "no history" without breaking parsing.

Hardening against a bad file:
- Input size capped (200 MB) before parsing.
- XML from the log is parsed with **entity processing disabled** (`processEntities: false`) to
  prevent entity-expansion denial of service.
- ZIP/zlib handled by `fflate` (patched release); only the known `.cdf` / `services.xml` members
  are read — nothing is extracted to a filesystem, so there is no path-traversal surface.
- All strings decoded from the file are rendered as React text (never `dangerouslySetInnerHTML`),
  so a crafted cell name or URL cannot inject markup/script.

## Server surface

The only server endpoint is `POST /api/event`, which records **anonymous, fixed-schema** counters
(parse time, coarse size bucket, success/failure, panel names). It validates the shape, caps the
body size, rate-limits per IP, and stores nothing from the measurement data. Analytics are
cookieless (no consent banner required).

A strict Content-Security-Policy and standard security headers are set in `next.config.mjs`.

## Dependency posture

`npm audit` is run in CI. Addressed (these are in the untrusted-input / hosted-server path):
- **fast-xml-parser** → upgraded to the patched 5.x line (entity-expansion / DOCTYPE CVEs).
- **fflate** → patched release (malformed-ZIP64 infinite loop).
- **next** → patched 15.x (dev-server info exposure, cache poisoning, React-flight RCE, etc.).

Accepted, not applicable:
- **postcss** advisories (XSS-in-stringify, `sourceMappingURL` file read) are flagged via the copy
  of postcss that Next uses at **build time** to process this project's own authored CSS. They
  require attacker-controlled CSS or source maps, which never occurs here, and are not present in
  the deployed runtime bundle. They clear whenever Next bumps its bundled postcss.
- Remaining `npm audit` items are dev-only tooling (vitest/vite/esbuild, playwright, eslint
  plugins) that never ship to users.

## Reporting

Open a private security advisory on the repository.
