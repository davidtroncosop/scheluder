import { describe, expect, it } from 'vitest';
import {
  areDirectParentAndChild,
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
});
