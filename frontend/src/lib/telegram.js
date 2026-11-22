import WebApp from '@twa-dev/sdk';

export function initTelegram() {
  try { WebApp.ready(); WebApp.expand(); } catch (_) {}
  return WebApp;
}
export function getTelegramUser() {
  const user = WebApp.initDataUnsafe?.user;
  if (user) return user;
  // Local preview only. Production identity must come from backend validation of initData.
  return { id: 100001, first_name: 'Preview User', username: 'preview_user' };
}
export function haptic(type='light') {
  try { WebApp.HapticFeedback.impactOccurred(type); } catch (_) {}
}
export function inviteFriends(link) {
  const text = encodeURIComponent('Join $PAWS and earn rewards with me!');
  const url = encodeURIComponent(link);
  try { WebApp.openTelegramLink(`https://t.me/share/url?url=${url}&text=${text}`); }
  catch (_) { window.open(`https://t.me/share/url?url=${url}&text=${text}`, '_blank'); }
}