import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWrite } from '../src/index.js';

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'atomic-write-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('writes a string to a new file', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'hello.txt');
    await atomicWrite(file, 'hello world');
    const content = await readFile(file, 'utf8');
    assert.equal(content, 'hello world');
  });
});

test('overwrites an existing file', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'existing.txt');
    await writeFile(file, 'old content');
    await atomicWrite(file, 'new content');
    const content = await readFile(file, 'utf8');
    assert.equal(content, 'new content');
  });
});

test('writes a Buffer', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'buffer.bin');
    const data = Buffer.from([0x00, 0x01, 0xff]);
    await atomicWrite(file, data);
    const content = await readFile(file);
    assert.deepEqual(content, data);
  });
});

test('writes a Uint8Array', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'uint8.bin');
    const data = new Uint8Array([1, 2, 3]);
    await atomicWrite(file, data);
    const content = await readFile(file);
    assert.deepEqual(content, Buffer.from(data));
  });
});

test('respects encoding option', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'encoded.txt');
    await atomicWrite(file, 'héllo', { encoding: 'latin1' });
    const content = await readFile(file, 'latin1');
    assert.equal(content, 'héllo');
  });
});

test('respects mode option', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'mode.txt');
    await atomicWrite(file, 'data', { mode: 0o600 });
    const stats = await stat(file);
    // Mask with 0o777 to ignore file type bits.
    assert.equal(stats.mode & 0o777, 0o600);
  });
});

test('rejects if directory does not exist', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'no-such-dir', 'file.txt');
    await assert.rejects(atomicWrite(file, 'data'), /ENOENT/);
  });
});

test('does not leave temporary files behind on success', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'clean.txt');
    await atomicWrite(file, 'data');
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(dir);
    assert.deepEqual(entries, ['clean.txt']);
  });
});

test('does not leave temporary files behind on failure', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'fail.txt');
    // Force a failure by passing data that cannot be written: a string with
    // an invalid encoding is not possible, so instead use a non-existent
    // directory for the target. The temp file would be in the same missing
    // directory, so open() fails before creating anything.
    const missingDir = join(dir, 'missing');
    const target = join(missingDir, 'file.txt');
    await assert.rejects(atomicWrite(target, 'data'), /ENOENT/);
    // The missing directory should still be missing, and no temp files
    // should exist in the parent.
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(dir);
    assert.deepEqual(entries, []);
  });
});

test('concurrent writes result in one of the written values', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'concurrent.txt');
    const values = ['a', 'b', 'c', 'd', 'e'];
    await Promise.all(values.map((v) => atomicWrite(file, v)));
    const content = await readFile(file, 'utf8');
    assert.ok(values.includes(content), `unexpected content: ${content}`);
  });
});
