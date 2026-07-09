import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    files: ['**/*.md', '**/*.mdx', '!_templates/**', '!Untitled*.md'],
  },
});

export default defineConfig();
