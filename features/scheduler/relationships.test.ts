import { describe, expect, it } from 'vitest';
import {
  areDirectParentAndChild,
  areInSameLevelSectionTrack,
  areSiblingPractices,
  shouldApplyLevelClash,
} from './relationships';

const theory = { id: 'teo-1', parent_section_id: null };
const labOne = { id: 'lab-1', parent_section_id: 'teo-1' };
const labTwo = { id: 'lab-2', parent_section_id: 'teo-1' };
const unrelated = { id: 'teo-2', parent_section_id: null };

describe('section parent-child relationships', () => {
  it('allows sibling practices to run in parallel', () => {
    expect(areSiblingPractices(labOne, labTwo)).toBe(true);
    expect(shouldApplyLevelClash(labOne, labTwo)).toBe(false);
  });

  it('identifies a theory and its practice as a direct conflict', () => {
    expect(areDirectParentAndChild(theory, labOne)).toBe(true);
    expect(shouldApplyLevelClash(theory, labOne)).toBe(false);
  });

  it('keeps the ordinary level rule for unrelated sections', () => {
    expect(areSiblingPractices(labOne, unrelated)).toBe(false);
    expect(areDirectParentAndChild(labOne, unrelated)).toBe(false);
    expect(shouldApplyLevelClash(labOne, unrelated)).toBe(true);
  });

  it('detects collision when two sections of the same level share the same parallel section track', () => {
    const sec1A = { id: 'math-1', parallel_index: 0 };
    const sec1B = { id: 'chem-1', parallel_index: 0 };
    const sec2 = { id: 'math-2', parallel_index: 1 };

    // Same section track (Sec 1 vs Sec 1) -> Collision!
    expect(areInSameLevelSectionTrack(sec1A, sec1B)).toBe(true);

    // Different section tracks (Sec 1 vs Sec 2) -> Permitted in parallel!
    expect(areInSameLevelSectionTrack(sec1A, sec2)).toBe(false);
  });
});
