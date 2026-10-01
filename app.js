// Phusion Passenger / cPanel entry point for PantryPool Node.js Server
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

process.on('uncaughtException', (err) => {
  const logMsg = `[${new Date().toISOString()}] UncaughtException: ${err?.stack || err}\n`;
  try { fs.appendFileSync(path.join(process.cwd(), 'passenger_error.log'), logMsg); } catch (e) {}
  console.error(logMsg);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const logMsg = `[${new Date().toISOString()}] UnhandledRejection: ${reason?.stack || reason}\n`;
  try { fs.appendFileSync(path.join(process.cwd(), 'passenger_error.log'), logMsg); } catch (e) {}
  console.error(logMsg);
  process.exit(1);
});

try {
  require('./dist/server.cjs');
} catch (err) {
  const logMsg = `[${new Date().toISOString()}] RequireError: ${err?.stack || err}\n`;
  try { fs.appendFileSync(path.join(process.cwd(), 'passenger_error.log'), logMsg); } catch (e) {}
  throw err;
}
