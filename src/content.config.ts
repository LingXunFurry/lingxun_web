// src/content.config.ts
import { z, defineCollection } from 'astro:content';
// 【版本核心】：引入最新架构的全局文件加载器
import { glob } from 'astro/loaders';

const postsCollection = defineCollection({
    // 告诉系统：精确扫描 ./src/content/posts 文件夹下的所有 .md 结尾的文件
    loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
    schema: z.object({
        title: z.string(),
        date: z.string(),
        tag: z.string(),
        desc: z.string(),
    }),
});

export const collections = {
    'posts': postsCollection,
};