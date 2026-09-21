/**
 * constraint_interpreter.js
 * Translates user-defined JSON constraint rules into CP-SAT model constraints
 * and post-solve timetable entries.
 */
class ConstraintInterpreter {
    constructor(db, departmentCode, semester) {
        this.db = db;
        this.departmentCode = departmentCode;
        this.semester = semester;
        this.constraints = [];
        this.warnings = [];
        this.reservedSlots = {}; // uuid -> [{day, period}]
    }

    // ─── Loading ────────────────────────────────────────────

    loadConstraints() {
        // Fetch enabled constraints ordered by priority desc, order_index asc
        const rows = this.db.prepare(`
            SELECT * FROM user_constraints 
            WHERE enabled = 1 
            ORDER BY priority DESC, order_index ASC
        `).all();

        for (const row of rows) {
            const constraint = {
                uuid: row.uuid,
                name: row.name,
                priority: row.priority,
                soft_weight: row.soft_weight,
                constraint_type: row.constraint_type,
                scope: JSON.parse(row.scope_json || '{}'),
                target: JSON.parse(row.target_json || '{}'),
                rules: JSON.parse(row.rules_json || '{}')
            };

            if (this._matchesScope(constraint.scope)) {
                this.constraints.push(constraint);
            }
        }
        console.log(`  📋 ConstraintInterpreter: loaded ${this.constraints.length} user constraints for ${this.departmentCode} Sem ${this.semester}`);
    }

    _matchesScope(scope) {
        const depts = scope.departments || ["*"];
        const sems = scope.semesters || ["*"];

        const deptMatch = depts.includes("*") || depts.includes(this.departmentCode);
        const semMatch = sems.includes("*") || sems.includes(this.semester);

        return deptMatch && semMatch;
    }

    // ─── Validation ─────────────────────────────────────────

    validateConstraints(courses, slots, allDays, dayPeriods, slotLookup) {
        const warnings = [];

        for (const c of this.constraints) {
            const ct = c.constraint_type;
            const rules = c.rules;

            if (ct === "COURSE_INJECTION") {
                const sessions = rules.sessions_per_week || {};
                const exact = sessions.exact || sessions.max || 0;
                const visualSlots = rules.visual_slots || [];

                for (const vs of visualSlots) {
                    const key = `${vs.day}_${vs.period}`;
                    if (!slotLookup[key]) {
                        warnings.push(`⚠️ [${c.name}] Visual slot ${vs.day} P${vs.period} does not exist in the slot master`);
                    }
                }

                if (exact > 0 && visualSlots.length > 0) {
                    if (visualSlots.length < exact) {
                        warnings.push(`⚠️ [${c.name}] Needs ${exact} sessions but only ${visualSlots.length} visual slots selected`);
                    }
                }
            } else if (ct === "SLOT_BLOCKING") {
                const visualSlots = rules.visual_slots || [];
                if (visualSlots.length === 0) {
                    warnings.push(`⚠️ [${c.name}] Slot blocking constraint has no slots specified`);
                }
            }
        }
        this.warnings = warnings;
        return warnings;
    }

    // ─── Apply to CP-SAT Model ──────────────────────────────

    applyToModel(model, theoryVars, labVars, mergedLabVars, coreSlotFills, objectiveTerms, allDays, dayPeriods, slotLookup, filledSlots) {
        for (const c of this.constraints) {
            const ct = c.constraint_type;
            try {
                if (ct === "SLOT_BLOCKING") {
                    this._applySlotBlocking(c, model, theoryVars, labVars, mergedLabVars, allDays, dayPeriods, slotLookup);
                } else if (ct === "COURSE_INJECTION") {
                    this._reserveInjectionSlots(c, model, theoryVars, labVars, mergedLabVars, allDays, dayPeriods, slotLookup);
                }
            } catch (e) {
                this.warnings.push(`❌ [${c.name}] Failed to apply to model: ${e.message}`);
            }
        }
    }

