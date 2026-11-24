const SAFE_ROUTE = /^\/[A-Za-z0-9_./:*~-]{0,159}$/;

export function safeRouteTemplate(value: unknown): string {
  return typeof value === 'string' && SAFE_ROUTE.test(value)
    ? value
    : 'unmatched';
}

export function safeHttpMethod(value: unknown): string {
  const method = typeof value === 'string' ? value.toUpperCase() : '';
  return ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(
    method,
  )
    ? method
    : 'OTHER';
}
