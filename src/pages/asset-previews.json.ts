import type { APIRoute } from 'astro';

export const prerender = true;

// Only published image assets are exposed, never arbitrary filesystem paths.
const images = import.meta.glob<{ default: { src: string } }>('../assets/**/*.{png,jpg,jpeg,webp,avif}', { eager: true });

export const GET: APIRoute = () => new Response(JSON.stringify(Object.fromEntries(
    Object.entries(images).map(([path, image]) => [path.replace('../assets/', '/src/assets/'), image.default.src]),
)), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
