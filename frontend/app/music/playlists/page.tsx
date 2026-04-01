'use client';

/**
 * Playlists redirect — playlists are now a tab on /music.
 * This page redirects to /music with playlists tab active.
 * Kept for backward compatibility with existing links.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PlaylistsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/music');
  }, [router]);
  return null;
}
