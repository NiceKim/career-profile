import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Loads .env.test (DATABASE_URL -> resume_vc_test) so `npm test` never
  // needs DATABASE_URL passed manually, and never touches the dev DB.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    test: {
      environment: 'node',
      globals: true,
      // Test files share one Postgres test DB via resetDb(); running files in
      // parallel races truncation in one file against inserts in another.
      fileParallelism: false,
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
  };
});
