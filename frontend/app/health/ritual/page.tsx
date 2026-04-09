'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RitualRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/health/supplements');
  }, [router]);
  return null;
}
