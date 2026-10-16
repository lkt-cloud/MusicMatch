import { lang, locale } from '../i18n';

export function timeAgo(at: number) {
  const ja = lang() === 'ja';
  const s = Math.max(1, Math.round((Date.now() - at) / 1000));
  if (s < 60) return ja ? 'たった今' : 'now';
  const m = Math.round(s / 60);
  if (m < 60) return ja ? `${m}分前` : `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return ja ? `${h}時間前` : `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return ja ? `${d}日前` : `${d}d`;
  return new Date(at).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
}
