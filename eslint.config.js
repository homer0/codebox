import { defineConfig } from 'eslint/config';
import { createConfig } from '@homer0/eslint-plugin/create';

export default defineConfig([
  createConfig({
    importUrl: import.meta.url,
    configs: ['node-with-prettier'],
    addTsParser: false,
    esm: true,
  }),
]);
