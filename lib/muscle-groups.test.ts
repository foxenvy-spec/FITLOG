import { describe, it, expect } from 'vitest'
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS_EN,
  muscleGroupLabel,
  guessSecondaryMuscles,
  dominantMuscleGroup,
  describeMuscleFocus,
  formatRelatedGroups,
  MUSCLE_GROUP_BODY_REGION,
} from './muscle-groups'

describe('muscleGroupLabel', () => {
  it('returns the Thai muscle group name unchanged for lang=th', () => {
    expect(muscleGroupLabel('อก', 'th')).toBe('อก')
    expect(muscleGroupLabel('หลัง', 'th')).toBe('หลัง')
  })

  it('returns the English label for lang=en', () => {
    expect(muscleGroupLabel('อก', 'en')).toBe('Chest')
    expect(muscleGroupLabel('หลัง', 'en')).toBe('Back')
    expect(muscleGroupLabel('ขา', 'en')).toBe('Legs')
    expect(muscleGroupLabel('ไหล่', 'en')).toBe('Shoulders')
  })

  it('has an English label defined for every muscle group', () => {
    MUSCLE_GROUPS.forEach((mg) => {
      expect(MUSCLE_GROUP_LABELS_EN[mg]).toBeTruthy()
    })
  })
})

describe('formatRelatedGroups — regression: "ขา" secondary crosses region boundary', () => {
  it('joins primary + secondary muscle groups with "+" instead of a flat "•" list', () => {
    expect(formatRelatedGroups(['อก', 'ไหล่', 'แขน'])).toBe('อก + ไหล่ + แขน')
    expect(formatRelatedGroups(['ขา'])).toBe('ขา')
  })

  it('regression: ขา (Lower Body region) pairs with แกนกลางลำตัว (Core region) — formatting must not imply แกนกลางลำตัว is part of Lower Body', () => {
    const focus = describeMuscleFocus('ขา')
    expect(focus.region).toBe('Lower Body')
    expect(MUSCLE_GROUP_BODY_REGION['แกนกลางลำตัว']).toBe('Core')
    expect(MUSCLE_GROUP_BODY_REGION['แกนกลางลำตัว']).not.toBe(focus.region)
    // ยังคง data เดิมทุกประการ (ไม่ตัด แกนกลางลำตัว ออก) แค่เปลี่ยนตัวเชื่อมตอนแสดงผล
    expect(formatRelatedGroups(focus.relatedGroups)).toBe('ขา + แกนกลางลำตัว')
  })
})

describe('guessSecondaryMuscles', () => {
  it('guesses shoulders + arms for chest press variants', () => {
    expect(guessSecondaryMuscles('Incline Barbell/Smith Press', 'อก')).toEqual(['ไหล่', 'แขน'])
    expect(guessSecondaryMuscles('Flat Dumbbell Press', 'อก')).toEqual(['ไหล่', 'แขน'])
  })

  it('guesses shoulders only for fly variants', () => {
    expect(guessSecondaryMuscles('Dumbbell Fly (ค้างตอนยืด)', 'อก')).toEqual(['ไหล่'])
  })

  it('guesses arms for rows, pulldowns, and pull-ups', () => {
    expect(guessSecondaryMuscles('Barbell Row', 'หลัง')).toEqual(['แขน'])
    expect(guessSecondaryMuscles('Lat Pulldown', 'หลัง')).toEqual(['แขน'])
    expect(guessSecondaryMuscles('Pull-up', 'หลัง')).toEqual(['แขน'])
  })

  it('guesses legs + core for deadlifts and core only for squats', () => {
    expect(guessSecondaryMuscles('Romanian Deadlift', 'หลัง')).toEqual(['ขา', 'แกนกลางลำตัว'])
    expect(guessSecondaryMuscles('Back Squat', 'ขา')).toEqual(['แกนกลางลำตัว'])
  })

  it('returns no secondary muscles for isolation moves', () => {
    expect(guessSecondaryMuscles('Leg Curl', 'ขา')).toEqual([])
    expect(guessSecondaryMuscles('Bicep Curl', 'แขน')).toEqual([])
    expect(guessSecondaryMuscles('Lateral Raise', 'ไหล่')).toEqual([])
  })

  it('falls back to the primary-muscle default when no keyword matches', () => {
    expect(guessSecondaryMuscles('Mystery Machine Move', 'อก')).toEqual(['ไหล่', 'แขน'])
    expect(guessSecondaryMuscles('Mystery Machine Move', 'แขน')).toEqual([])
  })

  it('never includes the primary muscle in the secondary list', () => {
    expect(guessSecondaryMuscles('Overhead Press', 'ไหล่')).not.toContain('ไหล่')
  })
})

describe('dominantMuscleGroup', () => {
  it('returns the muscle group with the most exercises', () => {
    const items = [{ muscle_group: 'ขา' }, { muscle_group: 'ขา' }, { muscle_group: 'แกนกลางลำตัว' }]
    expect(dominantMuscleGroup(items)).toBe('ขา')
  })

  it('ignores null muscle_group entries', () => {
    const items = [{ muscle_group: null }, { muscle_group: 'อก' }, { muscle_group: null }]
    expect(dominantMuscleGroup(items)).toBe('อก')
  })

  it('returns null for an empty list', () => {
    expect(dominantMuscleGroup([])).toBeNull()
  })

  it('returns null when every entry has a null muscle_group', () => {
    expect(dominantMuscleGroup([{ muscle_group: null }, { muscle_group: null }])).toBeNull()
  })
})
