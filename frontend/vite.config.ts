import {defineConfig} from 'vite';
export default defineConfig({
  server:{proxy:{'/api':process.env.CAMPUS_API_TARGET||'http://127.0.0.1:3100'}},
  build:{outDir:'dist'},
});
