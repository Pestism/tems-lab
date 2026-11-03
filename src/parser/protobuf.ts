// Protobuf wire reader ported from reference/python/trp2csv.py.
// Varint accumulation avoids JS bitwise ops (32-bit); values fit in < 2^53.

export const EVENT = Symbol("EVENT");

export type DVNum = { k: "i" | "f"; n: number };
export type DVStr = { k: "s"; s: string };
export type DV = DVNum | DVStr;
export type Decoded = DV | typeof EVENT | null;

export type Field = [number, number, number | Uint8Array];

export function varint(b: Uint8Array, p: number): [number, number] {
  let r = 0;
  let s = 0;
  for (;;) {
    const c = b[p++];
    r += (c & 0x7f) * 2 ** s;
    if (c < 0x80) return [r, p];
    s += 7;
  }
}

export function fields(b: Uint8Array): Field[] {
  let p = 0;
  const out: Field[] = [];
  while (p < b.length) {
    let key: number;
    [key, p] = varint(b, p);
    const f = Math.floor(key / 8);
    const wt = key & 7;
    let v: number | Uint8Array;
    if (wt === 0) {
      [v, p] = varint(b, p);
    } else if (wt === 1) {
      v = b.subarray(p, p + 8);
      p += 8;
    } else if (wt === 2) {
      let n: number;
      [n, p] = varint(b, p);
      v = b.subarray(p, p + n);
      p += n;
    } else if (wt === 5) {
      v = b.subarray(p, p + 4);
      p += 4;
    } else {
      throw new Error(`unsupported wire type ${wt}`);
    }
    out.push([f, wt, v]);
  }
  return out;
}

export function* records(b: Uint8Array): Generator<Uint8Array> {
  let p = 0;
  while (p < b.length) {
    let n: number;
    [n, p] = varint(b, p);
    yield b.subarray(p, p + n);
    p += n;
  }
}

const TD = new TextDecoder("utf-8");

function asFloat(v: Uint8Array, bits: 32 | 64): number {
  const dv = new DataView(v.buffer, v.byteOffset, v.byteLength);
  return bits === 32 ? dv.getFloat32(0, true) : dv.getFloat64(0, true);
}

export function decodeValue(vf: Field[]): Decoded {
  for (const [f, , v] of vf) {
    if (f === 1) continue;
    if (f === 6) {
      const n = v as number; // zigzag
      return { k: "i", n: n % 2 === 0 ? n / 2 : -(n + 1) / 2 };
    }
    if (f === 5 || f === 7 || f === 8 || f === 9) return { k: "i", n: v as number };
    if (f === 10) return { k: "f", n: asFloat(v as Uint8Array, 32) };
    if (f === 11) return { k: "f", n: asFloat(v as Uint8Array, 64) };
    if (f === 12) return { k: "s", s: TD.decode(v as Uint8Array) };
    if (f === 15) return EVENT;
    return null;
  }
  return null;
}
