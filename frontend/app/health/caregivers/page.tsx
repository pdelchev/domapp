'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/app/context/LanguageContext';
import {
  PageShell, PageContent, PageHeader, Card, Input, Select,
  Button, Spinner, Alert, Badge, EmptyState,
} from '@/app/components/ui';
import NavBar from '@/app/components/NavBar';
import {
  getHealthProfiles, getCaregiverRelationships, getCaregiverMyInvites,
  getCaregiverMyAccess, inviteCaregiver, acceptInvite, declineInvite,
  revokeCaregiverAccess,
} from '@/app/lib/api';

interface HealthProfile {
  id: number;
  full_name: string;
}

interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface CaregiverRelationship {
  id: number;
  profile: number;
  profile_name: string;
  caregiver_user: number;
  caregiver_name: string;
  caregiver_email: string;
  permissions: string[];
  status: string;
  status_display: string;
  relationship_note: string;
  created_at: string;
  accepted_at?: string;
  revoked_at?: string;
}

interface PendingInvite {
  id: number;
  profile: number;
  profile_name: string;
  primary_name: string;
  primary_email: string;
  permissions: string[];
  status: string;
  status_display: string;
  created_at: string;
}

const PERMISSION_LABELS: Record<string, string> = {
  'view_all': 'View all health data',
  'log_doses': 'Log supplement doses',
  'edit_schedules': 'Manage schedules',
  'edit_supplements': 'Add/edit supplements',
};

