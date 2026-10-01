#!/usr/bin/env node
// Dev entry: runs the TypeScript sources through tsx. SEA packaging (one binary per platform) comes later
// and replaces this file; the manifest's `tool.downloads` point at those binaries.
import { tsImport } from 'tsx/esm/api';

const { runCli } = await tsImport('../src/main.ts', import.meta.url);
process.exitCode = await runCli(process.argv.slice(2));
