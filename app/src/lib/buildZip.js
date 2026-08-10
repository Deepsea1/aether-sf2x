// Minimal STORE-method (no compression) ZIP builder — pure JS, no deps.
// Lets users download the Aether Chrome extension as a ready-to-load .zip
// without a backend round-trip or an npm zip library.

function crc32Table() {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
}
const TABLE = crc32Table();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

// files: [{ name: string, data: string }] → Blob (application/zip)
export function buildZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const dataBytes = f.data instanceof Uint8Array ? f.data : enc.encode(String(f.data));
    const crc = crc32(dataBytes);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0),
      ...u32(crc), ...u32(dataBytes.length), ...u32(dataBytes.length),
      ...u16(nameBytes.length), ...u16(0),
      ...nameBytes, ...dataBytes,
    ]);
    const cent = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0),
      ...u32(crc), ...u32(dataBytes.length), ...u32(dataBytes.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
      ...nameBytes,
    ]);
    locals.push(local);
    central.push(cent);
    offset += local.length;
  }

  const cdLen = central.reduce((a, c) => a + c.length, 0);
  const cdOffset = locals.reduce((a, c) => a + c.length, 0);
  const n = files.length;
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(n), ...u16(n),
    ...u32(cdLen), ...u32(cdOffset), ...u16(0),
  ]);

  const total = cdOffset + cdLen + end.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of locals) { out.set(c, p); p += c.length; }
  for (const c of central) { out.set(c, p); p += c.length; }
  out.set(end, p);
  return new Blob([out], { type: 'application/zip' });
}