import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Set VITE_BASE_PATH in your CI / env to "/your-repo-name/" for GitHub project Pages.
// Defaults to "/" for local dev and root-domain deployments (e.g. user.github.io).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  };
});
