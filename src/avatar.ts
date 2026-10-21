export function profileImage(user: { avatarAt?: string | null } | null): string {
  return user?.avatarAt ? `/api/auth/avatar?v=${encodeURIComponent(user.avatarAt)}` : "";
}
