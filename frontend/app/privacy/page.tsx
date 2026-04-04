'use client';

import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card } from '../components/ui';

export default function PrivacyPolicyPage() {
  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader title="Privacy Policy" />
        <Card>
          <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
            <p className="text-sm text-gray-500">Last updated: April 4, 2026</p>

            <h3 className="text-base font-semibold text-gray-900">1. Introduction</h3>
            <p>
              DomApp (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is a personal property management and health tracking
              application. This Privacy Policy explains how we collect, use, and protect your information.
            </p>

            <h3 className="text-base font-semibold text-gray-900">2. Data We Collect</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account data:</strong> Username, email, password (hashed).</li>
              <li><strong>Property data:</strong> Properties, tenants, leases, payments, documents you enter.</li>
              <li><strong>Health data:</strong> Blood test results (uploaded PDFs or manual entry), blood pressure readings, health profiles.</li>
              <li><strong>WHOOP data:</strong> If you connect your WHOOP account, we access recovery scores, heart rate variability (HRV), resting heart rate, sleep data (duration, stages, efficiency), workout data (strain, heart rate zones), and body measurements. This data is retrieved via the WHOOP API using OAuth 2.0 authorization that you explicitly grant.</li>
              <li><strong>Usage data:</strong> Language preference, localStorage settings.</li>
            </ul>

            <h3 className="text-base font-semibold text-gray-900">3. How We Use Your Data</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Display your property management dashboard and financial summaries.</li>
              <li>Analyze blood test results and generate health recommendations.</li>
              <li>Track blood pressure with AHA staging and cardiovascular risk assessment.</li>
              <li>Display WHOOP recovery, sleep, and strain metrics alongside your health data.</li>
              <li>Compute integrated cardiovascular fitness scores combining WHOOP, blood pressure, and blood biomarker data.</li>
              <li>Send notifications about lease expirations, overdue payments, and health alerts.</li>
            </ul>

            <h3 className="text-base font-semibold text-gray-900">4. Third-Party Services</h3>
            <p>
              <strong>WHOOP:</strong> When you connect your WHOOP account, we use the WHOOP API
              (api.prod.whoop.com) to retrieve your health and fitness data. We store OAuth tokens
              securely to maintain your connection. You can disconnect WHOOP at any time from the
              Recovery dashboard, which revokes our access and deletes all synced WHOOP data from our system.
            </p>
            <p>
              We do not sell, rent, or share your personal data with any third parties for marketing purposes.
            </p>

            <h3 className="text-base font-semibold text-gray-900">5. Data Storage & Security</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>All data is stored on secured servers with encrypted connections (HTTPS).</li>
              <li>Authentication uses JWT tokens with automatic expiration and refresh.</li>
              <li>All data is user-scoped — you can only access your own data.</li>
              <li>WHOOP OAuth tokens are stored server-side and never exposed to the frontend.</li>
              <li>Passwords are hashed using Django&apos;s PBKDF2 algorithm.</li>
            </ul>

            <h3 className="text-base font-semibold text-gray-900">6. Your Rights</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Access:</strong> View all your data through the application.</li>
              <li><strong>Deletion:</strong> Delete your account and all associated data at any time.</li>
              <li><strong>Disconnect:</strong> Revoke WHOOP access and delete synced data from the Recovery dashboard.</li>
              <li><strong>Export:</strong> Export your blood pressure data as CSV/PDF.</li>
            </ul>

            <h3 className="text-base font-semibold text-gray-900">7. Data Retention</h3>
            <p>
              We retain your data for as long as your account is active. When you delete your account
              or disconnect a third-party service, associated data is permanently removed.
            </p>

            <h3 className="text-base font-semibold text-gray-900">8. Contact</h3>
            <p>
              For privacy-related questions, contact: <strong>5ko.delchev@gmail.com</strong>
            </p>
          </div>
        </Card>
      </PageContent>
    </PageShell>
  );
}
