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

export const getSectionTrackNumber = (section: SectionRelationshipIdentity): number => {
  if (section.section_code !== undefined && section.section_code !== null && String(section.section_code).trim() !== '') {
    const match = String(section.section_code).match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num >= 1) return num;
    }
  }
  if (section.parallel_index !== undefined && section.parallel_index !== null) {
    return Number(section.parallel_index) + 1;
  }
  return 1;
};

/**
 * Returns true if two sections of the SAME level are attempting to occupy the SAME section track.
 * E.g., both are assigned to Section 1 (S1) or Section 2 (S2).
 * In that case, they cannot run simultaneously in the same module.
 */
export const areInSameLevelSectionTrack = (
  first: SectionRelationshipIdentity,
  second: SectionRelationshipIdentity,
): boolean => {
  return getSectionTrackNumber(first) === getSectionTrackNumber(second);
};