    _applySlotBlocking(constraint, model, theoryVars, labVars, mergedLabVars, allDays, dayPeriods, slotLookup) {
        const rules = constraint.rules;
        const visualSlots = rules.visual_slots || [];
        const name = constraint.name;

        let blockedCount = 0;
        for (const vs of visualSlots) {
            const day = vs.day;
            const period = vs.period;

            if (!slotLookup[`${day}_${period}`]) continue;

            // Zero out theory vars
            for (const [key, variable] of Object.entries(theoryVars)) {
                const parts = key.split('_'); // [courseCode, day, period]
                if (parts[1] === day && parseInt(parts[2]) === period) {
                    model.add(variable.equal(0));
                }
            }

            // Zero out lab vars
            for (const [key, variable] of Object.entries(labVars)) {
                const parts = key.split('_'); // [courseCode, day, bs]
                if (parts[1] === day) {
                    const bs = parseInt(parts[2]);
                    if (bs === period || bs + 1 === period) {
                        model.add(variable.equal(0));
                    }
                }
            }

            // Zero out merged lab vars
            for (const [key, variable] of Object.entries(mergedLabVars)) {
                const parts = key.split('_'); // [day, bs]
                if (parts[0] === day) {
                    const bs = parseInt(parts[1]);
                    if (bs === period || bs + 1 === period) {
                        model.add(variable.equal(0));
                    }
                }
            }
            blockedCount++;
        }
        if (blockedCount > 0) {
            console.log(`    🚫 [${name}] Blocked ${blockedCount} slots from scheduling`);
        }
    }

    _reserveInjectionSlots(constraint, model, theoryVars, labVars, mergedLabVars, allDays, dayPeriods, slotLookup) {
        const rules = constraint.rules;
        const name = constraint.name;
        const sessions = rules.sessions_per_week || {};
        const exact = sessions.exact || sessions.max || 1;
        const periodStructure = rules.period_structure || "SINGLE";

        const visualSlots = rules.visual_slots || [];
        let candidates = [];
        
        if (visualSlots.length > 0) {
            const pinned = visualSlots
                .filter(vs => slotLookup[`${vs.day}_${vs.period}`])
                .map(vs => ({day: vs.day, period: vs.period}));
            const auto = this._buildCandidateSlots(rules, allDays, dayPeriods, slotLookup);
            const seen = new Set(pinned.map(p => `${p.day}_${p.period}`));
            candidates = [...pinned];
            for (const ac of auto) {
                const key = `${ac.day}_${ac.period}`;
                if (!seen.has(key)) {
                    candidates.push(ac);
                    seen.add(key);
                }
            }
        } else {
            candidates = this._buildCandidateSlots(rules, allDays, dayPeriods, slotLookup);
        }

        const spacing = rules.spacing || {};
        const selected = this._selectInjectionSlots(
            candidates, exact, periodStructure,
            spacing.min_days_apart || 0,
            spacing.no_same_time_different_days || false,
            allDays, slotLookup
        );

        if (selected.length < exact) {
            this.warnings.push(`⚠️ [${name}] Needs ${exact} sessions but could only reserve ${selected.length} slots`);
        }

        this.reservedSlots[constraint.uuid] = selected;

        let blocked = 0;
        for (const sel of selected) {
            const day = sel.day;
            const period = sel.period;

            for (const [key, variable] of Object.entries(theoryVars)) {
                const parts = key.split('_');
                if (parts[1] === day && parseInt(parts[2]) === period) {
                    model.add(variable.equal(0));
                }
            }
            for (const [key, variable] of Object.entries(labVars)) {
                const parts = key.split('_');
                if (parts[1] === day) {
                    const bs = parseInt(parts[2]);
                    if (bs === period || bs + 1 === period) {
                        model.add(variable.equal(0));
                    }
                }
            }
            for (const [key, variable] of Object.entries(mergedLabVars)) {
                const parts = key.split('_');
                if (parts[0] === day) {
                    const bs = parseInt(parts[1]);
                    if (bs === period || bs + 1 === period) {
                        model.add(variable.equal(0));
                    }
                }
            }

            if (periodStructure === "CONSECUTIVE_2") {
                const np = period + 1;
                for (const [key, variable] of Object.entries(theoryVars)) {
                    const parts = key.split('_');
                    if (parts[1] === day && parseInt(parts[2]) === np) {
                        model.add(variable.equal(0));
                    }
                }
            }
            blocked++;
        }
        if (blocked > 0) {
            console.log(`    📌 [${name}] Reserved ${blocked} slots`);
        }
    }

