import { siteText } from './siteContent';

const POST_TAG_LABELS: Record<string, string> = {
    SETTING: '设定',
    LIFE: '生活',
    EVENT: '活动',
    UPDATE: '更新',
    QUEST: '任务',
    SYSTEM_UPDATE: '旧档案',
    SYSTEM_UPGRADE_CRITICAL: '旧档案',
};

export function postTagLabel(tag: string | null | undefined) {
    const value = String(tag || '').trim();
    if (!value) return siteText('tags.empty', '手记');
    return siteText(`tags.${value.toUpperCase()}`, POST_TAG_LABELS[value.toUpperCase()] || value);
}
