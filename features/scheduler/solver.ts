import {
  areDirectParentAndChild,
  areInSameLevelSectionTrack,
  getSectionTrackNumber,
  shouldApplyLevelClash,
  type SectionRelationshipIdentity,
} from './relationships';

export interface SolverRoom {
  id: string;
  name: string;
  type: string; // TEO, LAB, SIM, TAL, AUD
  capacity: number;
  is_shared?: boolean | number;
  career_id?: string | null;
}

export interface SolverTimeslot {
  id: string;
  label: string;
  order_index: number;
  start_time?: string;
  end_time?: string;
}

export interface SolverSection {
  id: string;
  nrc: string;
  section_code?: string | null;
  subject_id: string;
  subject_name: string;
  subject_code?: string;
  level: number;
  type: string; // TEO, LAB, SIM, TAL
  parent_section_id?: string | null;
  hours_per_week: number;
  teacher_id?: string | null;
  teacher_name?: string | null;
  career_id: string;
  expected_students?: number;
  preferred_room_id?: string | null;
}

export interface SolverTeacherAvailability {
  teacher_id: string;
  timeslot_id: string;
  day_of_week: number;
  status: 'preference' | 'blocked' | 'available';
}

export interface SolverRoomCompatibility {
  subject_id: string;
  room_id: string;
  requirement_level: 'EXCLUSIVE' | 'PREFERRED' | 'ALLOWED';
  room_type?: string;
}

export interface SolverAssignment {
  id: string;
  section_id: string;
  room_id: string;
  timeslot_id: string;
  day_of_week: number;
  parallel_index: number;
  score?: number;
}

export interface RelocationRecord {
  movedSectionId: string;
  movedSectionNrc: string;
  movedSubjectName: string;
  fromSlot: { day_of_week: number; timeslot_id: string; room_id: string };
  toSlot: { day_of_week: number; timeslot_id: string; room_id: string };
  freedForSectionId: string;
  freedForSectionNrc: string;
  freedForSubjectName: string;
  reason: string;
}

export interface UnassignedDiagnostic {
  section_id: string;
  nrc: string;
  subject_name: string;
  unassignedHours: number;
  primaryBottleneck: string;
  suggestedAction: string;
}

export interface SolverOptions {
  maxBacktrackDepth?: number; // Default 2
  maxRelocations?: number; // Default 30
  allowCrossDaySwaps?: boolean; // Default true
  existingAssignments?: SolverAssignment[];
  lockedAssignmentIds?: Set<string>;
}

export interface SolverResult {
  assignments: SolverAssignment[];
  relocations: RelocationRecord[];
  unassigned: UnassignedDiagnostic[];
  totalSlotsRequired: number;
  totalSlotsAssigned: number;
  coveragePercentage: number;
  deadlocksResolved: number;
  executionTimeMs: number;
}

export const isRoomTypeCompatible = (secType?: string, rmType?: string): boolean => {
  const s = (secType || 'TEO').toUpperCase();
  const r = (rmType || 'TEO').toUpperCase();
  if (s === 'LAB') return r === 'LAB' || r === 'SIM';
  if (s === 'SIM') return r === 'SIM';
  if (s === 'TAL') return r === 'TAL';
  return r === 'TEO' || r === 'AUD';
};

/**
 * Checks if assigning a section to a specific slot and room violates any hard constraint.
 */