    // ─── Post-Solve Application ──────────────────────────────

    applyPostSolve(departmentCode, semester, filledSlots, slotLookup, assignVenueFn, count, allDays, dayPeriods) {
        for (const c of this.constraints) {
            const ct = c.constraint_type;
            try {
                if (ct === "COURSE_INJECTION") {
                    count = this._applyCourseInjection(c, departmentCode, semester, filledSlots, slotLookup, assignVenueFn, count, allDays, dayPeriods);
                } else if (ct === "SLOT_BLOCKING") {
                    count = this._applySlotBlockingLabels(c, departmentCode, semester, filledSlots, slotLookup, count);
                }
            } catch (e) {
                this.warnings.push(`❌ [${c.name}] Post-solve error: ${e.message}`);
            }
        }
        return count;
    }

    _applyCourseInjection(constraint, departmentCode, semester, filledSlots, slotLookup, assignVenueFn, count, allDays, dayPeriods) {
        const rules = constraint.rules;
        const target = constraint.target;
        const name = constraint.name;

        const courseCode = target.course_code || "INJECTED";
        const courseName = target.course_name || name;
        const facultyId = target.faculty_id || null;
        const facultyName = target.faculty_name || null;
        const periodStructure = rules.period_structure || "SINGLE";

        const selected = this.reservedSlots[constraint.uuid] || [];

        if (selected.length === 0) {
            const sessions = rules.sessions_per_week || {};
            const exact = sessions.exact || sessions.max || 1;
            this.warnings.push(`⚠️ [${name}] No reserved slots available for injection (${exact} sessions needed)`);
            return count;
        }

        for (const sel of selected) {
            const day = sel.day;
            const period = sel.period;
            const slotObj = slotLookup[`${day}_${period}`];
            if (!slotObj) continue;

            const sessionType = rules.session_type || "THEORY";
            let venue = null;
            try {
                venue = assignVenueFn(day, period, courseCode, false, count);
            } catch (e) {
                venue = null;
            }

            this.db.prepare(`
                INSERT INTO timetable_entries 
                (department_code, semester, course_code, course_name, faculty_id, faculty_name, session_type, slot_id, day_of_week, period_number, venue_name, section_number, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(departmentCode, semester, courseCode, courseName, facultyId, facultyName, sessionType, slotObj.slot_id, day, period, venue, 1);
            
            filledSlots.add(`${day}_${period}`);
            count++;

            if (periodStructure === "CONSECUTIVE_2") {
                const nextP = period + 1;
                const nextSlot = slotLookup[`${day}_${nextP}`];
                if (nextSlot) {
                    this.db.prepare(`
                        INSERT INTO timetable_entries 
                        (department_code, semester, course_code, course_name, faculty_id, faculty_name, session_type, slot_id, day_of_week, period_number, venue_name, section_number, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    `).run(departmentCode, semester, courseCode, courseName, facultyId, facultyName, sessionType, nextSlot.slot_id, day, nextP, venue, 1);
                    filledSlots.add(`${day}_${nextP}`);
                    count++;
                }
            }
        }
        if (selected.length > 0) {
            console.log(`    ✅ [${name}] Injected ${courseCode} into ${selected.length} slots`);
        }
        return count;
    }

    _applySlotBlockingLabels(constraint, departmentCode, semester, filledSlots, slotLookup, count) {
        const rules = constraint.rules;
        const visualSlots = rules.visual_slots || [];
        const blockLabel = rules.block_label || constraint.name;
        const sessionType = rules.session_type || "BLOCKED";

        for (const vs of visualSlots) {
            const day = vs.day;
            const period = vs.period;
            const slotObj = slotLookup[`${day}_${period}`];
            if (!slotObj) continue;

            if (!filledSlots.has(`${day}_${period}`)) {
                this.db.prepare(`
                    INSERT INTO timetable_entries 
                    (department_code, semester, course_code, course_name, faculty_id, faculty_name, session_type, slot_id, day_of_week, period_number, venue_name, section_number, created_at)
                    VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, NULL, 1, CURRENT_TIMESTAMP)
                `).run(departmentCode, semester, "BLOCKED", blockLabel, sessionType, slotObj.slot_id, day, period);
                filledSlots.add(`${day}_${period}`);
                count++;
            }
        }
        return count;
    }

    // ─── Helper Methods ──────────────────────────────────────

    _buildCandidateSlots(rules, allDays, dayPeriods, slotLookup) {
        const dayPref = rules.day_preference || {};
        const slotPref = rules.slot_preference || {};

        let days = allDays;
        const dayMode = dayPref.mode || "ANY";
        if (dayMode === "SPECIFIC" || dayMode === "ALTERNATING") {
            const allowed = dayPref.days || (dayMode === "SPECIFIC" ? allDays : []);
            if (allowed.length > 0) days = allowed.filter(d => allDays.includes(d));
        } else if (dayMode === "EXCLUDE") {
            const exclude = new Set(dayPref.days || []);
            days = allDays.filter(d => !exclude.has(d));
        }

        let allowedPeriods = null;
        const slotMode = slotPref.mode || "ANY";
        if (slotMode === "SPECIFIC") {
            allowedPeriods = new Set(slotPref.periods || []);
        } else if (slotMode === "RANGE") {
            const start = slotPref.range_start || 1;
            const end = slotPref.range_end || 8;
            allowedPeriods = new Set();
            for (let p = start; p <= end; p++) allowedPeriods.add(p);
        } else if (slotMode === "EXCLUDE") {
            const excludePeriods = new Set(slotPref.exclude_periods || []);
            allowedPeriods = new Set();
            for (const d of days) {
                const per = dayPeriods[d] || [];
                for (const p of per) {
                    if (!excludePeriods.has(p)) allowedPeriods.add(p);
                }
            }
        }

        const candidates = [];
        for (const d of days) {
            const per = (dayPeriods[d] || []).sort((a,b)=>a-b);
            for (const p of per) {
                if (allowedPeriods && !allowedPeriods.has(p)) continue;
                if (slotLookup[`${d}_${p}`]) {
                    candidates.push({day: d, period: p});
                }
            }
        }

        const placement = rules.placement || {};
        const prefer = placement.prefer_position || "NONE";
        if (prefer === "EARLY") {
            candidates.sort((a, b) => a.period - b.period);
        } else if (prefer === "LATE") {
            candidates.sort((a, b) => b.period - a.period);
        }

        return candidates;
    }

    _selectInjectionSlots(candidates, needed, periodStructure, minDaysApart, noSameTime, allDays, slotLookup) {
        if (candidates.length === 0 || needed <= 0) return [];

        const dayOrder = {};
        allDays.forEach((d, i) => dayOrder[d] = i);
        
        const selected = [];
        const usedDays = new Set();
        const usedPeriods = new Set();

        for (const c of candidates) {
            if (selected.length >= needed) break;

            if (periodStructure === "CONSECUTIVE_2") {
                if (!slotLookup[`${c.day}_${c.period + 1}`]) continue;
            }

            if (minDaysApart > 0 && dayOrder[c.day] !== undefined) {
                let tooClose = false;
                for (const sel of selected) {
                    if (dayOrder[sel.day] !== undefined) {
                        const gap = Math.abs(dayOrder[c.day] - dayOrder[sel.day]);
                        if (gap < minDaysApart) {
                            tooClose = true;
                            break;
                        }
                    }
                }
                if (tooClose) continue;
            }

            if (noSameTime && usedPeriods.has(c.period)) {
                if (!usedDays.has(c.day)) continue;
            }

            selected.push(c);
            usedDays.add(c.day);
            usedPeriods.add(c.period);
        }
        return selected;
    }
}

module.exports = { ConstraintInterpreter };
