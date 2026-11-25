import { describe, it, expect } from 'vitest';
import {
  fmtDateTime,
  fmtDuration,
  fmtMinutes,
  toLocalInput,
  fromLocalInput,
  fmtScore,
} from './format';

describe('format utilities', () => {
  describe('fmtDateTime', () => {
    it('returns dash for null/undefined/empty', () => {
      expect(fmtDateTime(null)).toBe('—');
      expect(fmtDateTime(undefined)).toBe('—');
      expect(fmtDateTime('')).toBe('—');
    });

    it('formats ISO string or Date object', () => {
      const d = new Date('2026-10-15T10:30:00Z');
      const formatted = fmtDateTime(d.toISOString());
      expect(formatted).not.toBe('—');
      expect(typeof formatted).toBe('string');
    });
  });

  describe('fmtDuration', () => {
    it('formats durations in seconds to mm:ss or h:mm:ss', () => {
      expect(fmtDuration(0)).toBe('00:00');
      expect(fmtDuration(45)).toBe('00:45');
      expect(fmtDuration(65)).toBe('01:05');
      expect(fmtDuration(3665)).toBe('1:01:05');
    });

    it('clamps negative values to 00:00', () => {
      expect(fmtDuration(-10)).toBe('00:00');
    });
  });

  describe('fmtMinutes', () => {
    it('formats seconds into minutes or hours and minutes', () => {
      expect(fmtMinutes(300)).toBe('5 min');
      expect(fmtMinutes(3600)).toBe('1 h');
      expect(fmtMinutes(5400)).toBe('1 h 30 min');
    });
  });

  describe('toLocalInput and fromLocalInput', () => {
    it('handles empty input gracefully', () => {
      expect(toLocalInput(null)).toBe('');
      expect(toLocalInput(undefined)).toBe('');
      expect(fromLocalInput('')).toBeNull();
    });

    it('converts between datetime-local and ISO string', () => {
      const iso = '2026-11-24T15:30:00.000Z';
      const local = toLocalInput(iso);
      expect(local.length).toBe(16); // YYYY-MM-DDTHH:mm
      const backIso = fromLocalInput(local);
      expect(backIso).not.toBeNull();
    });
  });

  describe('fmtScore', () => {
    it('returns dash for null or undefined', () => {
      expect(fmtScore(null)).toBe('—');
      expect(fmtScore(undefined)).toBe('—');
    });

    it('formats integer scores without decimals', () => {
      expect(fmtScore(10)).toBe('10');
      expect(fmtScore(0)).toBe('0');
    });

    it('formats floating point scores to 2 decimals', () => {
      expect(fmtScore(8.5)).toBe('8.50');
      expect(fmtScore(9.3333)).toBe('9.33');
    });
  });
});
