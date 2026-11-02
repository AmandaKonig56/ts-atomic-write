# ts-atomic-write

Atomically write a file so readers never observe a partial write.

```js
import { atomicWrite } from 'ts-atomic-write';

await atomicWrite('/tmp/file.txt', 'hello world');
```

## Why this exists

Writing directly to a file with `fs.writeFile` is not atomic: a reader can
open the file after the truncate but before the write completes and see an
empty or partially written file. `atomicWrite` writes to a temporary file in
the same directory and then renames it over the destination. On POSIX systems
`rename` is atomic within a filesystem, so readers see either the old file or
the new file, never a mix.

The trade-off is that the destination must be on the same filesystem as its
directory (which it always is, since the temporary file is created next to
it), and on Windows `rename` over an existing file is not guaranteed to be
atomic. The library still uses rename because it is the best portable
approach without native code.

## API

### `atomicWrite(filePath, data, options?)`

- `filePath` (`string`): destination path.
- `data` (`string | Buffer | Uint8Array`): content to write.
- `options` (optional object):
  - `encoding` (`string`, default `'utf8'`): used when `data` is a string.
  - `mode` (`number`): file mode for the temporary file, e.g. `0o600`.

Returns a `Promise<void>`.

## Edge cases

- If the target directory does not exist, the promise rejects with `ENOENT`
  and no temporary file is left behind.
- Concurrent calls writing to the same path are safe in the sense that the
  final content is one of the written values; the temporary file names
  include random bytes to avoid collisions.
- The temporary file is flushed with `fsync` before the rename, so a crash
  after the rename does not leave a file with unflushed content.
