'use client';

/**
 * §REDIRECT: /lifestyle now redirects to /health (unified Health Hub).
 * The old lifestyle page with ritual/food tabs has been replaced by
 * the unified daily wizard at /health/checkin and supplement management
 * at /health/supplements.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LifestyleRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/health');
  }, [router]);
  return null;
}
