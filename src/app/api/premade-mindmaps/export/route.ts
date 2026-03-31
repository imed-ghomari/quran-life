import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getVerifiedInstantUser } from '@/lib/server/auth';
import { isServerEditorUser } from '@/lib/privilegedEmails.server';

type ExportPayload = {
    type: 'surah' | 'part';
    id: number;
    tldrawSnapshot: any;
    anchors?: Array<{
        startVerse: number;
        endVerse: number;
        label?: string;
    }>;
};

type PremadeIndex = {
    surah: number[];
    part: number[];
    updatedAt?: string;
};

const premadeDir = path.join(process.cwd(), 'private-assets', 'premade-mindmaps');
const indexPath = path.join(premadeDir, 'index.json');
const isReadOnlyFsRuntime = process.env.NETLIFY === 'true' || process.env.AWS_LAMBDA_FUNCTION_NAME;

async function canExportPremades() {
    const user = await getVerifiedInstantUser();
    return isServerEditorUser(user);
}

async function readIndex(): Promise<PremadeIndex> {
    try {
        const raw = await fs.readFile(indexPath, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            surah: Array.isArray(parsed?.surah) ? parsed.surah : [],
            part: Array.isArray(parsed?.part) ? parsed.part : [],
            updatedAt: parsed?.updatedAt
        };
    } catch {
        return { surah: [], part: [] };
    }
}

async function writeIndex(nextIndex: PremadeIndex) {
    await fs.writeFile(indexPath, JSON.stringify(nextIndex, null, 2), 'utf8');
}

export async function POST(req: Request) {
    if (!(await canExportPremades())) {
        return NextResponse.json({ error: 'Not allowed in user mode.' }, { status: 403 });
    }

    if (process.env.NODE_ENV === 'production' && isReadOnlyFsRuntime) {
        return NextResponse.json(
            { error: 'Premade export is unavailable on hosted runtime. Run this export locally.' },
            { status: 501 }
        );
    }

    let payload: ExportPayload;
    try {
        payload = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    }

    const { type, id, tldrawSnapshot, anchors = [] } = payload;
    if ((type !== 'surah' && type !== 'part') || typeof id !== 'number' || !tldrawSnapshot) {
        return NextResponse.json({ error: 'Missing or invalid fields.' }, { status: 400 });
    }

    await fs.mkdir(premadeDir, { recursive: true });

    const baseName = `${type}-${id}`;
    const tldrawPath = path.join(premadeDir, `${baseName}.tldraw`);
    await fs.writeFile(tldrawPath, JSON.stringify(tldrawSnapshot, null, 2), 'utf8');

    if (type === 'surah') {
        const chunksPath = path.join(premadeDir, `${baseName}.chunks.txt`);
        const lines = anchors.map(a => {
            const range = `${a.startVerse}-${a.endVerse}`;
            const label = a.label ? ` | ${a.label}` : '';
            return `${range}${label}`;
        });
        await fs.writeFile(chunksPath, lines.join('\n'), 'utf8');
    }

    const index = await readIndex();
    const list = type === 'surah' ? index.surah : index.part;
    if (!list.includes(id)) {
        list.push(id);
        list.sort((a, b) => a - b);
    }
    index.updatedAt = new Date().toISOString();
    await writeIndex(index);

    return NextResponse.json({ ok: true, index });
}
