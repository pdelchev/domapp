'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/app/context/LanguageContext';
import {
  PageShell, PageContent, PageHeader, Card, Input, Select,
  Button, Spinner, Alert, Badge, EmptyState, Textarea,
} from '@/app/components/ui';
import NavBar from '@/app/components/NavBar';
import {
  getHealthProfiles, getMedicationReminders, getTodayReminders,
  createMedicationReminder, updateMedicationReminder, deleteMedicationReminder,
  markReminderTaken, markReminderSkipped, snoozeReminder,
} from '@/app/lib/api';

interface HealthProfile {
  id: number;
  full_name: string;
}

interface MedicationReminder {
  id: number;
  profile: number;
  medication_name: string;
  reminder_time: string;
  frequency: string;
  frequency_display: string;
  status: string;
  status_display: string;
  dosage: string;
  instructions: string;
  notes: string;
  taken_count: number;
  skipped_count: number;
  adherence_rate: number;
  start_date: string;
  end_date?: string;
}

interface TodayReminder {
  reminder: MedicationReminder;
  log: ReminderLog | null;
  status: string;
  is_overdue: boolean;
}

interface ReminderLog {
  id: number;
  reminder: number;
  medication_name: string;
  reminder_time: string;
  date: string;
  status: string;
  status_display: string;
}

const FREQUENCY_OPTIONS = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays only' },
  { value: 'weekends', label: 'Weekends only' },
  { value: 'custom', label: 'Custom days' },
];

const STATUS_COLORS: Record<string, 'green' | 'blue' | 'yellow' | 'red' | 'gray'> = {
  taken: 'green',
  pending: 'blue',
  skipped: 'red',
  snoozed: 'yellow',
  dismissed: 'gray',
};

