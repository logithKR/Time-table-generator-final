/**
 * excel_export.js
 * 
 * Port of Python's utils/excel_export.py using ExcelJS for full cell styling.
 * Produces a timetable grid with the exact same formatting as the original:
 *   - Header row with period numbers + time ranges
 *   - Day rows with abbreviated day names
 *   - Cells with course_code, course_name, faculty_name, venue_name
 *   - Lab cells highlighted yellow, empty cells grey, normal cells white
 *   - Thin borders, centered alignment, bold headers, wrap text
 */

const ExcelJS = require('exceljs');

/**
 * Generate a formatted timetable Excel buffer.
 * @param {object} db - better-sqlite3 database instance
 * @param {string} department_code
 * @param {number|string} semester
 * @returns {Promise<Buffer>} xlsx buffer ready to send
 */
async function generateTimetableExcelBytes(db, department_code, semester) {
    // Fetch slot master for time ranges
    let slots = [];
    try {
        slots = db.prepare("SELECT * FROM slot_master ORDER BY day_of_week, period_number").all();
    } catch (e) { /* slot_master may not exist */ }

    const daysOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let activeDays = daysOrder.filter(d => slots.some(s => s.day_of_week === d));
    if (!activeDays.length) activeDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

    const maxPeriod = slots.length > 0 ? Math.max(...slots.map(s => s.period_number)) : 8;
    const periods = Array.from({ length: maxPeriod }, (_, i) => i + 1);

    // Fetch timetable entries
    const entries = db.prepare(
        "SELECT * FROM timetable_entries WHERE department_code = ? AND semester = ? ORDER BY day_of_week, period_number"
    ).all(department_code, parseInt(semester));

    // Build lookup dict: (day, period) -> [entries]
    const timetableDict = {};
    for (const e of entries) {
        const key = `${e.day_of_week}|${e.period_number}`;
        if (!timetableDict[key]) timetableDict[key] = [];
        timetableDict[key].push(e);
    }

    // --- Create workbook ---
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Timetable ${department_code || 'All'} Sem ${semester || 'All'}`);

    // --- Styles (matching Python openpyxl originals) ---
    const thinBorder = { style: 'thin', color: { argb: 'FFD1D5DB' } };
    const borderAll = {
        top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder
    };
    const fillHeader = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    const fillDay = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    const fillLab = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
    const fillClass = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    const fillEmpty = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

    const fontBold = { bold: true, color: { argb: 'FF1F2937' }, size: 11 };
    const fontHeaderPeriod = { bold: true, color: { argb: 'FF374151' }, size: 10 };
    const fontCell = { bold: false, color: { argb: 'FF111827' }, size: 10 };
    const fontEmpty = { italic: true, color: { argb: 'FF9CA3AF' }, size: 10 };
    const fontDay = { bold: true, color: { argb: 'FF1F2937' }, size: 12 };

    const alignCenter = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // Column A width
    ws.getColumn(1).width = 16;

    // --- Header Row (row 2) ---
    const headerRow = 2;

    // DAY / PERIOD cell
    const dayPeriodCell = ws.getCell(headerRow, 1);
    dayPeriodCell.value = 'DAY / PERIOD';
    dayPeriodCell.font = fontBold;
    dayPeriodCell.alignment = alignCenter;
    dayPeriodCell.fill = fillDay;
    dayPeriodCell.border = borderAll;

    // Period headers
    for (let i = 0; i < periods.length; i++) {
        const p = periods[i];
        const col = i + 2;

        // Find time range from Monday slot
        const slot = slots.find(s => s.period_number === p && s.day_of_week === 'Monday');
        const timeStr = slot ? `${slot.start_time} - ${slot.end_time}` : '';
        const headerText = `Period ${p}\n(${timeStr})`;

        const cell = ws.getCell(headerRow, col);
        cell.value = headerText;
        cell.font = fontHeaderPeriod;
        cell.alignment = alignCenter;
        cell.fill = fillHeader;
        cell.border = borderAll;

        ws.getColumn(col).width = 24;
    }

    // --- Data Rows ---
    let currentRow = headerRow + 1;
    for (const day of activeDays) {
        // Day label cell
        const dayCell = ws.getCell(currentRow, 1);
        dayCell.value = day.substring(0, 3).toUpperCase();
        dayCell.font = fontDay;
        dayCell.alignment = alignCenter;
        dayCell.fill = fillDay;
        dayCell.border = borderAll;

        ws.getRow(currentRow).height = 85;

        // Period cells
        for (let i = 0; i < periods.length; i++) {
            const p = periods[i];
            const col = i + 2;
            const key = `${day}|${p}`;
            const cellEntries = timetableDict[key] || [];

            const cell = ws.getCell(currentRow, col);

            if (cellEntries.length === 0) {
                cell.value = 'Empty Slot';
                cell.fill = fillEmpty;
                cell.font = fontEmpty;
            } else {
                const isLab = cellEntries.some(e => e.session_type && e.session_type.toUpperCase() === 'LAB');
                const lines = cellEntries.map(e => {
                    return `${e.course_code}\n${e.course_name || ''}\n(${e.faculty_name || 'Unassigned'})\n[${e.venue_name || ''}]`;
                });
                cell.value = lines.join('\n---\n');
                cell.fill = isLab ? fillLab : fillClass;
                cell.font = fontCell;
            }

            cell.alignment = alignCenter;
            cell.border = borderAll;
        }

        currentRow++;
    }

    // Generate buffer
    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
}

module.exports = { generateTimetableExcelBytes };
