const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: string | undefined | null): value is string =>
    !!value && UUID_RE.test(value);

const hash32 = (value: string, seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < value.length; i += 1) {
        h ^= value.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};

export const stableEntityId = (...parts: Array<string | number>) => {
    const input = parts.map(part => String(part).trim()).join('|');
    const hex =
        hash32(input, 0x811c9dc5).toString(16).padStart(8, '0') +
        hash32(input, 0x12345678).toString(16).padStart(8, '0') +
        hash32(input, 0x9abcdef0).toString(16).padStart(8, '0') +
        hash32(input, 0x0fedcba9).toString(16).padStart(8, '0');
    const chars = hex.slice(0, 32).split('');
    chars[12] = '4';
    chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
    return `${chars.slice(0, 8).join('')}-${chars.slice(8, 12).join('')}-${chars.slice(12, 16).join('')}-${chars.slice(16, 20).join('')}-${chars.slice(20, 32).join('')}`;
};

export const resolveEntityId = (candidateId: string | undefined, ...fallbackParts: Array<string | number>) => {
    if (isUuid(candidateId)) return candidateId;
    return stableEntityId(...fallbackParts);
};