export const checkHardConflict = (
  section: SolverSection,
  day: number,
  timeslot: SolverTimeslot,
  room: SolverRoom,
  targetParallelIndex: number,
  currentAssignments: SolverAssignment[],
  sectionsMap: Map<string, SolverSection>,
  roomsMap: Map<string, SolverRoom>,
  blockedTeacherSlots: Set<string>,
  exclusiveRoomsBySubject: Map<string, string[]>,
  excludeAssignmentId?: string,
): { valid: boolean; reason?: string; conflictingAssignment?: SolverAssignment } => {
  // 1. Room type compatibility
  if (!isRoomTypeCompatible(section.type, room.type)) {
    return { valid: false, reason: `Incompatibilidad de sala: requiere ${section.type} y ${room.name} es ${room.type}` };
  }

  // 2. Room capacity
  if (section.expected_students && room.capacity < section.expected_students) {
    return { valid: false, reason: `Aforo insuficiente: espera ${section.expected_students} pero sala tiene ${room.capacity}` };
  }

  // 3. Exclusive room requirements
  const exclusiveRooms = exclusiveRoomsBySubject.get(section.subject_id);
  if (exclusiveRooms && exclusiveRooms.length > 0 && !exclusiveRooms.includes(room.id)) {
    return { valid: false, reason: 'Asignatura requiere una sala exclusiva designada' };
  }

  const slotKey = `${timeslot.id}|${day}`;

  // 4. Teacher blocked availability
  if (section.teacher_id && blockedTeacherSlots.has(`${section.teacher_id}|${slotKey}`)) {
    return { valid: false, reason: 'Docente tiene este horario bloqueado' };
  }

  const currentRel: SectionRelationshipIdentity = {
    id: section.id,
    parent_section_id: section.parent_section_id,
    section_code: section.section_code,
    parallel_index: targetParallelIndex,
  };

  let sameLevelParallelCount = 0;

  for (const asgn of currentAssignments) {
    if (excludeAssignmentId && asgn.id === excludeAssignmentId) continue;
    if (asgn.day_of_week !== day || asgn.timeslot_id !== timeslot.id) continue;

    // a) Room occupied
    if (asgn.room_id === room.id) {
      return { valid: false, reason: `Sala ${room.name} ya está ocupada`, conflictingAssignment: asgn };
    }

    const otherSec = sectionsMap.get(asgn.section_id);
    if (!otherSec) continue;

    // b) Teacher duplicate
    if (section.teacher_id && otherSec.teacher_id === section.teacher_id) {
      return { valid: false, reason: `Docente ${section.teacher_name || ''} ya está asignado en ese bloque`, conflictingAssignment: asgn };
    }

    const otherRel: SectionRelationshipIdentity = {
      id: otherSec.id,
      parent_section_id: otherSec.parent_section_id,
      section_code: otherSec.section_code,
      parallel_index: asgn.parallel_index,
    };

    // c) Parent-child overlap (Theory and practice cannot share the same block)
    if (areDirectParentAndChild(currentRel, otherRel)) {
      return { valid: false, reason: 'La teoría y su sección práctica asociada no pueden compartir bloque', conflictingAssignment: asgn };
    }

    // d) Same Level clashes
    if (otherSec.level === section.level && otherSec.career_id === section.career_id) {
      if (shouldApplyLevelClash(currentRel, otherRel)) {
        sameLevelParallelCount++;

        // Same section track clash (e.g. both S1 or both S2 of same level)
        if (areInSameLevelSectionTrack(currentRel, otherRel)) {
          return {
            valid: false,
            reason: `Tope de sección curricular: Dos asignaturas de la Sección ${getSectionTrackNumber(currentRel)} coinciden en el mismo bloque`,
            conflictingAssignment: asgn,
          };
        }
      }
    }
  }

  // Max 3 parallel sections per level in a single timeslot
  if (sameLevelParallelCount >= 3) {
    return { valid: false, reason: `Tope de nivel: ya existen 3 secciones simultáneas en el nivel ${section.level}` };
  }

  return { valid: true };
};

/**
 * Computes objective quality score for a valid slot.
 */
