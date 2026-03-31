import { NextResponse, type NextRequest } from 'next/server'

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
]

const SENSITIVE_PATH_PREFIXES = [
  '/dashboard',
  '/docs',
  '/settings',
  '/statistics',
  '/todo',
  '/api/access-state',
  '/api/account/delete-request',
  '/api/paddle',
  '/api/premade-mindmaps',
]

function isSensitivePath(pathname: string) {
  return SENSITIVE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function isBlockedBot(userAgent: string | null) {
  if (!userAgent) return false
  return BLOCKED_BOT_PATTERNS.some((pattern) => pattern.test(userAgent))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const sensitivePath = isSensitivePath(pathname)

  if (sensitivePath && isBlockedBot(request.headers.get('user-agent'))) {
    return new NextResponse('Forbidden', {
      status: 403,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    })
  }

  const response = NextResponse.next()

  if (sensitivePath) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0')
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    response.headers.set('Vary', 'Cookie')
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*\\.js|fallback-.*\\.js|worker-.*\\.js|swe-worker-.*\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
