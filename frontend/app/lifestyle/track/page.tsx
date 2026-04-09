'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TrackRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/health/checkin');
  }, [router]);
  return null;
}
