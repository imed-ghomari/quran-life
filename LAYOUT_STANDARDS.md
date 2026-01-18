# Desktop Layout Standards

## 1. Root Container
ALWAYS use `.content-wrapper` as the root element for tab pages (Dashboard, Statistics, Settings, Docs).
This class ensures consistent padding and spacing across the application.
It inherits correct padding from `.page-container` (1.5rem top/2rem sides on desktop).

```tsx
export default function Page() {
    return (
        <div className="content-wrapper">
            {/* Content here */}
        </div>
    );
}
```

## 2. Page Titles
For desktop layouts, the page title should be at the **top level**, directly inside `.content-wrapper`, and *outside* any scrollable content containers or cards.

**Standard:**
```tsx
<h1 className="hidden md:block text-2xl font-bold mb-6">Page Title</h1>
```

This ensures the title stays fixed at the top while content scrolls (if applicable) or aligns correctly with other columns.

## 3. Card Styling
- **Do NOT** use inline styles for card padding if possible.
- Use the global `.card` class (and `.modern-card` if applicable) which provides standard padding (1.5rem).
- If you need to remove padding (e.g., for a scrollable list inside a card), override with `padding: 0`.

## 4. Layout Structure (Flex/Grid)
For pages with sidebars (like Documentation):
- Use a flex container with `height: 100%` (or `flex: 1`) to hold columns.
- Ensure all columns (Sidebars, Main Content) start at the same vertical position (top alignment).
- Use `overflow-hidden` on the flex container and `overflow-y-auto` on the individual scrollable columns/cards.
- **IMPORTANT:** When using full-height layouts, add `!mb-0` to the `.card` elements to prevent bottom margin from causing overflow.
- **IMPORTANT:** For 3-column layouts, ensure the root `.content-wrapper` allows enough width (e.g., `!max-w-full` or `!max-w-[1440px]`) instead of the default 900px.

**Example (Docs):**
```tsx
<div className="content-wrapper !max-w-full h-full flex flex-col">
    <h1 ...>Title</h1>
    <div className="flex-1 flex overflow-hidden ...">
        <aside className="card !mb-0 h-full overflow-y-auto ...">Sidebar</aside>
        <main className="card !mb-0 h-full overflow-y-auto ...">Content</main>
        <aside className="card !mb-0 h-full overflow-y-auto ...">TOC</aside>
    </div>
</div>
```

## 5. Mobile vs Desktop
- Use `md:hidden` for mobile-only elements.
- Use `hidden md:block` (or `md:flex`) for desktop-only elements.
- Ensure standard headers (titles) are hidden on mobile if the mobile layout handles titles differently (e.g., in a top bar).

## 6. Global CSS Variables
- Use `var(--background-secondary)` for card backgrounds.
- Use `var(--border)` for borders.
- Use `var(--accent)` for primary actions/highlights.
