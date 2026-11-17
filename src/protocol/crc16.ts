/**
 * CRC-16/CCITT-FALSE: polynomial 0x1021, init 0xFFFF, no reflection,
 * no final XOR. Check value: crc16("123456789") = 0x29B1.
 * Internal helper of the frame codec. Not exported from `index.ts`.
 * Does not mutate its input and never throws for a Uint8Array.
 */

const TABLE: Uint16Array = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    table[i] = crc & 0xffff;
  }
  return table;
})();

/** Returns the CRC-16/CCITT-FALSE of `bytes`, in the range 0..0xFFFF. */
export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    crc = ((crc << 8) ^ (TABLE[((crc >> 8) ^ b) & 0xff] ?? 0)) & 0xffff;
  }
  return crc;
}
