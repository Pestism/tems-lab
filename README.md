# TEMS Lab Analyzer

Open a **TEMS Pocket `.trp`** drive-test log in your browser and immediately see coverage,
signal, throughput and radio parameters — and export the same CSVs the lab needs. Built for
the IK1330 lab so students don't need TEMS Investigation to analyse their walk.

**Your file never leaves your device.** The `.trp` is decoded entirely in the browser (in a Web
Worker); the server only hosts the page and receives anonymous, no-PII usage counters.

## For students

1. Open the site (the URL your instructor shares).
2. Drag your `.trp` logfile onto the page (or click to choose it).
3. Read the tabs — each notes the lab question it answers:
   - **Coverage** — your route on a map, coloured by RSRP (signal strength).
   - **Signal** — RSRP / RSRQ / SINR / RSSI over time, LTE and 5G NR.
   - **Throughput** — downlink throughput over time and per download; max 4G/5G rate.
   - **Radio params** — bands, bandwidth, duplex, modulation, MIMO, rank, transmission mode.
   - **Sessions** — each HTTP download loop and its result.
4. **Download CSV** for your report (per-second time series and a per-session summary). These
   match the reference `trp2csv.py` output exactly.

**If one run split into several files** (TEMS can start a new log when the connection drops and
reconnects), drop them together — the app detects logs from the same session and offers to combine
them into a single analysis.

**Recent files** are kept so you can reopen a log without choosing it again. They are stored only in
your own browser (never uploaded), removed automatically after six months, and clearable anytime. On
a **shared lab computer**, use **Clear all** when you are done.

Works offline except the map background tiles; the coloured route still shows without internet.

## What it reads

`.trp` is an OPC/ZIP package; the measurement data lives in protobuf-encoded `.cdf` parts and an
XML service log. The decoder (`src/parser/`) is a faithful TypeScript port of the reference
Python tool in `reference/python/trp2csv.py`, verified byte-for-byte against it in CI
(`tests/parser/parity.test.ts`).

## Develop

```bash
npm install --legacy-peer-deps   # Node 20.19+ / 22
npm run dev                      # http://127.0.0.1:8123
npm test                         # parser parity + extract + merge/group tests
npm run typecheck && npm run lint && npm run build
```

Layout:

```
src/parser/   .trp decoder (protobuf, series/aggregation, bands) + extract.ts (dashboard JSON) + worker.ts
src/components/  React UI (dropzone, charts, map, tables)
src/app/      Next.js App Router pages, layout, /api/event (anonymous telemetry)
reference/python/  golden-source parser used to generate test fixtures
tests/        vitest parity + extract tests, fixtures
```

## Deploy (Vercel)

Import the repo into Vercel and deploy — it's a standard Next.js app, no configuration needed.
Because parsing is client-side, the hosting is static + a tiny telemetry function, so it scales to
a full class on the free tier. Self-hosting works the same way (`npm run build && npm start`), and
keeps data on the machine for a privacy-sensitive lab.

### Security / privacy

- No measurement data is uploaded or sent to any server. The `/api/event` endpoint accepts only a
  fixed set of anonymous counters (parse time, coarse size bucket, success/failure), validated and
  rate-limited.
- "Recent files" are cached **locally in the browser** (IndexedDB) so a log can be reopened without
  re-selecting it. This never leaves the device, auto-expires after six months, and is cleared by
  **Clear all** — relevant on shared machines, since a `.trp` contains the GPS track of the walk.
- Analytics are cookieless (Vercel Analytics + Speed Insights), so no consent banner is required.
- Strict Content-Security-Policy and security headers are set in `next.config.mjs`. All values
  shown come from the file and are rendered as text (no HTML injection).

## License

MIT — see [LICENSE](LICENSE).
