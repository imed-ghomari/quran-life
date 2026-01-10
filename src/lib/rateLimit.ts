/**
 * Rate Limiting Middleware
 * 
 * In-memory sliding window rate limiter with bot detection.
 * Suitable for single-instance deployments.
 */

import { NextResponse } from 'next/server';
import { getClientIP, rateLimited } from './apiUtils';

// ========================================
// Types
// ========================================

interface RateLimitEntry {
    count: number;
    resetAt: number;
    blocked: boolean;
    blockedUntil?: number;
}

interface RateLimitConfig {
    /** Maximum requests per window */
    limit: number;
    /** Window size in milliseconds */
    windowMs: number;
    /** Block duration in milliseconds when limit exceeded */
    blockDurationMs?: number;
}

// ========================================
// Rate Limit Store
// ========================================

// In-memory store - cleared on server restart
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup interval - remove expired entries every 5 minutes
let cleanupInterval: NodeJS.Timeout | null = null;

function ensureCleanup() {
    if (cleanupInterval) return;

    cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of rateLimitStore.entries()) {
            if (entry.resetAt < now && (!entry.blockedUntil || entry.blockedUntil < now)) {
                rateLimitStore.delete(key);
            }
        }
    }, 5 * 60 * 1000); // 5 minutes

    // Don't prevent Node from exiting
    if (cleanupInterval.unref) {
        cleanupInterval.unref();
    }
}

// ========================================
// Bot Detection
// ========================================

// Known bot patterns to block (malicious crawlers)
const BLOCKED_BOT_PATTERNS = [
    /semrush/i,
    /ahref/i,
    /mj12bot/i,
    /dotbot/i,
    /petalbot/i,
    /bytespider/i,
    /gptbot/i,
    /ccbot/i,
    /anthropic/i,
];

// Known good bots (search engines) - these get rate limited but not blocked
const ALLOWED_BOT_PATTERNS = [
    /googlebot/i,
    /bingbot/i,
    /duckduckbot/i,
    /yandexbot/i,
    /baiduspider/i,
];

/**
 * Check if User-Agent indicates a bot
 * Returns: 'blocked' | 'allowed' | 'human'
 */
export function detectBot(userAgent: string | null): 'blocked' | 'allowed' | 'human' {
    if (!userAgent) return 'human';

    // Check for blocked bots first
    for (const pattern of BLOCKED_BOT_PATTERNS) {
        if (pattern.test(userAgent)) {
            return 'blocked';
        }
    }

    // Check for allowed bots
    for (const pattern of ALLOWED_BOT_PATTERNS) {
        if (pattern.test(userAgent)) {
            return 'allowed';
        }
    }

    return 'human';
}

// ========================================
// Rate Limiter
// ========================================

/**
 * Check rate limit for a given identifier (usually IP)
 * Returns null if allowed, or a NextResponse if rate limited
 */
export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig
): NextResponse | null {
    ensureCleanup();

    const now = Date.now();
    const key = identifier;

    let entry = rateLimitStore.get(key);

    // Check if currently blocked
    if (entry?.blocked && entry.blockedUntil && entry.blockedUntil > now) {
        const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
        const response = rateLimited(`Too many requests. Retry after ${retryAfter} seconds.`);
        response.headers.set('Retry-After', retryAfter.toString());
        response.headers.set('X-RateLimit-Limit', config.limit.toString());
        response.headers.set('X-RateLimit-Remaining', '0');
        response.headers.set('X-RateLimit-Reset', entry.blockedUntil.toString());
        return response;
    }

    // Reset if window expired
    if (!entry || entry.resetAt < now) {
        entry = {
            count: 0,
            resetAt: now + config.windowMs,
            blocked: false,
        };
    }

    // Increment count
    entry.count++;

    // Check if limit exceeded
    if (entry.count > config.limit) {
        // Apply block if configured
        if (config.blockDurationMs) {
            entry.blocked = true;
            entry.blockedUntil = now + config.blockDurationMs;
        }

        rateLimitStore.set(key, entry);

        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        const response = rateLimited();
        response.headers.set('Retry-After', retryAfter.toString());
        response.headers.set('X-RateLimit-Limit', config.limit.toString());
        response.headers.set('X-RateLimit-Remaining', '0');
        response.headers.set('X-RateLimit-Reset', entry.resetAt.toString());
        return response;
    }

    // Store updated entry
    rateLimitStore.set(key, entry);

    return null; // Allowed
}

/**
 * Add rate limit headers to a successful response
 */
export function addRateLimitHeaders(
    response: NextResponse,
    identifier: string,
    config: RateLimitConfig
): NextResponse {
    const entry = rateLimitStore.get(identifier);

    if (entry) {
        response.headers.set('X-RateLimit-Limit', config.limit.toString());
        response.headers.set('X-RateLimit-Remaining', Math.max(0, config.limit - entry.count).toString());
        response.headers.set('X-RateLimit-Reset', entry.resetAt.toString());
    }

    return response;
}

// ========================================
// Predefined Rate Limit Configs
// ========================================

/** Standard API endpoint - 30 requests per minute */
export const RATE_LIMIT_STANDARD: RateLimitConfig = {
    limit: 30,
    windowMs: 60 * 1000, // 1 minute
};

/** Strict rate limit for sensitive endpoints - 10 requests per minute */
export const RATE_LIMIT_STRICT: RateLimitConfig = {
    limit: 10,
    windowMs: 60 * 1000, // 1 minute
    blockDurationMs: 15 * 60 * 1000, // 15 minute block
};

/** Very strict for auth/payment - 5 requests per minute */
export const RATE_LIMIT_AUTH: RateLimitConfig = {
    limit: 5,
    windowMs: 60 * 1000, // 1 minute
    blockDurationMs: 15 * 60 * 1000, // 15 minute block
};

// ========================================
// Combined Rate Limit + Bot Check
// ========================================

/**
 * Apply rate limiting and bot detection to a request
 * Returns null if allowed, or a NextResponse if blocked
 */
export function applyRateLimit(
    request: Request,
    config: RateLimitConfig = RATE_LIMIT_STANDARD
): NextResponse | null {
    // Check for blocked bots
    const userAgent = request.headers.get('user-agent');
    const botStatus = detectBot(userAgent);

    if (botStatus === 'blocked') {
        console.warn(`[Bot Blocked] User-Agent: ${userAgent}`);
        return rateLimited('Access denied');
    }

    // Apply rate limiting
    const ip = getClientIP(request);
    const limitKey = `${ip}:${new URL(request.url).pathname}`;

    return checkRateLimit(limitKey, config);
}
