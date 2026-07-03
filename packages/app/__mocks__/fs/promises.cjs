// Vitest will use this file as a replacement for `node:fs/promises` whenever a
// test imports it. We forward every member to memfs so the registry's
// readFile / writeFile calls hit an in-memory filesystem instead of the real
// disk. Using `require` keeps the export surface implicit — memfs already
// supplies `readFile` / `writeFile` / `mkdir` / etc. with the same shapes as
// Node's fs/promises, so the registry code under test never notices the swap.
//
// Reference: https://vitest.dev/guide/mocking/file-system

const { fs } = require("memfs");

module.exports = fs.promises;
