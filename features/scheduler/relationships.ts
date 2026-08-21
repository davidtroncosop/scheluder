export interface SectionRelationshipIdentity {
  id: string;
  parent_section_id?: string | null;
  section_code?: string | null;
  parallel_index?: number | null;
}

export const areSiblingPractices = (
  first: SectionRelationshipIdentity,
  second: SectionRelationshipIdentity,
): boolean => Boolean(
  first.id !== second.id &&
  first.parent_section_id &&
  second.parent_section_id &&
  first.parent_section_id === second.parent_section_id
);

export const areDirectParentAndChild = (
  first: SectionRelationshipIdentity,
  second: SectionRelationshipIdentity,
): boolean => (
  first.parent_section_id === second.id ||
  second.parent_section_id === first.id
);

export const shouldApplyLevelClash = (
  first: SectionRelationshipIdentity,
  second: SectionRelationshipIdentity,
): boolean => (
  !areSiblingPractices(first, second) &&
  !areDirectParentAndChild(first, second)
);

/**
 * Returns true if two sections of the SAME level are attempting to occupy the SAME section track.
 * E.g., both are assigned to Section 1 (parallel_index 0) or Section 2 (parallel_index 1).
 * In that case, they cannot run simultaneously in the same module.
 */
export const areInSameLevelSectionTrack = (
  first: SectionRelationshipIdentity,
  second: SectionRelationshipIdentity,
): boolean => {
  const p1 = first.parallel_index !== undefined && first.parallel_index !== null ? Number(first.parallel_index) : 0;
  const p2 = second.parallel_index !== undefined && second.parallel_index !== null ? Number(second.parallel_index) : 0;
  return p1 === p2;
};
