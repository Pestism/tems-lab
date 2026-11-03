// EARFCN/NR-ARFCN -> band, downlink frequency, duplex. Used for the lab's
// "which band / bandwidth / duplex mode" questions. The .trp already carries a
// Band IE; this adds frequency + duplex and a fallback band from the EARFCN.

type LteBand = { band: number; fdlLow: number; nOffs: number; nHigh: number; duplex: "FDD" | "TDD" };

// 3GPP TS 36.101 Table 5.7.3-1: EARFCN downlink range [nOffs, nHigh] per band.
const LTE: LteBand[] = [
  { band: 1, fdlLow: 2110, nOffs: 0, nHigh: 599, duplex: "FDD" },
  { band: 2, fdlLow: 1930, nOffs: 600, nHigh: 1199, duplex: "FDD" },
  { band: 3, fdlLow: 1805, nOffs: 1200, nHigh: 1949, duplex: "FDD" },
  { band: 5, fdlLow: 869, nOffs: 2400, nHigh: 2649, duplex: "FDD" },
  { band: 7, fdlLow: 2620, nOffs: 2750, nHigh: 3449, duplex: "FDD" },
  { band: 8, fdlLow: 925, nOffs: 3450, nHigh: 3799, duplex: "FDD" },
  { band: 20, fdlLow: 791, nOffs: 6150, nHigh: 6449, duplex: "FDD" },
  { band: 28, fdlLow: 758, nOffs: 9210, nHigh: 9659, duplex: "FDD" },
  { band: 32, fdlLow: 1452, nOffs: 9920, nHigh: 10359, duplex: "FDD" },
  { band: 38, fdlLow: 2570, nOffs: 37750, nHigh: 38249, duplex: "TDD" },
  { band: 40, fdlLow: 2300, nOffs: 38650, nHigh: 39649, duplex: "TDD" },
  { band: 41, fdlLow: 2496, nOffs: 39650, nHigh: 41589, duplex: "TDD" },
  { band: 42, fdlLow: 3400, nOffs: 41590, nHigh: 43589, duplex: "TDD" },
  { band: 43, fdlLow: 3600, nOffs: 43590, nHigh: 45589, duplex: "TDD" },
  { band: 66, fdlLow: 2110, nOffs: 66436, nHigh: 67335, duplex: "FDD" },
];

export function lteBandOfEarfcn(earfcn: number): number | null {
  for (const b of LTE) if (earfcn >= b.nOffs && earfcn <= b.nHigh) return b.band;
  return null;
}

export function lteDownlinkMHz(earfcn: number): number | null {
  for (const b of LTE)
    if (earfcn >= b.nOffs && earfcn <= b.nHigh)
      return Math.round((b.fdlLow + 0.1 * (earfcn - b.nOffs)) * 10) / 10;
  return null;
}

// Preferred when the band is already known (from the Band IE): avoids
// misclassifying an EARFCN that sits in two bands' coarse ranges.
export function lteDownlinkMHzForBand(band: number, earfcn: number): number | null {
  const b = LTE.find((x) => x.band === band);
  return b ? Math.round((b.fdlLow + 0.1 * (earfcn - b.nOffs)) * 10) / 10 : lteDownlinkMHz(earfcn);
}

const NR_TDD = new Set([34, 38, 39, 40, 41, 48, 77, 78, 79, 90]);

export function lteDuplex(band: number): "FDD" | "TDD" | null {
  return LTE.find((b) => b.band === band)?.duplex ?? null;
}

export function nrDuplex(band: number): "FDD" | "TDD" {
  return NR_TDD.has(band) ? "TDD" : "FDD";
}

// NR global frequency from ARFCN (TS 38.104 Table 5.4.2.1-1).
export function nrDownlinkMHz(arfcn: number): number | null {
  let fRefOffs = 0;
  let nOffs = 0;
  let deltaKHz = 5;
  if (arfcn > 2016667) {
    fRefOffs = 24250.08;
    nOffs = 2016667;
    deltaKHz = 60;
  } else if (arfcn > 600000) {
    fRefOffs = 3000;
    nOffs = 600000;
    deltaKHz = 15;
  }
  if (arfcn < 0 || arfcn > 3279165) return null;
  return Math.round((fRefOffs + (deltaKHz / 1000) * (arfcn - nOffs)) * 100) / 100;
}
