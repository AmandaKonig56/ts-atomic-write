import { open, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Atomically write data to a file.
 *
 * The write is performed by first writing to a temporary file in the same
 * directory, then renaming it over the destination. On POSIX systems rename
 * is atomic within a filesystem, so readers will see either the old or new
 * contents, never a partial write. On Windows, rename is not guaranteed to
 * be atomic when the destination exists, but this is the best available
 * portable approach without native code.
 *
 * @param {string} filePath - Destination path.
 * @param {string|Buffer|Uint8Array} data - Data to write.
 * @param {object} [options] - Options.
 * @param {string} [options.encoding='utf8'] - Encoding for string data.
 * @param {number} [options.mode] - File mode for the temporary file.
 * @returns {Promise<void>}
 */
export async function atomicWrite(filePath, data, options = {}) {
  const encoding = options.encoding || 'utf8';
  const mode = options.mode;
  const dir = dirname(filePath);
  const base = basename(filePath);
  // Include a random component to avoid collisions between concurrent writers.
  const tmpName = `.${base}.${randomBytes(6).toString('hex')}.tmp`;
  const tmpPath = join(dir, tmpName);

  let fileHandle;
  try {
    fileHandle = await open(tmpPath, 'wx', mode);
    if (typeof data === 'string') {
      await fileHandle.writeFile(data, { encoding });
    } else {
      await fileHandle.writeFile(data);
    }
    // Ensure data is flushed to disk before rename, so the rename does not
    // expose a file with unflushed content after a crash.
    await fileHandle.sync();
    await fileHandle.close();
    fileHandle = undefined;
    await rename(tmpPath, filePath);
  } catch (err) {
    if (fileHandle !== undefined) {
      try {
        await fileHandle.close();
      } catch {
        // Ignore close errors during cleanup.
      }
    }
    try {
      await unlink(tmpPath);
    } catch {
      // The temporary file may not exist if open() failed.
    }
    throw err;
  }
}
