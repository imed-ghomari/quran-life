/**
 * API Utilities - Centralized Error Handling and Response Helpers
 * 
 * Provides standardized API responses, error handling, and request validation
 * for all API routes in the application.
 */

import { NextResponse } from 'next/server';

// ========================================
// Error Codes
// ========================================

export const ApiErrorCode = {
    BAD_REQUEST: 'BAD_REQUEST',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    RATE_LIMITED: 'RATE_LIMITED',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ApiErrorCodeType = typeof ApiErrorCode[keyof typeof ApiErrorCode];

// ========================================
// Response Types
// ========================================

export interface ApiSuccessResponse<T = unknown> {
    success: true;
    data: T;
}

export interface ApiErrorResponse {
    success: false;
    error: {
        code: ApiErrorCodeType;
        message: string;
        details?: unknown;
    };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ========================================
// Response Helpers
// ========================================

/**
 * Create a successful API response
 */
export function successResponse<T>(data: T, status = 200): NextResponse<ApiSuccessResponse<T>> {
    return NextResponse.json(
        { success: true, data },
        { status }
    );
}

/**
 * Create an error API response
 */
export function errorResponse(
    code: ApiErrorCodeType,
    message: string,
    status: number,
    details?: unknown
): NextResponse<ApiErrorResponse> {
    // Log errors server-side
    console.error(`[API Error] ${code}: ${message}`, details ? { details } : '');

    return NextResponse.json(
        {
            success: false,
            error: {
                code,
                message,
                ...(details && process.env.NODE_ENV !== 'production' ? { details } : {}),
            },
        },
        { status }
    );
}

// ========================================
// Common Error Responses
// ========================================

export function badRequest(message = 'Bad request', details?: unknown) {
    return errorResponse(ApiErrorCode.BAD_REQUEST, message, 400, details);
}

export function unauthorized(message = 'Unauthorized') {
    return errorResponse(ApiErrorCode.UNAUTHORIZED, message, 401);
}

export function forbidden(message = 'Forbidden') {
    return errorResponse(ApiErrorCode.FORBIDDEN, message, 403);
}

export function notFound(message = 'Not found') {
    return errorResponse(ApiErrorCode.NOT_FOUND, message, 404);
}

export function rateLimited(message = 'Too many requests. Please try again later.') {
    return errorResponse(ApiErrorCode.RATE_LIMITED, message, 429);
}

export function internalError(message = 'Internal server error', details?: unknown) {
    return errorResponse(ApiErrorCode.INTERNAL_ERROR, message, 500, details);
}

export function serviceUnavailable(message = 'Service temporarily unavailable') {
    return errorResponse(ApiErrorCode.SERVICE_UNAVAILABLE, message, 503);
}

// ========================================
// Validation Helpers
// ========================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID
 */
export function isValidUUID(value: string | null | undefined): value is string {
    return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Validate and sanitize a search query
 */
export function sanitizeSearchQuery(query: string | null, maxLength = 200): string | null {
    if (!query) return null;

    // Remove potentially dangerous characters and limit length
    const sanitized = query
        .replace(/[<>'"`;(){}[\]\\]/g, '') // Remove potential injection chars
        .trim()
        .slice(0, maxLength);

    return sanitized.length > 0 ? sanitized : null;
}

/**
 * Get client IP from request headers
 */
export function getClientIP(request: Request): string {
    // Check various headers in order of reliability
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        // x-forwarded-for can contain multiple IPs; take the first one
        return forwardedFor.split(',')[0].trim();
    }

    const realIP = request.headers.get('x-real-ip');
    if (realIP) {
        return realIP.trim();
    }

    // Fallback - not ideal but better than nothing
    return 'unknown';
}

// ========================================
// Security Headers
// ========================================

/**
 * Add common security headers to a response
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return response;
}
