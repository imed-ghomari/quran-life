const fs = require('fs');
const path = require('path');

function getTitleFromMeta(dirPath, fileName) {
    const metaPath = path.join(dirPath, '_meta.json');
    if (fs.existsSync(metaPath)) {
        try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            const key = fileName.replace(/\.mdx$/, '');
            const value = meta[key];
            if (value) {
                return typeof value === 'string' ? value : value.title;
            }
        } catch (e) {
            console.error('Error reading meta file:', metaPath);
        }
    }
    return fileName.replace(/\.mdx$/, '').split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function walkDir(dir, callback) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            walkDir(dirPath, callback);
        } else {
            callback(path.join(dir, f));
        }
    });
}

function generateIndex() {
    console.log('Generating search index...');
    const contentDir = path.join(process.cwd(), 'content');
    const documents = [];

    function processFile(filePath) {
        if (!filePath.endsWith('.mdx')) return;
        const fileName = path.basename(filePath);
        if (fileName.startsWith('_') || fileName.startsWith('.')) return;

        const content = fs.readFileSync(filePath, 'utf8');
        const dirPath = path.dirname(filePath);
        const title = getTitleFromMeta(dirPath, fileName);
        
        // Calculate href
        const relPath = path.relative(contentDir, filePath);
        // Normalize path separators for Windows compatibility if needed, though we are on macos
        const normalizedRelPath = relPath.split(path.sep).join('/');
        
        let href = '/docs/' + normalizedRelPath.replace(/\.mdx$/, '');
        // Handle index files
        if (href.endsWith('/index')) {
            href = href.substring(0, href.length - 6);
        }
        if (href === '/docs/index') href = '/docs'; // Should not happen with above logic but safe guard
        if (href === '') href = '/docs';

        documents.push({
            title,
            href,
            content
        });
    }

    if (fs.existsSync(contentDir)) {
        walkDir(contentDir, processFile);
    }

    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir);
    }

    const outputPath = path.join(publicDir, 'search-index.json');
    fs.writeFileSync(outputPath, JSON.stringify(documents, null, 2));
    console.log(`✅ Generated search index with ${documents.length} documents at ${outputPath}`);
}

generateIndex();
