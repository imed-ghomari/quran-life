/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

// Ensure DOM globals are properly typed in Next.js build
declare global {
    interface Window {
        innerWidth: number;
        innerHeight: number;
    }
}

export { };
