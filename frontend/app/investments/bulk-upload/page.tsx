'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Select, Textarea, Alert, Spinner } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getPortfolios, bulkUploadHoldings } from '../../lib/api';

interface Portfolio { id: number; name: string; currency: string; }
interface ParsedRow { ticker: string; name: string; asset_type: string; quantity: string; avg_purchase_price: string; current_price: string; sector: string; }
interface UploadResult { success_count?: number; errors?: { row: number; error: string }[]; }

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];

  // Skip header if first line looks like headers
  const first = lines[0].toLowerCase();
  const startIdx = (first.includes('ticker') || first.includes('name')) ? 1 : 0;

  return lines.slice(startIdx).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    return {
      ticker: cols[0] || '',
      name: cols[1] || '',
      asset_type: cols[2] || 'stock',
      quantity: cols[3] || '0',
      avg_purchase_price: cols[4] || '0',
      current_price: cols[5] || '0',
      sector: cols[6] || '',
    };
  }).filter(r => r.ticker);
}

export default function BulkUploadPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState('');
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getPortfolios()
      .then((data) => setPortfolios(Array.isArray(data) ? data : (data?.results || [])))
      .catch(() => {});
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      setParsed(parseCSV(text));
    };
    reader.readAsText(file);
  };

  const handleParse = () => {
    setParsed(parseCSV(csvText));
  };

  const handleUpload = async () => {
    setError('');
    setResult(null);
    if (!selectedPortfolio) { setError(t('common.required', locale)); return; }
    if (parsed.length === 0) { setError('No data to upload'); return; }
    setUploading(true);
    try {
      const data = await bulkUploadHoldings({
        portfolio: Number(selectedPortfolio),
        holdings: parsed.map(r => ({
          ticker: r.ticker,
          name: r.name,
          asset_type: r.asset_type,
          quantity: parseFloat(r.quantity) || 0,
          avg_purchase_price: parseFloat(r.avg_purchase_price) || 0,
          current_price: parseFloat(r.current_price) || 0,
          sector: r.sector,
        })),
      });
      setResult(data);
    } catch {
      setError(t('common.error', locale));
    } finally {
      setUploading(false);
    }
  };

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader title={t('investments.bulk_upload', locale)} onBack={() => router.push('/investments')} />

        <Alert type="error" message={error} />
        {result && (
          <Alert type="success" message={`${result.success_count ?? 0} ${t('investments.uploaded', locale)}${result.errors?.length ? ` | ${result.errors.length} ${t('investments.errors', locale)}` : ''}`} />
        )}

        <Card>
          <div className="p-6 space-y-5">
            {/* Portfolio selection */}
            <Select
              label={t('investments.portfolio', locale)}
              value={selectedPortfolio}
              onChange={(e) => setSelectedPortfolio(e.target.value)}
              required
            >
              <option value="">{t('common.select', locale)}</option>
              {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.currency})</option>)}
            </Select>

            {/* Instructions */}
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
              <p className="font-medium text-gray-700 mb-1">CSV Format:</p>
              <code className="text-xs text-indigo-600">ticker, name, asset_type, quantity, avg_purchase_price, current_price, sector</code>
              <p className="mt-2 text-xs">{t('investments.csv_instructions', locale)}</p>
            </div>

            {/* File upload */}
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                {t('investments.upload', locale)} CSV
              </Button>
            </div>

            {/* Or paste */}
            <Textarea
              label={t('investments.paste_csv', locale)}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={6}
              placeholder="AAPL, Apple Inc., stock, 10, 150.00, 175.00, Technology&#10;MSFT, Microsoft Corp., stock, 5, 280.00, 320.00, Technology"
            />

            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleParse}>{t('investments.preview', locale)}</Button>
              <Button onClick={handleUpload} disabled={uploading || parsed.length === 0}>
                {uploading ? t('common.loading', locale) : `${t('investments.upload', locale)} (${parsed.length} rows)`}
              </Button>
            </div>
          </div>
        </Card>

        {/* Preview table */}
        {parsed.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('investments.preview', locale)} ({parsed.length} rows)</h3>
            <Card padding={false}>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.ticker', locale)}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.name', locale)}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.asset_type', locale)}</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.quantity', locale)}</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.avg_price', locale)}</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.current_price', locale)}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.sector', locale)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {parsed.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 text-sm font-medium text-gray-900">{row.ticker}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">{row.name}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">{row.asset_type}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 text-right">{row.quantity}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 text-right">{row.avg_purchase_price}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 text-right">{row.current_price}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">{row.sector}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Upload errors */}
        {result?.errors && result.errors.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-red-600 mb-2">{t('investments.errors', locale)}</h3>
            <Card>
              <div className="p-4 space-y-1">
                {result.errors.map((err, i) => (
                  <p key={i} className="text-sm text-red-600">Row {err.row}: {err.error}</p>
                ))}
              </div>
            </Card>
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}
