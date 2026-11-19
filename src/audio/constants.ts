/** Samples per capture chunk and per decoder block. Re-exported by phase-chunker.ts. */
export const CHUNK_SAMPLES = 1024;

/**
 * The one decode rate. ggwave 0.4.0 cannot decode with sampleRateInp 44,100 (verified), although
 * encoding at 44,100 works. Capture is resampled to this rate when the context runs at another.
 */
export const RX_SAMPLE_RATE = 48000;

/** Design parameter. About 1.4 s of audio at 48 kHz. Beyond this the decode worker drops the oldest chunks. */
export const MAX_QUEUE_CHUNKS = 64;
