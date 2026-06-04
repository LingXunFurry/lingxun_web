// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // 在这里添加你的域名配置
  site: 'https://lingxun.me', 
  
  vite: {
    plugins: [tailwindcss()]
  }
});