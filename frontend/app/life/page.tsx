'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * §DEPRECATED: /life page redirected to /health
 * The Health Hub is now unified at /health with all features:
 * - Blood results & recommendations
 * - Medicines & supplements
 * - Vitals & biological age
 * - BP tracking & cardiovascular risk
 * - WHOOP recovery data
 * - Timeline & history
 */
export default function LifePage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/health');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <p className="text-gray-600 mb-4">Redirecting to unified Health Hub...</p>
        <a href="/health" className="text-indigo-600 hover:underline font-medium">
          Continue to Health Hub
        </a>
      </div>
    </div>
  );
}
