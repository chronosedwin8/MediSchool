import { start } from './bootstrap';

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
