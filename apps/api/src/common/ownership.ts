import { notFound } from './errors';
import type { AuthUser } from './auth.decorators';

/**
 * Teachers only see what they own; admins see everything. Foreign resources answer 404
 * (not 403) so their existence is not revealed (IDOR protection).
 */
export function assertOwnerOrAdmin(ownerId: string, user: AuthUser, what = 'Resource'): void {
  if (user.role === 'ADMIN') return;
  if (ownerId !== user.id) throw notFound(what);
}

export const ownerScope = (user: AuthUser) => (user.role === 'ADMIN' ? {} : { ownerId: user.id });
