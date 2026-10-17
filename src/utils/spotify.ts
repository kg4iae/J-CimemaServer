/**
 * Spotify URL & URI Helper
 * Handles conversion of Spotify URIs, web links, and embed formats
 */

export function getSpotifyEmbedUrl(uriOrUrl?: string): string {
  const fallback = 'https://open.spotify.com/embed/playlist/37i9dQZF1DXdgnBRuh640I?utm_source=generator&theme=0';
  if (!uriOrUrl) return fallback;

  const clean = uriOrUrl.trim();
  if (!clean) return fallback;

  // Already an embed URL
  if (clean.includes('open.spotify.com/embed/')) {
    return clean;
  }

  // Handle spotify:playlist:XXXX, spotify:album:XXXX, spotify:track:XXXX
  const uriMatch = clean.match(/^spotify:(playlist|album|track|artist):([a-zA-Z0-9]+)/);
  if (uriMatch) {
    const type = uriMatch[1];
    const id = uriMatch[2];
    return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
  }

  // Handle https://open.spotify.com/playlist/XXXX or /album/XXXX or /track/XXXX
  const urlMatch = clean.match(/open\.spotify\.com\/(playlist|album|track|artist)\/([a-zA-Z0-9]+)/);
  if (urlMatch) {
    const type = urlMatch[1];
    const id = urlMatch[2];
    return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
  }

  return fallback;
}

export function getSpotifyWebUrl(uriOrUrl?: string): string {
  const fallback = 'https://open.spotify.com/playlist/37i9dQZF1DXdgnBRuh640I';
  if (!uriOrUrl) return fallback;

  const clean = uriOrUrl.trim();
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return clean.replace('/embed/', '/');
  }

  const uriMatch = clean.match(/^spotify:(playlist|album|track|artist):([a-zA-Z0-9]+)/);
  if (uriMatch) {
    return `https://open.spotify.com/${uriMatch[1]}/${uriMatch[2]}`;
  }

  return fallback;
}
