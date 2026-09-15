import { describe, expect, it } from 'vitest';
import { computeGrowth, normalCdf, ageInYears, classifyBmiZ } from './growth';
import { classifyVital, classifyAll } from './vitals';
import data from './who-growth-data.json';

describe('WHO growth', () => {
  it('returns z=0 / P50 at the median of each table', () => {
    // WHO 2007: boys 61 months BMI median 15.2641
    const birth = new Date(2020, 0, 1);
    const at = new Date(birth.getTime() + 61 * 30.4375 * 86400000);
    const row = (data as any).bmi['1'].find((r: number[]) => r[0] === 61);
    expect(row[2]).toBeCloseTo(15.2641, 4);
    const heightM = 110; // arbitrary
    const weight = row[2] * (heightM / 100) ** 2;
    const g = computeGrowth({ sex: 'M', birthDate: birth, measuredAt: at, weightKg: weight, heightCm: heightM });
    expect(g.bmiForAge!.z).toBeCloseTo(0, 1);
    expect(g.bmiForAge!.percentile).toBeCloseTo(50, 0);
    expect(g.classification!.code).toBe('NORMAL');
  });

  it('height-for-age at median girl 19 y', () => {
    const birth = new Date(2000, 0, 1);
    const at = new Date(birth.getTime() + 229 * 30.4375 * 86400000);
    const g = computeGrowth({ sex: 'F', birthDate: birth, measuredAt: at, weightKg: 56, heightCm: 163.1548 });
    expect(g.heightForAge!.z).toBeCloseTo(0, 1);
    expect(g.weightForAge).toBeNull(); // WFA reference ends at 10 years
  });

  it('flags obesity and thinness for school age', () => {
    expect(classifyBmiZ(2.5, 120)!.code).toBe('OBESITY');
    expect(classifyBmiZ(1.5, 120)!.code).toBe('OVERWEIGHT');
    expect(classifyBmiZ(-2.5, 120)!.code).toBe('THINNESS');
    expect(classifyBmiZ(2.5, 40)!.code).toBe('OVERWEIGHT');
  });

  it('normal CDF is accurate', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-2)).toBeCloseTo(0.02275, 4);
  });

  it('computes completed years', () => {
    expect(ageInYears('2015-09-15', '2026-09-14')).toBe(10);
    expect(ageInYears('2015-09-14', '2026-09-14')).toBe(11);
  });

  it('tables are contiguous by month', () => {
    for (const ind of ['bmi', 'wfa', 'hfa'])
      for (const sex of ['1', '2']) {
        const t = (data as any)[ind][sex] as number[][];
        t.forEach((r, i) => expect(r[0]).toBe(i));
      }
  });
});

describe('vital signs', () => {
  it('classifies by age group', () => {
    expect(classifyVital('heartRate', 130, 4)).toBe('normal');
    expect(classifyVital('heartRate', 130, 15)).toBe('warning');
    expect(classifyVital('heartRate', 160, 15)).toBe('critical');
    expect(classifyVital('temperatureC', 38.2, 8)).toBe('warning');
    expect(classifyVital('temperatureC', 39.8, 8)).toBe('critical');
    expect(classifyVital('spo2', 93, 8)).toBe('warning');
    expect(classifyVital('spo2', 90, 8)).toBe('critical');
    expect(classifyVital('glucoseMgDl', 50, 12)).toBe('critical');
    expect(classifyVital('glasgow', 14, 12)).toBe('warning');
    expect(classifyVital('glasgow', 12, 12)).toBe('critical');
    expect(classifyVital('systolic', 75, 8)).toBe('critical'); // < 70 + 2×8 = 86
    expect(classifyVital('heartRate', null, 8)).toBeNull();
  });

  it('computes worst level', () => {
    expect(classifyAll({ heartRate: 90, temperatureC: 36.8 }, 10).worst).toBe('normal');
    expect(classifyAll({ heartRate: 90, spo2: 89 }, 10).worst).toBe('critical');
  });
});
