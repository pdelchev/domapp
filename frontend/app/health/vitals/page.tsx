'use client';
// §MOVED: Vitals content merged into /life. This route just redirects.
// Old bookmarks and deep-links still land users on the new home.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function VitalsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/life'); }, [router]);
  return null;
}