export const scoreSlot = (
  section: SolverSection,
  day: number,
  timeslot: SolverTimeslot,
  room: SolverRoom,
  currentAssignments: SolverAssignment[],
  sectionsMap: Map<string, SolverSection>,
  timeslotsMap: Map<string, SolverTimeslot>,
  teacherPreferences: Set<string>,
  preferredRoomsBySubject: Set<string>,
): number => {
  let score = 100;

  // 1. PRIMARY OBJECTIVE: Minimize Level Gaps / Ventanas for students
  const sameLevelAssignments = currentAssignments.filter(asgn => {
    if (asgn.day_of_week !== day || asgn.section_id === section.id) return false;
    const s = sectionsMap.get(asgn.section_id);
    return s && s.level === section.level && s.career_id === section.career_id;
  });

  const levelOrders = sameLevelAssignments
    .map(a => timeslotsMap.get(a.timeslot_id)?.order_index)
    .filter((order): order is number => order !== undefined);

  if (levelOrders.length > 0) {
    const minDistance = Math.min(...levelOrders.map(o => Math.abs(o - timeslot.order_index)));
    const minOrder = Math.min(...levelOrders);
    const maxOrder = Math.max(...levelOrders);

    if (minDistance === 1) {
      const isBridging = timeslot.order_index > minOrder && timeslot.order_index < maxOrder;
      score += isBridging ? 55 : 45; // Huge bonus for 0-gap contiguous schedule
    } else {
      const gap = minDistance - 1;
      const penalty = gap === 1 ? -40 : gap === 2 ? -70 : -100;
      score += penalty;
    }
  } else {
    // First class of the day for this level: favor standard block starts
    if (timeslot.order_index === 1 || timeslot.order_index === 2) score += 20;
    else if (timeslot.order_index === 5) score += 15;
    else if (timeslot.order_index >= 3 && timeslot.order_index <= 4) score -= 10;
  }

  // 2. Teacher Gaps & Preferences
  if (section.teacher_id) {
    const teacherAssignments = currentAssignments.filter(asgn => {
      if (asgn.day_of_week !== day || asgn.section_id === section.id) return false;
      const s = sectionsMap.get(asgn.section_id);
      return s && s.teacher_id === section.teacher_id;
    });

    const teacherOrders = teacherAssignments
      .map(a => timeslotsMap.get(a.timeslot_id)?.order_index)
      .filter((order): order is number => order !== undefined);

    if (teacherOrders.length > 0) {
      const minTeacherDist = Math.min(...teacherOrders.map(o => Math.abs(o - timeslot.order_index)));
      if (minTeacherDist === 1) score += 25;
      else score -= Math.min(45, (minTeacherDist - 1) * 20);
    }

    if (teacherPreferences.has(`${section.teacher_id}|${timeslot.id}|${day}`)) {
      score += 20;
    }
  }

  // 3. Exact Room Type Match
  if (section.type === room.type) score += 25;

  // 4. Preferred Room for Subject
  if (preferredRoomsBySubject.has(`${section.subject_id}|${room.id}`)) score += 20;

  // 5. Capacity Fit
  if (section.expected_students && section.expected_students > 0) {
    const ratio = room.capacity / section.expected_students;
    if (ratio >= 1.0 && ratio <= 1.35) score += 15;
    else if (ratio > 2.5) score -= 15;
  }

  // 6. Friday late penalty
  if (day === 5 && timeslot.order_index >= 6) score -= 15;

  return Math.max(1, Math.min(100, score));
};

/**
 * Main Solver with Bounded Backtracking and Local Relocation.
 */
