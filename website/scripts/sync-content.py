"""One-shot migration: docs from doc branch, blog from prod (FETCH_HEAD) into website/ Docusaurus."""
import re
import subprocess
from pathlib import Path

ROOT = Path("/Users/imedgh/Desktop/quran-life")
WEB = ROOT / "website"
DOC_REF = "quran-anki-companion-obsidian-plugin"
BLOG_REF = "FETCH_HEAD"  # origin/prod

def show(ref_path: str) -> str:
    return subprocess.check_output(["git", "show", ref_path], text=True, cwd=ROOT)

def list_files(ref: str, prefix: str):
    out = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", ref, "--", prefix], text=True, cwd=ROOT)
    return sorted([l for l in out.splitlines() if l])

# ---------- DOCS ----------
# order from _meta.json + extras
DOC_ORDER = [
    "getting-started",
    "practice-hub",
    "mindmap-strategy",
    "spaced-repetition",
    "mutashabihat",
    "re-learning",
    "settings",
    "statistics",
]
DOC_TITLES = {
    "getting-started": "Getting Started",
    "practice-hub": "Anki Deck & Reviews",
    "mindmap-strategy": "Mindmap Strategy",
    "spaced-repetition": "How Reviews Work",
    "mutashabihat": "Similar Verses",
    "re-learning": "Fixing Mistakes",
    "settings": "Settings & Daily Portion",
    "statistics": "Tracking Progress",
}

def fix_doc_links(body: str, in_philosophy: bool) -> str:
    # /docs/philosophy/<slug>(#anchor) -> relative
    def repl_phil(m):
        slug = m.group(1)
        anchor = m.group(2) or ""
        if in_philosophy:
            return f"./{slug}{anchor}"
        else:
            return f"philosophy/{slug}{anchor}"
    body = re.sub(r"/docs/philosophy/([a-z0-9-]+)(#[A-Za-z0-9\-_]+)?", repl_phil, body)
    # Remove link to excluded mindmaps docs: [special mindmap](/docs/mindmaps/part-0) -> plain text
    body = re.sub(r"\[special mindmap\]\(/docs/mindmaps/part-0\)", "Part 0 meta mindmap", body)
    body = re.sub(r"\(/docs/mindmaps/[^)]+\)", "(#excluded-mindmap-docs)", body)
    return body

def has_frontmatter(text: str) -> bool:
    return text.startswith("---\n")

# Clean scaffold docs (keep intro structure, remove tutorial)
for p in (WEB / "docs").glob("**/*"):
    if p.is_file():
        p.unlink()
for d in [WEB / "docs" / "tutorial-basics", WEB / "docs" / "tutorial-extras"]:
    if d.exists():
        import shutil
        shutil.rmtree(d, ignore_errors=True)
(WEB / "docs" / "philosophy").mkdir(parents=True, exist_ok=True)

# intro from content/index.mdx
index_body = show(f"{DOC_REF}:content/index.mdx")
index_body = fix_doc_links(index_body, in_philosophy=False)
intro_fm = "---\nid: intro\ntitle: Introduction\nsidebar_position: 0\n---\n\n"
(WEB / "docs" / "intro.md").write_text(intro_fm + index_body.lstrip() + "\n")

for i, slug in enumerate(DOC_ORDER, start=1):
    src = f"{DOC_REF}:content/philosophy/{slug}.mdx"
    try:
        body = show(src)
    except subprocess.CalledProcessError:
        print(f"SKIP missing {src}")
        continue
    if has_frontmatter(body):
        # strip existing frontmatter (none expected for philosophy files)
        parts = body.split("---", 2)
        if len(parts) == 3:
            body = parts[2]
    body = body.lstrip()
    body = fix_doc_links(body, in_philosophy=True)
    title = DOC_TITLES.get(slug, slug)
    fm = f"---\ntitle: {title}\nsidebar_position: {i}\n---\n\n"
    (WEB / "docs" / "philosophy" / f"{slug}.md").write_text(fm + body + "\n")
    print(f"docs: {slug}.md")

# ---------- BLOG ----------
# clear scaffold blog posts, keep authors.yml/tags.yml (we rewrite authors.yml)
for p in (WEB / "blog").glob("*.mdx"):
    p.unlink()
for p in (WEB / "blog").glob("*.md"):
    p.unlink()
for d in (WEB / "blog").glob("2021-08-26-welcome"):
    import shutil
    shutil.rmtree(d, ignore_errors=True) if d.exists() else None

def parse_simple_frontmatter(text: str):
    """Parse the simple flat frontmatter used in content/blog/*.mdx."""
    assert text.startswith("---")
    end = text.index("---", 3)
    fm_raw = text[3:end]
    body = text[end + 3:].lstrip()
    data = {}
    cats = []
    in_cats = False
    for line in fm_raw.splitlines():
        if re.match(r"\s*categories\s*:", line):
            in_cats = True
            continue
        m = re.match(r"\s*-\s*(.+)", line)
        if m and in_cats:
            cats.append(m.group(1).strip())
            continue
        if in_cats and line.strip() == "":
            continue
        if in_cats and not line.startswith(" ") and ":" in line:
            in_cats = False
        m2 = re.match(r'(\w+):\s*"(.*)"\s*$', line.strip())
        if m2:
            data[m2.group(1)] = m2.group(2)
            in_cats = False
            continue
        m3 = re.match(r"(\w+):\s*(true|false)\s*$", line.strip())
        if m3:
            data[m3.group(1)] = (m3.group(2) == "true")
            in_cats = False
            continue
        m4 = re.match(r"(\w+):\s*(.+)\s*$", line.strip())
        if m4 and not in_cats:
            data[m4.group(1)] = m4.group(2).strip().strip('"')
    data["categories"] = cats
    return data, body

def slugify_tag(s: str) -> str:
    s = s.strip().lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s

blog_files = [f for f in list_files(BLOG_REF, "content/blog/") if f.endswith(".mdx")]
kept, drafts = 0, 0
for f in blog_files:
    name = f.split("/")[-1]
    if name in ("_template.mdx", "_article-drafts.md"):
        continue
    raw = show(f"{BLOG_REF}:{f}")
    data, body = parse_simple_frontmatter(raw)
    title = data.get("title", name)
    desc = data.get("description", data.get("excerpt", ""))
    date = data.get("publishedAt", "2026-03-31")
    updated = data.get("updatedAt", "")
    is_pub = data.get("isPublished", True)
    cats = data.get("categories", [])
    tags = sorted({slugify_tag(c) for c in cats if c})
    slug = name[:-4]  # strip .mdx
    # Docusaurus frontmatter
    lines = ["---", f'title: "{title}"', f'description: "{desc}"', f"date: {date}"]
    if updated and updated != date:
        lines.append("last_update:")
        lines.append(f"  date: {updated}")
    lines.append("authors: quran-life")
    if tags:
        lines.append("tags: [" + ", ".join(tags) + "]")
    if is_pub is False:
        lines.append("draft: true")
        drafts += 1
    else:
        kept += 1
    lines.append(f"slug: {slug}")
    lines.append("---\n")
    out = "\n".join(lines) + "\n" + body.lstrip() + "\n"
    (WEB / "blog" / f"{slug}.md").write_text(out)

print(f"blog: {kept} published, {drafts} drafts")

# authors.yml (single author)
(WEB / "blog" / "authors.yml").write_text(
    "quran-life:\n"
    "  name: Quran Life\n"
    "  title: Quran memorization companion\n"
    "  url: https://github.com/imed-ghomari/quran-life\n"
    "  image_url: https://github.com/imed-ghomari.png\n"
)
print("authors.yml written")
