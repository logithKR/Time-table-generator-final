/**
 * conflict_detector.js
 * Scans the timetable_entries table for genuine conflicts.
 */

function detectConflicts(db, targetDepartment = null, targetSemester = null) {
    const allEntries = db.prepare("SELECT * FROM timetable_entries").all();

    const facultySlots = {};
    const venueSlots = {};

    for (const entry of allEntries) {
        if (entry.faculty_id && !['NONE', 'UNASSIGNED', ''].includes(entry.faculty_id.trim().toUpperCase())) {
            const keyFac = `${entry.day_of_week}_${entry.period_number}_${entry.faculty_id}`;
            if (!facultySlots[keyFac]) facultySlots[keyFac] = [];
            facultySlots[keyFac].push(entry);
        }

        if (entry.venue_name && !['NONE', 'UNASSIGNED', ''].includes(entry.venue_name.trim().toUpperCase()) && entry.section_number !== 2) {
            const keyVen = `${entry.day_of_week}_${entry.period_number}_${entry.venue_name}`;
            if (!venueSlots[keyVen]) venueSlots[keyVen] = [];
            venueSlots[keyVen].push(entry);
        }
    }

    const facultyConflicts = [];
    const venueConflicts = [];

    // Process Faculty Conflicts
    for (const [key, entries] of Object.entries(facultySlots)) {
        if (entries.length > 1) {
            if (targetDepartment && !entries.some(e => e.department_code === targetDepartment)) continue;
            if (targetSemester && !entries.some(e => e.semester === targetSemester)) continue;

            const uniqueClasses = new Set(entries.map(e => `${e.course_code}_${e.section_number}`));
            if (uniqueClasses.size > 1) {
                facultyConflicts.push({
                    faculty_id: entries[0].faculty_id,
                    faculty_name: entries[0].faculty_name,
                    day: entries[0].day_of_week,
                    period: entries[0].period_number,
                    courses: entries.map(e => ({
                        dept: e.department_code,
                        sem: e.semester,
                        course: `${e.course_code} (S${e.section_number})`
                    })),
                    suggestion: `Faculty ${entries[0].faculty_name} is scheduled in ${uniqueClasses.size} different classes on ${entries[0].day_of_week} P${entries[0].period_number}. Reassign one course.`
                });
            }
        }
    }

    // Process Venue Conflicts
    for (const [key, entries] of Object.entries(venueSlots)) {
        if (entries.length > 1) {
            if (targetDepartment && !entries.some(e => e.department_code === targetDepartment)) continue;
            if (targetSemester && !entries.some(e => e.semester === targetSemester)) continue;

            const uniqueClasses = new Set(entries.map(e => `${e.course_code}_${e.section_number}`));
            if (uniqueClasses.size > 1) {
                venueConflicts.push({
                    venue_name: entries[0].venue_name,
                    day: entries[0].day_of_week,
                    period: entries[0].period_number,
                    courses: entries.map(e => ({
                        dept: e.department_code,
                        sem: e.semester,
                        course: `${e.course_code} (S${e.section_number})`
                    })),
                    suggestion: `Venue ${entries[0].venue_name} is booked for ${uniqueClasses.size} different classes on ${entries[0].day_of_week} P${entries[0].period_number}. Change venue for one course.`
                });
            }
        }
    }

    return {
        faculty_conflicts: facultyConflicts,
        venue_conflicts: venueConflicts
    };
}

module.exports = { detectConflicts };
