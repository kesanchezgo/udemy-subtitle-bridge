import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig(async () => {
	const { default: tailwindcss } = await import('@tailwindcss/vite');

	return {
		plugins: [
			react(),
			tailwindcss(),
			crx({ manifest })
		]
	};
});