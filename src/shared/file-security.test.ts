/**
 * Tests for file security utilities
 *
 * Test Plan:
 *
 * setSecureFilePermissions (Classification: I/O boundary — real temp dir on Unix)
 *   [x] Happy: sets 0600 permissions on an existing file, returns true
 *   [x] Unhappy: non-existent path → caught internally, returns false
 *   [x] Windows: platform win32 → returns false without calling chmod
 *
 * setSecureFilePermissionsSync (Classification: I/O boundary — real temp dir on Unix)
 *   [x] Happy: sets 0600 permissions on an existing file (sync), returns true
 *   [x] Unhappy: non-existent path → caught internally, returns false
 *   [x] Windows: platform win32 → returns false without calling chmod
 *
 * setSecureDirectoryPermissions (Classification: I/O boundary — real temp dir on Unix)
 *   [x] Happy: sets 0700 permissions on an existing directory, returns true
 *   [x] Unhappy: non-existent path → caught internally, returns false
 *
 * setSecureDirectoryPermissionsSync (Classification: I/O boundary — real temp dir on Unix)
 *   [x] Happy: sets 0700 permissions on an existing directory (sync), returns true
 *
 * Note: Windows-branch tests stub process.platform with Object.defineProperty and
 * restore in afterEach. chmod is not called on win32, so the stub is safe.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, statSync, unlinkSync, rmdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import {
  setSecureFilePermissions,
  setSecureFilePermissionsSync,
  setSecureDirectoryPermissions,
  setSecureDirectoryPermissionsSync,
} from "./file-security.js";

// --- Helpers ---

/** Create a temp dir under os.tmpdir(), returning its path */
function makeTempDir(): string {
  return mkdtempSync(join(os.tmpdir(), "mouse-mcp-sec-test-"));
}

/** Create an empty temp file inside a temp dir, returning { tmpDir, tmpFile } */
function makeTempFile(): { tmpDir: string; tmpFile: string } {
  const tmpDir = makeTempDir();
  const tmpFile = join(tmpDir, "test.db");
  writeFileSync(tmpFile, "");
  return { tmpDir, tmpFile };
}

/** Save and restore process.platform around a describe block */
function stubPlatform(platform: NodeJS.Platform): () => void {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  return () => {
    if (original) {
      Object.defineProperty(process, "platform", original);
    }
  };
}

let platformRestore: (() => void) | null = null;

afterEach(() => {
  if (platformRestore) {
    platformRestore();
    platformRestore = null;
  }
});

// --- setSecureFilePermissions (async) ---

describe("setSecureFilePermissions", () => {
  it("sets 0600 permissions on an existing file and returns true", async () => {
    const { tmpDir, tmpFile } = makeTempFile();
    try {
      const result = await setSecureFilePermissions(tmpFile);

      expect(result).toBe(true);
      const mode = statSync(tmpFile).mode & 0o777;
      expect(mode).toBe(0o600);
    } finally {
      try {
        unlinkSync(tmpFile);
        rmdirSync(tmpDir);
      } catch {
        // best-effort cleanup
      }
    }
  });

  it("returns false for a non-existent path", async () => {
    const result = await setSecureFilePermissions("/tmp/mouse-mcp-does-not-exist-abc123.db");
    expect(result).toBe(false);
  });

  it("returns false on Windows (skips chmod)", async () => {
    platformRestore = stubPlatform("win32");

    const result = await setSecureFilePermissions("/any/path.db");
    expect(result).toBe(false);
  });
});

// --- setSecureFilePermissionsSync ---

describe("setSecureFilePermissionsSync", () => {
  it("sets 0600 permissions on an existing file (sync) and returns true", () => {
    const { tmpDir, tmpFile } = makeTempFile();
    try {
      const result = setSecureFilePermissionsSync(tmpFile);

      expect(result).toBe(true);
      const mode = statSync(tmpFile).mode & 0o777;
      expect(mode).toBe(0o600);
    } finally {
      try {
        unlinkSync(tmpFile);
        rmdirSync(tmpDir);
      } catch {
        // best-effort cleanup
      }
    }
  });

  it("returns false for a non-existent path (sync)", () => {
    const result = setSecureFilePermissionsSync("/tmp/mouse-mcp-does-not-exist-sync.db");
    expect(result).toBe(false);
  });

  it("returns false on Windows (sync, skips chmod)", () => {
    platformRestore = stubPlatform("win32");

    const result = setSecureFilePermissionsSync("/any/path.db");
    expect(result).toBe(false);
  });
});

// --- setSecureDirectoryPermissions (async) ---

describe("setSecureDirectoryPermissions", () => {
  it("sets 0700 permissions on an existing directory and returns true", async () => {
    const tmpDir = makeTempDir();
    try {
      const result = await setSecureDirectoryPermissions(tmpDir);

      expect(result).toBe(true);
      const mode = statSync(tmpDir).mode & 0o777;
      expect(mode).toBe(0o700);
    } finally {
      try {
        rmdirSync(tmpDir);
      } catch {
        // best-effort cleanup
      }
    }
  });

  it("returns false for a non-existent directory path", async () => {
    const result = await setSecureDirectoryPermissions("/tmp/mouse-mcp-no-such-dir-abc123");
    expect(result).toBe(false);
  });
});

// --- setSecureDirectoryPermissionsSync ---

describe("setSecureDirectoryPermissionsSync", () => {
  it("sets 0700 permissions on an existing directory (sync) and returns true", () => {
    const tmpDir = makeTempDir();
    // Create a nested temp dir inside so we can test the subdir too
    const nestedDir = join(tmpDir, "nested");
    mkdirSync(nestedDir);
    try {
      const result = setSecureDirectoryPermissionsSync(nestedDir);

      expect(result).toBe(true);
      const mode = statSync(nestedDir).mode & 0o777;
      expect(mode).toBe(0o700);
    } finally {
      try {
        rmdirSync(nestedDir);
        rmdirSync(tmpDir);
      } catch {
        // best-effort cleanup
      }
    }
  });

  it("returns false on Windows (sync directory, skips chmod)", () => {
    platformRestore = stubPlatform("win32");

    const result = setSecureDirectoryPermissionsSync("/any/dir");
    expect(result).toBe(false);
  });
});
