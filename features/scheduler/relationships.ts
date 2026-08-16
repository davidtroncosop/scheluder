export interface SectionRelationshipIdentity {
  id: string;
  parent_section_id?: string | null;
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