export default function RemindersPage() {
  const { locale } = useLanguage();
  const [profiles, setProfiles] = useState<HealthProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);
  const [reminders, setReminders] = useState<MedicationReminder[]>([]);
  const [todayReminders, setTodayReminders] = useState<TodayReminder[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'today' | 'all' | 'manage'>('today');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form
  const [formName, setFormName] = useState('');
  const [formTime, setFormTime] = useState('08:00');
  const [formFrequency, setFormFrequency] = useState('daily');
  const [formDosage, setFormDosage] = useState('');
  const [formInstructions, setFormInstructions] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load profiles on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await getHealthProfiles();
        setProfiles(data);
        if (data.length > 0) {
          setSelectedProfile(data[0].id);
        }
      } catch (e) {
        setError('Failed to load profiles');
      }
    })();
  }, []);

  // Load reminders when profile changes
  useEffect(() => {
    if (selectedProfile) {
      loadReminders();
    }
  }, [selectedProfile]);

  const loadReminders = useCallback(async () => {
    if (!selectedProfile) return;
    setLoading(true);
    try {
      const [allReminders, todayData] = await Promise.all([
        getMedicationReminders(selectedProfile),
        getTodayReminders(selectedProfile),
      ]);
      setReminders(allReminders);
      setTodayReminders(todayData.reminders || []);
      setStats(todayData.stats || {});
    } catch (e) {
      setError('Failed to load reminders');
    } finally {
      setLoading(false);
    }
  }, [selectedProfile]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile || !formName) {
      setError('Medication name required');
      return;
    }

    setSubmitting(true);
    try {
      await createMedicationReminder({
        profile: selectedProfile,
        medication_name: formName,
        reminder_time: formTime,
        frequency: formFrequency,
        dosage: formDosage,
        instructions: formInstructions,
        notes: formNotes,
      });

      setFormName('');
      setFormTime('08:00');
      setFormFrequency('daily');
      setFormDosage('');
      setFormInstructions('');
      setFormNotes('');
      setShowCreateForm(false);
      await loadReminders();
    } catch (e) {
      setError('Failed to create reminder');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkTaken = async (logId: number) => {
    try {
      await markReminderTaken(logId);
      await loadReminders();
    } catch (e) {
      setError('Failed to mark taken');
    }
  };

  const handleMarkSkipped = async (logId: number) => {
    try {
      await markReminderSkipped(logId);
      await loadReminders();
    } catch (e) {
      setError('Failed to mark skipped');
    }
  };

  const handleSnooze = async (logId: number) => {
    try {
      await snoozeReminder(logId, 30);
      await loadReminders();
    } catch (e) {
      setError('Failed to snooze');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete reminder?')) return;
    try {
      await deleteMedicationReminder(id);
      await loadReminders();
    } catch (e) {
      setError('Failed to delete reminder');
    }
  };

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader title="Medication Reminders" />

        <Alert type="error" message={error} />

        {/* Profile selector */}
        <Card className="mb-6">
          <Select
            label="Health Profile"
            value={selectedProfile?.toString() || ''}
            onChange={(e) => setSelectedProfile(parseInt(e.target.value, 10))}
          >
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </Select>
        </Card>

        {/* Tabs */}
        <Card className="mb-6">
          <div className="flex gap-2 border-b border-gray-200 px-4">
            <button
              onClick={() => setTab('today')}
              className={`py-3 px-4 text-sm font-medium border-b-2 -mb-[2px] ${
                tab === 'today'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600'
              }`}
            >
              Today's Reminders
            </button>
            <button
              onClick={() => setTab('all')}
              className={`py-3 px-4 text-sm font-medium border-b-2 -mb-[2px] ${
                tab === 'all'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600'
              }`}
            >
              All Reminders
            </button>
            <button
              onClick={() => setTab('manage')}
              className={`py-3 px-4 text-sm font-medium border-b-2 -mb-[2px] ${
                tab === 'manage'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600'
              }`}
            >
              Manage
            </button>
          </div>
        </Card>

        {loading ? (
          <Spinner message="Loading reminders..." />
        ) : tab === 'today' ? (
          <>
            {/* Stats */}
            {todayReminders.length > 0 && (
              <Card className="mb-6 bg-indigo-50 border-indigo-200">
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-gray-600">Total</div>
                    <div className="text-2xl font-bold text-indigo-600">
                      {stats.total || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Taken</div>
                    <div className="text-2xl font-bold text-green-600">
                      {stats.taken || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Pending</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {stats.pending || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Adherence</div>
                    <div className="text-2xl font-bold text-indigo-600">
                      {stats.adherence_rate || 0}%
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Today's reminders */}
            {todayReminders.length > 0 ? (
              <Card padding={false}>
                <div className="divide-y divide-gray-200">
                  {todayReminders.map((item) => (
                    <div key={item.reminder.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-sm text-gray-900">
                              {item.reminder.medication_name}
                            </div>
                            <Badge color={STATUS_COLORS[item.status] || 'gray'}>
                              {item.status}
                            </Badge>
                            {item.is_overdue && (
                              <Badge color="red">Overdue</Badge>
                            )}
                          </div>

                          <div className="text-xs text-gray-600 mt-1">
                            {item.reminder.reminder_time}
                          </div>

                          {item.reminder.dosage && (
                            <div className="text-xs text-gray-600">
                              Dosage: {item.reminder.dosage}
                            </div>
                          )}

                          {item.reminder.instructions && (
                            <div className="text-xs text-gray-500 mt-1 italic">
                              {item.reminder.instructions}
                            </div>
                          )}
                        </div>

                        {/* Quick actions */}
                        {item.status === 'pending' || item.status === 'snoozed' ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => item.log && handleMarkTaken(item.log.id)}
                            >
                              ✓ Taken
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => item.log && handleSnooze(item.log.id)}
                            >
                              ⏱ Snooze
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => item.log && handleMarkSkipped(item.log.id)}
                            >
                              Skip
                            </Button>
                          </div>
                        ) : (
                          <Badge
                            color={
                              item.status === 'taken' ? 'green' :
                              item.status === 'skipped' ? 'red' :
                              'gray'
                            }
                          >
                            {item.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <EmptyState
                icon="💊"
                message="No reminders scheduled for today."
              />
            )}
          </>
        ) : tab === 'all' ? (
          reminders.length > 0 ? (
            <Card padding={false}>
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-900">
                  All Reminders ({reminders.length})
                </h3>
              </div>

              <div className="divide-y divide-gray-200">
                {reminders.map((reminder) => (
                  <div key={reminder.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-sm text-gray-900">
                            {reminder.medication_name}
                          </div>
                          <Badge
                            color={
                              reminder.status === 'active' ? 'green' :
                              reminder.status === 'paused' ? 'yellow' :
                              'gray'
                            }
                          >
                            {reminder.status_display}
                          </Badge>
                        </div>

                        <div className="text-xs text-gray-600 mt-1">
                          {reminder.reminder_time} • {reminder.frequency_display}
                        </div>

                        <div className="text-xs text-gray-600">
                          Adherence: {reminder.adherence_rate}% ({reminder.taken_count} taken, {reminder.skipped_count} skipped)
                        </div>

                        {reminder.dosage && (
                          <div className="text-xs text-gray-600">
                            Dosage: {reminder.dosage}
                          </div>
                        )}
                      </div>

                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleDelete(reminder.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <EmptyState
              icon="📋"
              message="No reminders yet. Create one from the Manage tab."
            />
          )
        ) : (
          <>
            {/* Create form */}
            {showCreateForm ? (
              <Card className="mb-6">
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-900">Add Medication Reminder</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Set up a daily reminder to take your medication.
                  </p>
                </div>

                <form onSubmit={handleCreate} className="space-y-4">
                  <Input
                    label="Medication Name"
                    placeholder="e.g., Lisinopril 10mg"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Reminder Time"
                      type="time"
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                      required
                    />

                    <Select
                      label="Frequency"
                      value={formFrequency}
                      onChange={(e) => setFormFrequency(e.target.value)}
                    >
                      {FREQUENCY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </Select>
                  </div>

                  <Input
                    label="Dosage"
                    placeholder="e.g., 1 tablet, 5ml"
                    value={formDosage}
                    onChange={(e) => setFormDosage(e.target.value)}
                  />

                  <Input
                    label="Instructions"
                    placeholder="e.g., Take with food, Before bed"
                    value={formInstructions}
                    onChange={(e) => setFormInstructions(e.target.value)}
                  />

                  <Textarea
                    label="Notes"
                    placeholder="Additional notes..."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                  />

                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => setShowCreateForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? 'Creating...' : 'Create Reminder'}
                    </Button>
                  </div>
                </form>
              </Card>
            ) : (
              <div className="mb-6">
                <Button onClick={() => setShowCreateForm(true)}>
                  + Add Reminder
                </Button>
              </div>
            )}

            {/* Reminders list with edit/delete */}
            {reminders.length > 0 ? (
              <Card padding={false}>
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-sm font-medium text-gray-900">
                    All Reminders ({reminders.length})
                  </h3>
                </div>

                <div className="divide-y divide-gray-200">
                  {reminders.map((reminder) => (
                    <div key={reminder.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="font-medium text-sm text-gray-900">
                            {reminder.medication_name}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {reminder.reminder_time} • {reminder.frequency_display}
                          </div>
                          <div className="text-xs text-gray-600">
                            {reminder.dosage}
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleDelete(reminder.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <EmptyState
                icon="📋"
                message="No reminders yet."
              />
            )}
          </>
        )}
      </PageContent>
    </PageShell>
  );
}