export default function CaregiversPage() {
  const { locale } = useLanguage();
  const [profiles, setProfiles] = useState<HealthProfile[]>([]);
  const [caregivers, setCaregivers] = useState<CaregiverRelationship[]>([]);
  const [myInvites, setMyInvites] = useState<PendingInvite[]>([]);
  const [myAccess, setMyAccess] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'manage' | 'invites' | 'access'>('manage');

  // Invite form
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [formProfile, setFormProfile] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formPermissions, setFormPermissions] = useState<string[]>(['view_all']);
  const [submitting, setSubmitting] = useState(false);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Reload based on active tab
  useEffect(() => {
    if (tab === 'manage') {
      loadCaregivers();
    } else if (tab === 'invites') {
      loadMyInvites();
    } else {
      loadMyAccess();
    }
  }, [tab]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const profiles = await getHealthProfiles();
      setProfiles(profiles);
    } catch (e) {
      setError('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCaregivers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCaregiverRelationships();
      setCaregivers(data);
    } catch (e) {
      setError('Failed to load caregivers');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMyInvites = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCaregiverMyInvites();
      setMyInvites(data);
    } catch (e) {
      setError('Failed to load invites');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMyAccess = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCaregiverMyAccess();
      setMyAccess(data);
    } catch (e) {
      setError('Failed to load access');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProfile || !formEmail) {
      setError('Profile and email required');
      return;
    }

    setSubmitting(true);
    try {
      await inviteCaregiver({
        profile: parseInt(formProfile, 10),
        caregiver_user_email: formEmail,
        permissions: formPermissions,
        relationship_note: formNote,
      });

      setFormProfile('');
      setFormEmail('');
      setFormNote('');
      setFormPermissions(['view_all']);
      setShowInviteForm(false);
      await loadCaregivers();
    } catch (e) {
      setError('Failed to send invite');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async (id: number) => {
    try {
      await acceptInvite(id);
      await loadMyInvites();
      await loadMyAccess();
    } catch (e) {
      setError('Failed to accept invite');
    }
  };

  const handleDecline = async (id: number) => {
    try {
      await declineInvite(id);
      await loadMyInvites();
    } catch (e) {
      setError('Failed to decline invite');
    }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm('Revoke access?')) return;
    try {
      await revokeCaregiverAccess(id);
      await loadCaregivers();
    } catch (e) {
      setError('Failed to revoke access');
    }
  };

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader title="Health Caregivers" />

        <Alert type="error" message={error} />

        {/* Tabs */}
        <Card className="mb-6">
          <div className="flex gap-2 border-b border-gray-200 px-4">
            <button
              onClick={() => setTab('manage')}
              className={`py-3 px-4 text-sm font-medium border-b-2 -mb-[2px] ${
                tab === 'manage'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Manage Caregivers
            </button>
            <button
              onClick={() => setTab('invites')}
              className={`py-3 px-4 text-sm font-medium border-b-2 -mb-[2px] ${
                tab === 'invites'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Pending Invites
            </button>
            <button
              onClick={() => setTab('access')}
              className={`py-3 px-4 text-sm font-medium border-b-2 -mb-[2px] ${
                tab === 'access'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              My Access
            </button>
          </div>
        </Card>

        {loading ? (
          <Spinner message="Loading..." />
        ) : tab === 'manage' ? (
          <>
            {/* Invite form */}
            {showInviteForm ? (
              <Card className="mb-6">
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-900">Invite Caregiver</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Grant access to one of your health profiles.
                  </p>
                </div>

                <form onSubmit={handleInvite} className="space-y-4">
                  <Select
                    label="Health Profile"
                    value={formProfile}
                    onChange={(e) => setFormProfile(e.target.value)}
                    required
                  >
                    <option value="">Select profile...</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                  </Select>

                  <Input
                    label="Caregiver Email"
                    type="email"
                    placeholder="caregiver@example.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    required
                  />

                  <Input
                    label="Relationship (optional)"
                    placeholder="e.g., spouse, daughter, nurse"
                    value={formNote}
                    onChange={(e) => setFormNote(e.target.value)}
                  />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Permissions
                    </label>
                    <div className="space-y-2">
                      {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formPermissions.includes(key)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormPermissions([...formPermissions, key]);
                              } else {
                                setFormPermissions(formPermissions.filter(p => p !== key));
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => setShowInviteForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? 'Sending...' : 'Send Invite'}
                    </Button>
                  </div>
                </form>
              </Card>
            ) : (
              <div className="mb-6">
                <Button onClick={() => setShowInviteForm(true)}>
                  + Invite Caregiver
                </Button>
              </div>
            )}

            {/* Caregivers list */}
            {caregivers.length > 0 ? (
              <Card padding={false}>
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-sm font-medium text-gray-900">
                    My Caregivers ({caregivers.length})
                  </h3>
                </div>

                <div className="divide-y divide-gray-200">
                  {caregivers.map((rel) => (
                    <div key={rel.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="font-medium text-sm text-gray-900">
                            {rel.caregiver_name || rel.caregiver_email}
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            {rel.profile_name}
                          </div>
                          {rel.relationship_note && (
                            <div className="text-xs text-gray-500 mt-1">
                              {rel.relationship_note}
                            </div>
                          )}
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {rel.permissions.map(perm => (
                              <Badge key={perm} color="blue">
                                {perm === 'view_all' ? 'View All' : perm.replace(/_/g, ' ')}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <Badge
                            color={
                              rel.status === 'pending' ? 'yellow' :
                              rel.status === 'accepted' ? 'green' :
                              'gray'
                            }
                          >
                            {rel.status_display}
                          </Badge>
                          {rel.status === 'accepted' && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleRevoke(rel.id)}
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <EmptyState
                icon="👥"
                message="No caregivers yet. Invite someone to help manage your health."
              />
            )}
          </>
        ) : tab === 'invites' ? (
          myInvites.length > 0 ? (
            <Card padding={false}>
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-900">
                  Pending Invites ({myInvites.length})
                </h3>
              </div>

              <div className="divide-y divide-gray-200">
                {myInvites.map((invite) => (
                  <div key={invite.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="font-medium text-sm text-gray-900">
                          {invite.primary_name}
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          {invite.primary_email}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          Profile: <span className="font-medium">{invite.profile_name}</span>
                        </div>
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {invite.permissions.map(perm => (
                            <Badge key={perm} color="blue">
                              {perm === 'view_all' ? 'View All' : perm.replace(/_/g, ' ')}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleAccept(invite.id)}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDecline(invite.id)}
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <EmptyState icon="📬" message="No pending invites." />
          )
        ) : (
          myAccess.length > 0 ? (
            <Card padding={false}>
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-900">
                  Profiles You Can Access ({myAccess.length})
                </h3>
              </div>

              <div className="divide-y divide-gray-200">
                {myAccess.map((access) => (
                  <div key={access.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="font-medium text-sm text-gray-900">
                          {access.profile_name}
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          Granted by {access.primary_name}
                        </div>
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {access.permissions.map(perm => (
                            <Badge key={perm} color="green">
                              {perm === 'view_all' ? 'View All' : perm.replace(/_/g, ' ')}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <Badge color="green">Accepted</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <EmptyState icon="🔓" message="No health profiles shared with you yet." />
          )
        )}
      </PageContent>
    </PageShell>
  );
}
