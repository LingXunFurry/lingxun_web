import { resolveSiteImage } from './siteContent';
import type { CharacterProfile } from './publicContent';

export type RecordChoice = { name: string; detail: string; preview?: { src: string; x: number; y: number; zoom: number } };

export function characterChoice(character: CharacterProfile | undefined, detail = ''): RecordChoice {
    return {
        name: character?.name || detail, detail,
        preview: {
            src: resolveSiteImage(character?.avatar?.variants?.[0]?.src || character?.avatar_url || ''),
            x: character?.avatar_x ?? 50, y: character?.avatar_y ?? 50, zoom: character?.avatar_zoom ?? 100,
        },
    };
}

export function recordTabs(container: HTMLElement, choices: RecordChoice[], panelId: string, select: (index: number) => void) {
    container.setAttribute('role', 'tablist');
    const buttons = choices.map((choice, index) => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'record-tab'; button.id = `${panelId}-tab-${index}`;
        button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', panelId);
        button.setAttribute('aria-label', [choice.name, choice.detail].filter(Boolean).join(' · '));
        button.title = [choice.name, choice.detail].filter(Boolean).join(' · ');
        const preview = document.createElement('span'); preview.className = 'record-tab__preview';
        preview.setAttribute('aria-hidden', 'true');
        preview.textContent = choice.name.slice(0, 1);
        if (choice.preview?.src) {
            const image = document.createElement('img'); image.src = choice.preview.src; image.alt = ''; image.loading = 'lazy';
            image.style.objectPosition = `${choice.preview.x}% ${choice.preview.y}%`;
            image.style.transformOrigin = `${choice.preview.x}% ${choice.preview.y}%`;
            image.style.transform = `scale(${choice.preview.zoom / 100})`;
            image.onerror = () => { image.remove(); preview.textContent = choice.name.slice(0, 1); };
            preview.replaceChildren(image);
        }
        button.append(preview);
        button.addEventListener('click', () => select(index));
        button.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next].focus(); select(next);
        });
        return button;
    });
    container.replaceChildren(...buttons);
    return (index: number) => buttons.forEach((button, position) => {
        button.setAttribute('aria-selected', String(position === index));
        button.tabIndex = position === index ? 0 : -1;
    });
}

export function recordTransition(nodes: HTMLElement[], render: (index: number) => void, options: {
    diagonal?: boolean;
    prepare?: (index: number) => Promise<unknown>;
    resize?: HTMLElement;
} = {}) {
    let current = 0, requested = 0, running = false, direction = 1;
    let animations: Animation[] = [];
    let resizeAnimation: Animation | undefined;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const animate = async (frames: Keyframe[], duration: number) => {
        animations.forEach(animation => animation.cancel());
        animations = [];
        if (reduced.matches) return;
        animations = nodes.map(node => node.animate(frames, { duration, easing: 'cubic-bezier(.22,.7,.25,1)', fill: 'both' }));
        await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
    };
    return async (index: number, movement?: number) => {
        direction = movement || Math.sign(index - requested) || direction;
        requested = index;
        if (running || requested === current) return;
        running = true;
        nodes.forEach(node => node.setAttribute('aria-busy', 'true'));
        try {
            while (requested !== current) {
                let target = requested;
                await options.prepare?.(target);
                if (target !== requested) continue;
                const x = 48 * direction, y = options.diagonal ? 30 * direction : 0;
                await animate([{ opacity: 1, transform: 'translate(0, 0)' }, { opacity: 0, transform: `translate(${-x}px, ${-y}px)` }], 190);
                // Keep the old page hidden until the latest requested portrait has decoded.
                while (target !== requested) { target = requested; await options.prepare?.(target); }
                const oldHeight = options.resize?.getBoundingClientRect().height;
                current = target; render(current);
                const newHeight = options.resize?.getBoundingClientRect().height;
                if (!reduced.matches && options.resize && oldHeight !== newHeight) {
                    resizeAnimation = options.resize.animate([{ height: `${oldHeight}px` }, { height: `${newHeight}px` }], { duration: 390, easing: 'cubic-bezier(.22,.7,.25,1)' });
                }
                await animate([{ opacity: 0, transform: `translate(${48 * direction}px, ${options.diagonal ? 30 * direction : 0}px)` }, { opacity: 1, transform: 'translate(0, 0)' }], 390);
            }
        } finally {
            animations.forEach(animation => animation.cancel());
            resizeAnimation?.cancel();
            nodes.forEach(node => node.setAttribute('aria-busy', 'false'));
            running = false;
        }
    };
}
