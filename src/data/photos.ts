export type GalleryPhotoMeta = {
    src: string;
    title: string;
    category: string;
    date?: string;
    location?: string;
    description?: string;
    legacy?: boolean;
    character_ids?: number[];
};

export const galleryPhotos: GalleryPhotoMeta[] = [
    { src: 'photo1.webp', title: '桥上偶遇', category: '城镇生活', date: '2026.06.01', location: '城镇街区', description: '在人类城镇短暂停留时留下的实拍。', character_ids: [1] },
    { src: 'photo2.webp', title: '柜台前的片刻', category: '凌巽', date: '2026.05.28', location: '酒馆', description: '任务结束后的休息时间。', character_ids: [1] },
    { src: 'photo3.webp', title: '树影里的停留', category: '酒馆片段', date: '2026.05.18', location: '城镇绿地', description: '旅途中偶然找到的一处安静角落。', character_ids: [1] },
    { src: 'photo4.webp', title: '出发前整理装备', category: '冒险者装备', date: '2026.05.12', location: '家中', description: '出门前确认随身装备。', character_ids: [1] },
    { src: 'photo5.webp', title: '活动记录一', category: '活动记录', date: '2026.04.26', location: '活动现场', description: '活动当天的同行记录。', character_ids: [1] },
    { src: 'photo6.webp', title: '活动记录二', category: '活动记录', date: '2026.04.26', location: '活动现场', description: '人群与灯光之间的短暂留影。', character_ids: [1] },
    { src: 'photo7.webp', title: '公会委托途中', category: '公会委托', date: '2026.04.12', location: '城外道路', description: '前往委托地点时的旅途记录。', character_ids: [1] },
    { src: 'photo8.webp', title: '旧日留影', category: '旧档案', date: '2026.03.20', location: '旧档案', description: '保留的早期影像记录。', legacy: true, character_ids: [] },
    { src: 'Image_1774261272205_454.png', title: '纯龙设定稿一', category: '设定图', location: '设定档案', description: '用户提供的角色设定稿，仅作为档案参考。', character_ids: [1] },
    { src: 'Image_1777968000555_846.png', title: '纯龙设定稿二', category: '设定图', location: '设定档案', description: '用户提供的角色设定稿，仅作为档案参考。', character_ids: [1] },
];

export const galleryCategories = ['全部', '凌巽', '冒险者装备', '公会委托', '城镇生活', '酒馆片段', '活动记录', '设定图', '旧档案'];
