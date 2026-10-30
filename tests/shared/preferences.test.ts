import { describe, expect, it } from 'vitest';
import { isInQuietHours, normalizePreferences } from '../../shared/preferences';

describe('preferences', () => {
  it('preservesCloseToTrayForLegacyPreferences', () => {
    expect(normalizePreferences({ closeToTray: false })).toEqual({
      closeToTray: false,
      captureShortcut: 'CommandOrControl+Shift+Space',
      reminderSound: true,
      quietHoursStart: '',
      quietHoursEnd: '',
    });
  });

  it('defaultsInvalidValues', () => {
    const defaults = normalizePreferences(undefined);
    for (const raw of [null, true, [], 'old preferences', {
      closeToTray: 'false', captureShortcut: '', reminderSound: 0,
      quietHoursStart: '24:00', quietHoursEnd: '07:60',
    }, {
      closeToTray: null, captureShortcut: 'Control+\nK', reminderSound: null,
      quietHoursStart: '7:30', quietHoursEnd: 700,
    }]) expect(normalizePreferences(raw)).toEqual(defaults);
    expect(normalizePreferences({ captureShortcut: '  Control+Alt+K  ', reminderSound: false,
      quietHoursStart: '22:00', quietHoursEnd: '07:00' })).toMatchObject({
      captureShortcut: 'Control+Alt+K', reminderSound: false,
      quietHoursStart: '22:00', quietHoursEnd: '07:00',
    });
  });

  it('handlesOvernightQuietHours', () => {
    expect(isInQuietHours(new Date(2026, 9, 30, 23, 30), '22:00', '07:00')).toBe(true);
    expect(isInQuietHours(new Date(2026, 9, 31, 6, 59), '22:00', '07:00')).toBe(true);
    expect(isInQuietHours(new Date(2026, 9, 31, 12, 0), '22:00', '07:00')).toBe(false);
  });

  it('treatsStartAsQuietAndEndAsOpen', () => {
    for (const [start, end] of [['09:00', '17:00'], ['22:00', '07:00']]) {
      const [startHour, startMinute] = start.split(':').map(Number);
      const [endHour, endMinute] = end.split(':').map(Number);
      expect(isInQuietHours(new Date(2026, 9, 30, startHour, startMinute), start, end)).toBe(true);
      expect(isInQuietHours(new Date(2026, 9, 30, endHour, endMinute), start, end)).toBe(false);
    }
  });

  it('disablesEmptyInvalidAndEqualQuietHourRanges', () => {
    const now = new Date(2026, 9, 30, 12, 0);
    for (const [start, end] of [['', '07:00'], ['22:00', ''], ['25:00', '07:00'],
      ['22:00', '07:99'], ['12:00', '12:00']]) expect(isInQuietHours(now, start, end)).toBe(false);
    expect(isInQuietHours(new Date('invalid'), '09:00', '17:00')).toBe(false);
  });
});