export const solveSchedule = (
  sections: SolverSection[],
  rooms: SolverRoom[],
  timeslots: SolverTimeslot[],
  teacherAvailabilities: SolverTeacherAvailability[] = [],
  roomCompatibilities: SolverRoomCompatibility[] = [],
  options: SolverOptions = {},
): SolverResult => {
  const startTime = Date.now();
  const maxBacktrackDepth = options.maxBacktrackDepth ?? 2;
  const maxRelocations = options.maxRelocations ?? 30;
  const lockedIds = options.lockedAssignmentIds ?? new Set<string>();

  // Maps and indexes for O(1) lookups
  const sectionsMap = new Map<string, SolverSection>(sections.map(s => [s.id, s]));
  const roomsMap = new Map<string, SolverRoom>(rooms.map(r => [r.id, r]));
  const timeslotsMap = new Map<string, SolverTimeslot>(timeslots.map(t => [t.id, t]));
  const sortedTimeslots = [...timeslots].sort((a, b) => a.order_index - b.order_index);

  const blockedTeacherSlots = new Set<string>();
  const teacherPreferences = new Set<string>();
  for (const a of teacherAvailabilities) {
    if (a.status === 'blocked') blockedTeacherSlots.add(`${a.teacher_id}|${a.timeslot_id}|${a.day_of_week}`);
    else if (a.status === 'preference') teacherPreferences.add(`${a.teacher_id}|${a.timeslot_id}|${a.day_of_week}`);
  }

  const exclusiveRoomsBySubject = new Map<string, string[]>();
  const preferredRoomsBySubject = new Set<string>();
  for (const c of roomCompatibilities) {
    if (c.requirement_level === 'EXCLUSIVE') {
      const list = exclusiveRoomsBySubject.get(c.subject_id) || [];
      list.push(c.room_id);
      exclusiveRoomsBySubject.set(c.subject_id, list);
    } else if (c.requirement_level === 'PREFERRED') {
      preferredRoomsBySubject.add(`${c.subject_id}|${c.room_id}`);
    }
  }

  // Active assignments working set
  let activeAssignments: SolverAssignment[] = [...(options.existingAssignments || [])];
  const relocations: RelocationRecord[] = [];
  const unassigned: UnassignedDiagnostic[] = [];
  let deadlocksResolved = 0;

  // Determine section track index for a section
  const determineParallelIndex = (section: SolverSection): number => {
    return getSectionTrackNumber({
      id: section.id,
      parent_section_id: section.parent_section_id,
      section_code: section.section_code,
    }) - 1;
  };

  // Helper to find all valid candidate slots for a section
  const findValidSlotsForSection = (
    section: SolverSection,
    currentAssignments: SolverAssignment[],
    excludeAssignmentId?: string,
  ): Array<{ day: number; timeslot: SolverTimeslot; room: SolverRoom; score: number }> => {
    const candidates: Array<{ day: number; timeslot: SolverTimeslot; room: SolverRoom; score: number }> = [];
    const targetParallelIndex = determineParallelIndex(section);

    for (let day = 1; day <= 5; day++) {
      for (const timeslot of sortedTimeslots) {
        for (const room of rooms) {
          const check = checkHardConflict(
            section,
            day,
            timeslot,
            room,
            targetParallelIndex,
            currentAssignments,
            sectionsMap,
            roomsMap,
            blockedTeacherSlots,
            exclusiveRoomsBySubject,
            excludeAssignmentId,
          );

          if (check.valid) {
            const score = scoreSlot(
              section,
              day,
              timeslot,
              room,
              currentAssignments,
              sectionsMap,
              timeslotsMap,
              teacherPreferences,
              preferredRoomsBySubject,
            );
            candidates.push({ day, timeslot, room, score });
          }
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  };

  // Helper to prioritize sections: Hardest/Most constrained first
  const calculateDifficulty = (sec: SolverSection): number => {
    let score = 20;
    const type = (sec.type || 'TEO').toUpperCase();
    if (type === 'SIM') score += 40;
    else if (type === 'LAB') score += 30;
    else if (type === 'TAL') score += 20;

    if (sec.hours_per_week >= 6) score += 25;
    else if (sec.hours_per_week >= 4) score += 15;

    // If section has exclusive rooms
    if (exclusiveRoomsBySubject.has(sec.subject_id)) score += 25;

    // Has assigned teacher
    if (sec.teacher_id) score += 10;

    return score;
  };

  // Build the work queue of modules needed per section
  const queue: Array<{ section: SolverSection; slotIndex: number }> = [];
  const assignedCounts = new Map<string, number>();
  for (const asgn of activeAssignments) {
    assignedCounts.set(asgn.section_id, (assignedCounts.get(asgn.section_id) || 0) + 1);
  }

  // Sort sections descending by difficulty
  const sortedSections = [...sections].sort((a, b) => calculateDifficulty(b) - calculateDifficulty(a));

  for (const sec of sortedSections) {
    const alreadyAssigned = assignedCounts.get(sec.id) || 0;
    const needed = Math.max(0, Number(sec.hours_per_week || 0) - alreadyAssigned);
    for (let i = 0; i < needed; i++) {
      queue.push({ section: sec, slotIndex: i + 1 });
    }
  }

  const totalSlotsRequired = sections.reduce((sum, s) => sum + Number(s.hours_per_week || 0), 0);

  // Attempt to schedule each item in queue
  for (const item of queue) {
    const sec = item.section;
    const targetParallelIndex = determineParallelIndex(sec);

    // 1. Greedy attempt: find best conflict-free candidate slot
    const candidates = findValidSlotsForSection(sec, activeAssignments);

    if (candidates.length > 0) {
      // Pick best valid candidate slot
      const best = candidates[0];
      activeAssignments.push({
        id: `asgn-${sec.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        section_id: sec.id,
        room_id: best.room.id,
        timeslot_id: best.timeslot.id,
        day_of_week: best.day,
        parallel_index: targetParallelIndex,
        score: best.score,
      });
      continue;
    }

    // 2. DEADLOCK DETECTED: No direct valid slot found for this section.
    // Initiate Bounded Backtracking and Local Swaps / Relocation.
    let resolved = false;

    if (relocations.length < maxRelocations && maxBacktrackDepth >= 1) {
      // Find "near-miss" slots: slots where placing `sec` is blocked by exactly ONE assignment
      const nearMisses: Array<{
        day: number;
        timeslot: SolverTimeslot;
        room: SolverRoom;
        blockingAssignment: SolverAssignment;
      }> = [];

      for (let day = 1; day <= 5; day++) {
        for (const timeslot of sortedTimeslots) {
          for (const room of rooms) {
            const check = checkHardConflict(
              sec,
              day,
              timeslot,
              room,
              targetParallelIndex,
              activeAssignments,
              sectionsMap,
              roomsMap,
              blockedTeacherSlots,
              exclusiveRoomsBySubject,
            );

            if (!check.valid && check.conflictingAssignment) {
              const blk = check.conflictingAssignment;
              // Can only relocate assignments that aren't locked and belong to different sections
              if (!lockedIds.has(blk.id) && blk.section_id !== sec.id) {
                nearMisses.push({ day, timeslot, room, blockingAssignment: blk });
              }
            }
          }
        }
      }

      // Try 1-Hop Relocation on near-miss blockers
      for (const miss of nearMisses) {
        const blk = miss.blockingAssignment;
        const blkSec = sectionsMap.get(blk.section_id);
        if (!blkSec) continue;

        // Find alternative slots for the blocking assignment, WITHOUT the blocking assignment itself in the grid,
        // and reserving miss.timeslot / miss.room for `sec`.
        const tempAssignmentsWithoutBlk = activeAssignments.filter(a => a.id !== blk.id);

        // Can `sec` be placed in `miss` if `blk` is removed?
        const secValidInMiss = checkHardConflict(
          sec,
          miss.day,
          miss.timeslot,
          miss.room,
          targetParallelIndex,
          tempAssignmentsWithoutBlk,
          sectionsMap,
          roomsMap,
          blockedTeacherSlots,
          exclusiveRoomsBySubject,
        );

        if (!secValidInMiss.valid) continue; // If `sec` still has other conflicts in that slot, 1-hop won't suffice

        // Temporarily put `sec` into the vacated slot
        const tentativeSecAsgn: SolverAssignment = {
          id: `asgn-${sec.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          section_id: sec.id,
          room_id: miss.room.id,
          timeslot_id: miss.timeslot.id,
          day_of_week: miss.day,
          parallel_index: targetParallelIndex,
        };

        const assignmentsWithSec = [...tempAssignmentsWithoutBlk, tentativeSecAsgn];

        // Now search if `blkSec` has an alternative valid slot
        const blkAlternatives = findValidSlotsForSection(blkSec, assignmentsWithSec);

        if (blkAlternatives.length > 0) {
          // Found an alternative slot for `blkSec`!
          const bestBlkAlt = blkAlternatives[0];
          const newBlkAsgn: SolverAssignment = {
            id: blk.id,
            section_id: blk.section_id,
            room_id: bestBlkAlt.room.id,
            timeslot_id: bestBlkAlt.timeslot.id,
            day_of_week: bestBlkAlt.day,
            parallel_index: blk.parallel_index,
            score: bestBlkAlt.score,
          };

          // Commit 1-hop swap!
          activeAssignments = [...assignmentsWithSec, newBlkAsgn];
          relocations.push({
            movedSectionId: blkSec.id,
            movedSectionNrc: blkSec.nrc,
            movedSubjectName: blkSec.subject_name,
            fromSlot: { day_of_week: blk.day_of_week, timeslot_id: blk.timeslot_id, room_id: blk.room_id },
            toSlot: { day_of_week: bestBlkAlt.day, timeslot_id: bestBlkAlt.timeslot.id, room_id: bestBlkAlt.room.id },
            freedForSectionId: sec.id,
            freedForSectionNrc: sec.nrc,
            freedForSubjectName: sec.subject_name,
            reason: `Reubicación automática (1-hop swap) para destrabar sección crítica ${sec.subject_name} (NRC ${sec.nrc})`,
          });
          deadlocksResolved++;
          resolved = true;
          break;
        }

        // 2-Hop Relocation check (Depth = 2)
        if (maxBacktrackDepth >= 2 && relocations.length + 2 <= maxRelocations) {
          // For blkSec, check if it is blocked by a second assignment `blk2` that has a free alternative
          const blkNearMisses = nearMisses.filter(m => m.blockingAssignment.id !== blk.id);
          for (const miss2 of blkNearMisses.slice(0, 5)) {
            const blk2 = miss2.blockingAssignment;
            const blk2Sec = sectionsMap.get(blk2.section_id);
            if (!blk2Sec || lockedIds.has(blk2.id)) continue;

            const tempWithoutBoth = assignmentsWithSec.filter(a => a.id !== blk2.id);
            const blk2Alternatives = findValidSlotsForSection(blk2Sec, tempWithoutBoth);
            if (blk2Alternatives.length > 0) {
              const bestBlk2Alt = blk2Alternatives[0];
              const tentativeBlk2: SolverAssignment = {
                id: blk2.id,
                section_id: blk2.section_id,
                room_id: bestBlk2Alt.room.id,
                timeslot_id: bestBlk2Alt.timeslot.id,
                day_of_week: bestBlk2Alt.day,
                parallel_index: blk2.parallel_index,
              };

              const withBlk2 = [...tempWithoutBoth, tentativeBlk2];
              const blkAltCheck = findValidSlotsForSection(blkSec, withBlk2);
              if (blkAltCheck.length > 0) {
                const bestBlkAlt = blkAltCheck[0];
                const newBlkAsgn: SolverAssignment = {
                  id: blk.id,
                  section_id: blk.section_id,
                  room_id: bestBlkAlt.room.id,
                  timeslot_id: bestBlkAlt.timeslot.id,
                  day_of_week: bestBlkAlt.day,
                  parallel_index: blk.parallel_index,
                };

                activeAssignments = [...withBlk2, newBlkAsgn];
                relocations.push(
                  {
                    movedSectionId: blk2Sec.id,
                    movedSectionNrc: blk2Sec.nrc,
                    movedSubjectName: blk2Sec.subject_name,
                    fromSlot: { day_of_week: blk2.day_of_week, timeslot_id: blk2.timeslot_id, room_id: blk2.room_id },
                    toSlot: { day_of_week: bestBlk2Alt.day, timeslot_id: bestBlk2Alt.timeslot.id, room_id: bestBlk2Alt.room.id },
                    freedForSectionId: blkSec.id,
                    freedForSectionNrc: blkSec.nrc,
                    freedForSubjectName: blkSec.subject_name,
                    reason: `Reubicación secundaria (2-hop swap) en cadena`,
                  },
                  {
                    movedSectionId: blkSec.id,
                    movedSectionNrc: blkSec.nrc,
                    movedSubjectName: blkSec.subject_name,
                    fromSlot: { day_of_week: blk.day_of_week, timeslot_id: blk.timeslot_id, room_id: blk.room_id },
                    toSlot: { day_of_week: bestBlkAlt.day, timeslot_id: bestBlkAlt.timeslot.id, room_id: bestBlkAlt.room.id },
                    freedForSectionId: sec.id,
                    freedForSectionNrc: sec.nrc,
                    freedForSubjectName: sec.subject_name,
                    reason: `Reubicación primaria para dar cabida a ${sec.subject_name}`,
                  },
                );
                deadlocksResolved += 2;
                resolved = true;
                break;
              }
            }
          }
          if (resolved) break;
        }
      }
    }

    // If still unresolved, record diagnostic for the coordinator
    if (!resolved) {
      let bottleneck = 'Restricción de infraestructura o agenda no resoluble';
      let action = 'Verificar disponibilidad docente y capacidad de salas';

      // Diagnose primary reason
      const compatibleRooms = rooms.filter(r => isRoomTypeCompatible(sec.type, r.type));
      if (compatibleRooms.length === 0) {
        bottleneck = `No existen salas de tipo ${sec.type} en el sistema`;
        action = `Crear o habilitar una sala tipo ${sec.type}`;
      } else if (sec.teacher_id && blockedTeacherSlots.size > 0) {
        const teacherBlocks = Array.from(blockedTeacherSlots).filter(k => k.startsWith(`${sec.teacher_id}|`)).length;
        if (teacherBlocks >= 20) {
          bottleneck = `Docente ${sec.teacher_name || ''} tiene más de ${teacherBlocks} bloques bloqueados`;
          action = 'Solicitar mayor disponibilidad horaria al docente';
        } else {
          bottleneck = `Topes simultáneos de salas ${sec.type} y nivel curricular`;
          action = 'Habilitar salas adicionales o flexibilizar horarios de nivel';
        }
      }

      const existingDiag = unassigned.find(u => u.section_id === sec.id);
      if (existingDiag) {
        existingDiag.unassignedHours++;
      } else {
        unassigned.push({
          section_id: sec.id,
          nrc: sec.nrc,
          subject_name: sec.subject_name,
          unassignedHours: 1,
          primaryBottleneck: bottleneck,
          suggestedAction: action,
        });
      }
    }
  }

  const totalSlotsAssigned = activeAssignments.length;
  const coveragePercentage = totalSlotsRequired > 0
    ? Math.min(100, Math.round((totalSlotsAssigned / totalSlotsRequired) * 100))
    : 100;

  return {
    assignments: activeAssignments,
    relocations,
    unassigned,
    totalSlotsRequired,
    totalSlotsAssigned,
    coveragePercentage,
    deadlocksResolved,
    executionTimeMs: Date.now() - startTime,
  };
};
