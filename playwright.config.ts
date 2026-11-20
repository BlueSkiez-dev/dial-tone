import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const DEV_PORT = 5173;
const PREVIEW_PORT = 4173;
// PowerShell blocks npm.ps1 on Windows, so use the npm.cmd shim there.
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
// The fake microphone plays this file on a loop (Chromium flags below).
const FAKE_MIC_WAV = fileURLToPath(
  new URL("./tests/fixtures/call-known-frame.wav", import.meta.url),
);

const chromiumUse = {
  ...devices["Desktop Chrome"],
  viewport: { width: 390, height: 844 },
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${FAKE_MIC_WAV}`,
    ],
  },
};

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // One worker: the real-audio tests decode in real time, and parallel Chromium instances
  // starve the decode worker (chunks dropped, frames never heard).
  workers: 1,
  reporter: [["list"]],
  projects: [
    {
      // vite dev: FakeTransport, gallery and reachability tests.
      name: "dev",
      testMatch: /(gallery|reachability|hook|slots|fluid)\.spec\.ts/,
      use: { ...chromiumUse, baseURL: `http://localhost:${DEV_PORT}/` },
    },
    {
      // vite build + preview: real audio and offline. Base is /dial-tone/.
      name: "preview",
      testIgnore: /(gallery|reachability|hook|slots|fluid)\.spec\.ts/,
      use: {
        ...chromiumUse,
        baseURL: `http://localhost:${PREVIEW_PORT}/dial-tone/`,
      },
    },
  ],
  webServer: [
    {
      command: `${NPM} run dev -- --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `${NPM} run build && ${NPM} run preview -- --port ${PREVIEW_PORT} --strictPort`,
      url: `http://localhost:${PREVIEW_PORT}/dial-tone/`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
