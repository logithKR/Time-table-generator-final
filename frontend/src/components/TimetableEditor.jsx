import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DndContext, useDroppable, useDraggable, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, pointerWithin } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import * as api from '../utils/api';
import { Search, Save, Trash2, Download, Undo2, Coffee, X, BookOpen, FlaskConical, Users2, LayoutTemplate, Palette, ArrowLeftRight, Plus, ChevronDown, Pencil, Type, AlertTriangle, Eye, Merge, AlertCircle, CheckCircle } from 'lucide-react';
import LearningModeSelector from './LearningModeSelector';

// ─── Simplified Color Palette (Preserved) ───
const THEORY_STYLE = {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-900',
    chip: 'bg-blue-50/80 text-blue-900 border-blue-200 hover:bg-blue-100'
};

const LAB_STYLE = {
    bg: 'bg-amber-50',
    border: 'border-amber-400',
    text: 'text-amber-900',
    chip: 'bg-amber-50/80 text-amber-900 border-amber-300 ring-1 ring-amber-400/20 hover:bg-amber-100'
};

const MENTOR_STYLE = { bg: 'bg-violet-50', border: 'border-violet-300', text: 'text-violet-900' };
const OE_STYLE = { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-700' };

// ─── Elegant Legend Component ───
const Legend = () => (
    <div className="flex flex-wrap justify-center gap-6 items-center bg-white px-8 py-3 mt-6 border border-violet-100 rounded-full shadow-sm w-fit mx-auto select-none transition-all hover:shadow-md hover:border-violet-200">
        <div className="flex items-center gap-2">
            <div className={`w-3.5 h-3.5 rounded-full ${THEORY_STYLE.bg} border ${THEORY_STYLE.border}`}></div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Theory</span>
        </div>
        <div className="flex items-center gap-2">
            <div className={`w-3.5 h-3.5 rounded-full ${LAB_STYLE.bg} border ${LAB_STYLE.border} flex items-center justify-center`}>
                <div className="w-1 h-1 bg-amber-400 rounded-full"></div>
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lab</span>
        </div>
        <div className="flex items-center gap-2">
            <div className={`w-3.5 h-3.5 rounded-full ${MENTOR_STYLE.bg} border ${MENTOR_STYLE.border}`}></div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mentor</span>
        </div>
        <div className="flex items-center gap-2">
            <div className={`w-3.5 h-3.5 rounded-full ${OE_STYLE.bg} border ${OE_STYLE.border}`}></div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Elective</span>
        </div>
        <div className="flex items-center gap-2 border-l pl-6 border-gray-200 ml-2">
            <div className="w-3.5 h-3.5 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center">
                <Coffee className="w-2 h-2 text-gray-400" />
            </div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Break</span>
        </div>
    </div>
);

// ─── Draggable Course Chip (Palette) ───
const CourseChip = ({ course, colorStyle, facultyName, venueName }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `palette-${course.course_code}`,
        data: { type: 'new', course, facultyName, venueName }
    });
    const style = transform ? { transform: CSS.Translate.toString(transform), zIndex: 1000 } : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}
            className={`flex-shrink-0 px-3 py-2.5 rounded-xl border cursor-grab active:cursor-grabbing transition-all hover:shadow-lg hover:shadow-purple-100/50 ${isDragging ? 'opacity-40 scale-95 shadow-xl' : 'hover:-translate-y-0.5'} ${colorStyle.chip}`}>
            <div className="flex items-center gap-1.5 mb-0.5">
                {course.is_lab ? <FlaskConical className="w-3.5 h-3.5 text-amber-700/80" /> : <BookOpen className="w-3.5 h-3.5 opacity-50" />}
                <span className="font-bold text-xs whitespace-nowrap tracking-tight">{course.course_code}</span>
            </div>
            <div className="text-[10px] opacity-70 truncate max-w-[140px] leading-tight font-medium tracking-wide">{course.course_name}</div>

            {venueName && (
                <div className="text-[8.5px] font-bold mt-1 text-indigo-700 bg-indigo-50/50 px-1 py-0.5 rounded border border-indigo-200 w-fit truncate max-w-full">
                    {venueName}
                </div>
            )}

            {course.is_lab && <span className="text-[9px] font-bold opacity-60 block mt-1 tracking-wider uppercase text-amber-800">2 Periods</span>}
        </div>
    );
};

// ─── Draggable Grid Cell Content (Dashboard-style layout) ───
const CellContent = ({ entry, sections, cellId, isLabStart, isSwapMode, isSelected, onClick, showCourseCode = true, showFaculty = true, showVenues = true, showLabels = true, allCourses = [] }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: cellId,
        data: { type: 'placed', entry },
        disabled: isSwapMode
    });
    const style = transform ? { transform: CSS.Translate.toString(transform), zIndex: 999 } : undefined;

    if (isDragging) return <div ref={setNodeRef} style={style} className="w-full h-full rounded-xl bg-purple-50/50 border-2 border-dashed border-purple-300 opacity-60 backdrop-blur-sm" />;

    let bg, border, text;
    if (entry.session_type === 'MENTOR') {
        bg = MENTOR_STYLE.bg; border = MENTOR_STYLE.border; text = MENTOR_STYLE.text;
    }
    else if (entry.session_type === 'HONOURS') {
        bg = 'bg-purple-50'; border = 'border-purple-300'; text = 'text-purple-800';
    }
    else if (entry.session_type === 'MINOR') {
        bg = 'bg-indigo-50'; border = 'border-indigo-300'; text = 'text-indigo-800';
    }
    else if (entry.session_type === 'OPEN_ELECTIVE' || entry.course_code === 'OPEN_ELEC') {
        bg = OE_STYLE.bg; border = OE_STYLE.border; text = OE_STYLE.text;
    }
    else if (entry.session_type === 'LAB') {
        bg = LAB_STYLE.bg; border = LAB_STYLE.border; text = LAB_STYLE.text;
    } else {
        bg = THEORY_STYLE.bg; border = THEORY_STYLE.border; text = THEORY_STYLE.text;
    }

    const isMentor = entry.session_type === 'MENTOR';
    const isOE = entry.session_type === 'OPEN_ELECTIVE' || entry.course_code === 'OPEN_ELEC';
    const allSections = sections && sections.length > 0 ? sections : [entry];

    // Helper: check if a faculty name is a real displayable name
    const isValidFaculty = (name) => {
        if (!name || name.trim() === '') return false;
        const lower = name.trim().toLowerCase();
        if (lower === 'unassigned') return false;
        if (lower.includes('select')) return false;
        return true;
    };

    // Separate regular courses from explicit OE slots
    const explicitOEEntries = allSections.filter(e => e.session_type === 'OPEN_ELECTIVE' || e.course_code === 'OPEN_ELEC' || allCourses.find(c => c.course_code === e.course_code)?.is_open_elective);
    const regularEntries = allSections.filter(e => !explicitOEEntries.includes(e));

    const regularCodes = [...new Set(regularEntries.map(e => e.course_code))];
    const explicitOECodes = [...new Set(explicitOEEntries.map(e => e.course_code))];

    // Check if any regular course has 'OPEN ELECTIVE' in its name
    const hasImplicitOE = regularEntries.some(e => e.course_name && e.course_name.toLowerCase().includes('open elective'));
    const shouldShowOEPlaceholder = hasImplicitOE && explicitOECodes.length === 0;

    // Clean OE text from regular course names
    const cleanName = (name) => {
        if (!name) return '';
        return name.replace(/\s*\/\s*OPEN\s*ELECTIVE\s*/gi, '').trim();
    };

    const renderCourseBlock = (code, idx, isOEBlock, groupEntries) => {
        const groupName = cleanName(groupEntries[0]?.course_name || '');

        return (
            <div key={`${code}-${idx}`} className={`flex flex-col justify-center py-0.5 flex-grow ${idx > 0 || isOEBlock && regularCodes.length > 0 ? 'border-t border-current/15 mt-1 pt-1' : ''}`}>
                {/* Course code + icon */}
                {showCourseCode && (
                    <div className="flex justify-center items-center gap-1">
                        <span className={`font-bold text-[11px] tracking-tight leading-tight ${isOEBlock ? 'text-teal-800' : ''}`}>{code}</span>
                        {!isOEBlock && entry.session_type === 'LAB' && isLabStart && idx === 0 && (
                            <FlaskConical className="w-3 h-3 opacity-40 shrink-0 fill-current" />
                        )}
                        {isOEBlock && (
                            <span className="text-[8px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-semibold border border-teal-200 uppercase tracking-wider ml-1">Open Elec</span>
                        )}
                    </div>
                )}

                {/* Course name */}
                {showLabels && (
                    <div className={`text-[9.5px] font-semibold leading-tight text-center px-0.5 my-0.5 opacity-80 ${isOEBlock ? 'text-teal-700' : ''}`}>
                        {groupName || (isOEBlock ? 'OPEN ELECTIVE' : '')}
                    </div>
                )}

                {/* Faculty & Venue inline — with session-type distinction for mixed blocks */}
                {(showFaculty || showVenues) && groupEntries.length > 1 ? (
                    <div className="flex flex-col gap-0.5 border-t border-current/10 pt-0.5 mt-0.5">
                        {groupEntries.map((sec, sIdx) => {
                            const isTheoryFallback = sec.session_type === 'THEORY' && entry.session_type === 'LAB';
                            return (
                                <div key={sIdx} className={`flex flex-row items-center justify-center gap-1 flex-wrap w-full rounded px-0.5 ${isTheoryFallback ? 'bg-blue-50/60' : ''}`}>
                                    {isTheoryFallback && (
                                        <span className="text-[7px] font-bold bg-blue-100 text-blue-700 border border-blue-200 px-1 rounded uppercase tracking-wider shrink-0">Theory</span>
                                    )}
                                    {showFaculty && isValidFaculty(sec.faculty_name) && (
                                        <span className={`text-[8.5px] font-semibold italic opacity-90 whitespace-nowrap ${isOEBlock ? 'text-teal-800' : isTheoryFallback ? 'text-blue-800' : ''}`}>{sec.faculty_name}</span>
                                    )}
                                    {showVenues && sec.venue_name && (
                                        <span className={`text-[7.5px] font-bold px-1.5 rounded border shrink-0 whitespace-nowrap ${isOEBlock ? 'text-teal-800 bg-teal-50/80 border-teal-200'
                                            : isTheoryFallback ? 'text-blue-700 bg-blue-50/80 border-blue-200'
                                                : 'text-indigo-700 bg-indigo-50/80 border-indigo-200'
                                            }`}>{sec.venue_name}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (showFaculty || showVenues) ? (
                    (showFaculty && isValidFaculty(groupEntries[0]?.faculty_name) || showVenues && groupEntries[0]?.venue_name) && (
                        <div className="flex flex-row items-center justify-center gap-1.5 mt-0.5 flex-wrap w-full mx-auto">
                            {showFaculty && isValidFaculty(groupEntries[0]?.faculty_name) && (
                                <span className={`text-[9px] italic font-semibold opacity-80 whitespace-nowrap ${isOEBlock ? 'text-teal-800' : ''}`}>{groupEntries[0].faculty_name}</span>
                            )}
                            {showVenues && groupEntries[0]?.venue_name && (
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border shrink-0 whitespace-nowrap ${isOEBlock ? 'text-teal-800 bg-teal-50/80 border-teal-200' : 'text-indigo-700 bg-indigo-50/80 border-indigo-200'}`}>{groupEntries[0].venue_name}</span>
                            )}
                        </div>
                    )
                ) : null
                }
            </div >
        );
    };

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} onClick={onClick}
            className={`w-full h-full rounded-xl border-[1.5px] ${bg} ${border} ${text} ${isSwapMode ? 'cursor-pointer hover:ring-2 hover:ring-violet-400' : 'cursor-pointer hover:ring-2 hover:ring-violet-200'} ${isSelected ? 'ring-4 ring-fuchsia-500 shadow-xl scale-105 z-50' : ''} transition-all hover:shadow-md group relative flex flex-col justify-center p-2 shadow-sm min-h-[64px]`}>
            {isMentor ? (
                <div className="text-center">
                    <div className="font-bold text-[10px] uppercase tracking-wider opacity-90">MENTOR</div>
                    <div className="text-[9px] opacity-60 font-medium mt-0.5">Interaction</div>
                </div>
            ) : (
                <div className="flex flex-col gap-0.5 justify-center h-full w-full">
                    {/* All regular and explicit OE course entries */}
                    {regularCodes.map((code, idx) => renderCourseBlock(code, idx, false, regularEntries.filter(s => s.course_code === code)))}
                    {explicitOECodes.map((code, idx) => renderCourseBlock(code, regularCodes.length + idx, true, explicitOEEntries.filter(s => s.course_code === code)))}

                    {/* Disconnected Open Elective Placeholder (Only if implicit OE but no explicit OE assigned) */}
                    {shouldShowOEPlaceholder && (
                        <div className={`flex flex-col justify-center flex-grow bg-teal-50/60 rounded-lg px-2 py-1.5 mt-1 border border-teal-100 ${regularCodes.length > 0 ? '' : 'h-full'}`}>
                            <div className="flex justify-center items-center">
                                <span className="text-[9px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-bold border border-teal-200 uppercase tracking-widest shadow-sm">OPEN ELECTIVE</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Droppable Grid Cell (Preserved Logic) ───
const GridCell = ({ id, children, isEmpty, isBreak, isLunch, onCellClick }) => {
    // Break/Lunch cells are purely visual (static)
    if (isBreak || isLunch) {
        return (
            <td className={`border-r border-b border-gray-100 text-center align-middle min-w-[50px] ${isLunch ? 'bg-orange-50/30 pattern-diagonal-lines pattern-orange-100/50' : 'bg-gray-50/50'}`} style={{ height: 80 }}>
                <div className="flex flex-col items-center justify-center h-full py-2 opacity-40 select-none grayscale contrast-50 hover:grayscale-0 transition-all duration-500">
                    <Coffee className={`w-3.5 h-3.5 mb-1 ${isLunch ? 'text-orange-400' : 'text-gray-400'}`} />
                    <span className={`text-[9px] font-bold tracking-wider uppercase ${isLunch ? 'text-orange-400' : 'text-gray-400'}`}>{isLunch ? 'LUNCH' : 'BREAK'}</span>
                </div>
            </td>
        );
    }

    const { setNodeRef, isOver } = useDroppable({ id });

    return (
        <td ref={setNodeRef} onClick={isEmpty ? onCellClick : undefined}
            className={`border-r border-b border-gray-100 relative min-w-[220px] transition-colors duration-200 ${isOver ? (isEmpty ? 'bg-emerald-50/50' : 'bg-amber-50/50') : (isEmpty ? 'bg-white hover:bg-purple-50/10 cursor-pointer' : '')}`}
            style={{ minHeight: 80, height: 'auto', padding: 4 }}>
            {/* Adding specific ring indicator for drops */}
            {isOver && (
                <div className={`absolute inset-1 rounded-xl border-2 border-dashed pointer-events-none z-10 ${isEmpty ? 'border-emerald-400/50 bg-emerald-50/20' : 'border-amber-400/50 bg-amber-50/20'}`} />
            )}
            {children}
        </td>
    );
};

// ─── Droppable Grid Cell Span (Preserved Logic) ───
const DroppableGridCellSpan = ({ id, colSpan, entry, sections, isLabStart, onDelete, isSwapMode, isSelected, onCellClick, showCourseCode, showFaculty, showVenues, showLabels, allCourses }) => {
    const { setNodeRef, isOver } = useDroppable({ id });

    return (
        <td ref={setNodeRef}
            colSpan={colSpan}
            onClick={!entry ? onCellClick : undefined}
            className={`border-r border-b border-gray-100 relative transition-colors duration-200 ${isOver ? (entry ? 'bg-amber-50/50' : 'bg-emerald-50/50') : (entry ? '' : 'bg-white hover:bg-purple-50/10 cursor-pointer')}`}
            style={{ minHeight: 64, height: 'auto', padding: 4, minWidth: colSpan > 1 ? 440 : 220 }}>
            {isOver && (
                <div className={`absolute inset-1 rounded-xl border-2 border-dashed pointer-events-none z-10 ${entry ? 'border-amber-400/50 bg-amber-50/20' : 'border-emerald-400/50 bg-emerald-50/20'}`} />
            )}
            {entry ? (
                <div className="relative group h-full w-full">
                    <CellContent
                        entry={entry}
                        sections={sections}
                        cellId={`placed-${id}`}
                        isLabStart={isLabStart}
                        isSwapMode={isSwapMode}
                        isSelected={isSelected}
                        onClick={onCellClick}
                        showCourseCode={showCourseCode}
                        showFaculty={showFaculty}
                        showVenues={showVenues}
                        showLabels={showLabels}
                        allCourses={allCourses}
                    />
                    <button onClick={onDelete}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg z-20 scale-75 group-hover:scale-100 cursor-pointer ring-2 ring-white">
                        <X className="w-3 h-3" />
                    </button>
                </div>
            ) : null}
        </td>
    );
};

const ManualEntryModal = ({ isOpen, onClose, onSave, initialData, allSections, initialSpan = 1, allCourses, department, semester, day, period, gridMap, validPeriods }) => {
    if (!isOpen) return null;
    const [formData, setFormData] = useState(initialData || { course_code: '', course_name: '', faculty_name: '', venue_name: '' });
    const [sectionEdits, setSectionEdits] = useState([]);
    const [availableFaculty, setAvailableFaculty] = useState([]);
    const [availableVenues, setAvailableVenues] = useState([]);
    const [loading, setLoading] = useState(false);
    const [manualMode, setManualMode] = useState({});
    const [activeTab, setActiveTab] = useState(0);
    const [isAddingCourse, setIsAddingCourse] = useState(false);
    const [currentSpan, setCurrentSpan] = useState(initialSpan);
    const [isExtending, setIsExtending] = useState(false);
    const [showAllFaculty, setShowAllFaculty] = useState(false);
    const [showAllVenues, setShowAllVenues] = useState(false);

    React.useEffect(() => { setCurrentSpan(initialSpan); }, [initialSpan, isOpen]);

    // Group sections by course_code for multi-course editing (Fix 3)
    const courseGroups = React.useMemo(() => {
        if (!sectionEdits || sectionEdits.length === 0) return [];
        const groups = {};
        sectionEdits.filter(s => !s._deleted).forEach(s => {
            const code = s.course_code || 'UNKNOWN';
            if (!groups[code]) groups[code] = { code, name: s.course_name || '', entries: [] };
            groups[code].entries.push(s);
        });
        return Object.values(groups);
    }, [sectionEdits]);

    // Current faculty/venue names for "Current" label (Fix 4)
    const currentFacultyNames = React.useMemo(() => {
        if (!allSections) return new Set();
        return new Set(allSections.filter(s => s.faculty_name && s.faculty_name.trim()).map(s => s.faculty_name));
    }, [allSections]);
    const currentVenueNames = React.useMemo(() => {
        if (!allSections) return new Set();
        return new Set(allSections.filter(s => s.venue_name && s.venue_name.trim()).map(s => s.venue_name));
    }, [allSections]);

    React.useEffect(() => {
        if (allSections && allSections.length >= 1) {
            setSectionEdits(allSections.map(s => ({
                faculty_name: s.faculty_name ? s.faculty_name.trim() : '',
                venue_name: s.venue_name ? s.venue_name.trim() : '',
                course_code: s.course_code,
                course_name: s.course_name,
                section_number: s.section_number,
                session_type: s.session_type,
                _original: s,
                _deleted: false
            })));
        } else {
            setSectionEdits([]);
        }
        setActiveTab(0);
    }, [allSections]);

    const currentCourseCode = courseGroups.length > 0 && courseGroups[activeTab] ? courseGroups[activeTab].code : '';

    React.useEffect(() => {
        if (!department || !day || !period) return;
        setLoading(true);
        Promise.all([
            api.getAvailableFaculty(department, day, period, currentCourseCode, showAllFaculty).catch(() => ({ data: [] })),
            api.getAvailableVenues(department, semester, day, period, currentCourseCode, showAllVenues).catch(() => ({ data: [] }))
        ]).then(([facRes, venRes]) => {
            setAvailableFaculty(facRes.data || []);
            setAvailableVenues(venRes.data || []);
        }).finally(() => setLoading(false));
    }, [department, semester, day, period, currentCourseCode, showAllFaculty, showAllVenues]);

    const handleSubmit = (e) => {
        e.preventDefault();
        // Pass ALL sectionEdits (including deleted) so handleManualSave can remove originals
        onSave(formData, sectionEdits, currentSpan);
        onClose();
    };

    const updateSection = (idx, field, value) => {
        setSectionEdits(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
    };

    const addSection = (courseCode, courseName) => {
        setSectionEdits(prev => [...prev, {
            faculty_name: '', venue_name: '',
            course_code: courseCode || formData.course_code,
            course_name: courseName || formData.course_name,
            section_number: prev.length + 1,
            session_type: prev[0]?.session_type || 'THEORY',
            _original: null, _deleted: false, _isNew: true
        }]);
    };

    const deleteSection = (idx) => {
        setSectionEdits(prev => prev.map((s, i) => i === idx ? { ...s, _deleted: true } : s));
    };

    const deleteEntireCourse = (courseCode) => {
        setSectionEdits(prev => prev.map(s => s.course_code === courseCode ? { ...s, _deleted: true } : s));
        setActiveTab(0); // Reset tab after deletion
    };

        const addNewCourseGroup = (courseCode) => {
        const courseObj = allCourses.find(c => c.course_code === courseCode);
        if (!courseObj) return;

        setSectionEdits(prev => {
            let nextEdits = prev;
            // Auto-remove "LOCKED" placeholder if it is the only course in this slot
            if (prev.length === 1 && prev[0].course_code === 'LOCKED' && !prev[0]._deleted) {
                nextEdits = prev.map(s => ({ ...s, _deleted: true }));
                setTimeout(() => setActiveTab(0), 10);
            } else {
                setTimeout(() => setActiveTab(courseGroups.length), 10);
            }
            return [...nextEdits, {
                faculty_name: '', venue_name: '',
                course_code: courseObj.course_code,
                course_name: courseObj.course_name,
                section_number: 1,
                session_type: courseObj.is_lab ? 'LAB' : 'THEORY',
                _original: null, _deleted: false, _isNew: true
            }];
        });

        setIsAddingCourse(false);
    };

    const toggleManual = (key) => setManualMode(prev => ({ ...prev, [key]: !prev[key] }));

    // Faculty dropdown with Current vs In Use (Fix 4)
    const renderFacultyField = (sec, actualIdx) => {
        const manualKey = `faculty-${actualIdx}`;
        const isManual = manualMode[manualKey];
        return (
            <div>
                <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Faculty</label>
                        {!isManual && (
                            <button type="button" onClick={() => setShowAllFaculty(!showAllFaculty)}
                                className={`text-[8px] px-2 py-0.5 rounded-full font-bold transition-all border shadow-sm ${showAllFaculty ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'}`}
                                title="Toggle between mapped faculty and all faculty">
                                {showAllFaculty ? 'Showing All' : 'Filtered'}
                            </button>
                        )}
                    </div>
                    <button type="button" onClick={() => toggleManual(manualKey)}
                        className="text-[9px] text-violet-500 hover:text-violet-700 flex items-center gap-0.5 font-semibold">
                        {isManual ? <><ChevronDown className="w-2.5 h-2.5" /> Dropdown</> : <><Type className="w-2.5 h-2.5" /> Type</>}
                    </button>
                </div>
                {isManual ? (
                    <input type="text" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                        value={sec.faculty_name} onChange={e => updateSection(actualIdx, 'faculty_name', e.target.value)} placeholder="Type faculty name..." />
                ) : (
                    <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-violet-400 outline-none bg-white cursor-pointer"
                        value={sec.faculty_name} onChange={e => updateSection(actualIdx, 'faculty_name', e.target.value)}>
                        <option value="">-- Select Faculty --</option>
                        {(() => {
                            // Ensure the currently assigned faculty is always in the list
                            let displayFaculty = [...availableFaculty];
                            if (sec.faculty_name && !displayFaculty.find(f => f.faculty_name === sec.faculty_name)) {
                                displayFaculty.push({ faculty_id: 'auto-' + sec.faculty_name, faculty_name: sec.faculty_name, is_available: false });
                            }
                            return displayFaculty.map(f => {
                                const isCurrent = currentFacultyNames.has(f.faculty_name);
                                const selectable = f.is_available || isCurrent;
                                return (
                                    <option key={f.faculty_id} value={f.faculty_name} disabled={!selectable}
                                        style={{ color: isCurrent ? '#7c3aed' : selectable ? '#059669' : '#dc2626' }}>
                                        {isCurrent ? '★ ' : selectable ? '✓ ' : '✗ '}{f.faculty_name}{isCurrent ? ' (Current)' : !f.is_available ? ' (In Use)' : ''}
                                    </option>
                                );
                            });
                        })()}
                    </select>
                )}
            </div>
        );
    };

    // Venue dropdown with Current vs In Use (Fix 4)
    const renderVenueField = (sec, actualIdx) => {
        const manualKey = `venue-${actualIdx}`;
        const isManual = manualMode[manualKey];
        return (
            <div>
                <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Venue</label>
                        {!isManual && (
                            <button type="button" onClick={() => setShowAllVenues(!showAllVenues)}
                                className={`text-[8px] px-2 py-0.5 rounded-full font-bold transition-all border shadow-sm ${showAllVenues ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'}`}
                                title="Toggle between mapped venues and all venues">
                                {showAllVenues ? 'Showing All' : 'Filtered'}
                            </button>
                        )}
                    </div>
                    <button type="button" onClick={() => toggleManual(manualKey)}
                        className="text-[9px] text-violet-500 hover:text-violet-700 flex items-center gap-0.5 font-semibold">
                        {isManual ? <><ChevronDown className="w-2.5 h-2.5" /> Dropdown</> : <><Type className="w-2.5 h-2.5" /> Type</>}
                    </button>
                </div>
                {isManual ? (
                    <input type="text" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                        value={sec.venue_name} onChange={e => updateSection(actualIdx, 'venue_name', e.target.value)} placeholder="Type venue name..." />
                ) : (
                    <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-violet-400 outline-none bg-white cursor-pointer"
                        value={sec.venue_name} onChange={e => updateSection(actualIdx, 'venue_name', e.target.value)}>
                        <option value="">-- Select Venue --</option>
                        {(() => {
                            // Ensure the currently assigned venue is always in the list
                            let displayVenues = [...availableVenues];
                            if (sec.venue_name && !displayVenues.find(v => v.venue_name === sec.venue_name)) {
                                displayVenues.push({ venue_id: 'auto-' + sec.venue_name, venue_name: sec.venue_name, is_available: false });
                            }
                            return displayVenues.map(v => {
                                const isCurrent = currentVenueNames.has(v.venue_name);
                                const selectable = v.is_available || isCurrent;
                                return (
                                    <option key={v.venue_id} value={v.venue_name} disabled={!selectable}
                                        style={{ color: isCurrent ? '#7c3aed' : selectable ? '#059669' : '#dc2626' }}>
                                        {isCurrent ? '★ ' : selectable ? '✓ ' : '✗ '}{v.venue_name}{v.capacity ? ` (${v.capacity})` : ''}{v.is_lab ? ' [Lab]' : ''}{isCurrent ? ' (Current)' : !v.is_available ? ' (In Use)' : ''}
                                    </option>
                                );
                            });
                        })()}
                    </select>
                )}
            </div>
        );
    };

    // Render sections for a specific course group
    const renderCourseGroup = (courseCode, courseName) => {
        const groupSections = sectionEdits.map((s, i) => ({ ...s, _globalIdx: i })).filter(s => s.course_code === courseCode && !s._deleted);
        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="grid grid-cols-2 gap-3 flex-1 mr-3">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Code</label>
                            <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-violet-400 outline-none bg-gray-50" value={courseCode} readOnly />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Name</label>
                            <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400 outline-none bg-gray-50" value={courseName || ''} title={courseName} readOnly />
                        </div>
                    </div>
                    <button type="button" onClick={() => deleteEntireCourse(courseCode)}
                        className="self-end mb-1 text-xs px-2 py-1.5 font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-all rounded-lg flex items-center gap-1 min-w-max" title="Remove Entire Course">
                        <Trash2 className="w-3.5 h-3.5" /> Remove Course
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-violet-600 uppercase tracking-wider">Sections ({groupSections.length})</span>
                    {groupSections[0]?.session_type === 'LAB' && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">LAB · 2 Periods</span>
                    )}
                    <div className="flex-1 h-px bg-violet-100"></div>
                    <button type="button" onClick={() => addSection(courseCode, courseName)}
                        className="flex items-center gap-1 text-[10px] font-bold text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 px-2 py-1 rounded-lg border border-green-200 transition-all">
                        <Plus className="w-3 h-3" /> Add Section
                    </button>
                </div>
                {groupSections.map((sec, sIdx) => (
                    <div key={sec._globalIdx} className="bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-2 relative group">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full text-[10px] font-bold">Section {sIdx + 1}</span>
                                {sec._isNew && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">NEW</span>}
                            </div>
                            {groupSections.length > 1 && (
                                <button type="button" onClick={() => deleteSection(sec._globalIdx)}
                                    className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded-lg transition-all opacity-0 group-hover:opacity-100" title="Remove section">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {renderFacultyField(sec, sec._globalIdx)}
                            {renderVenueField(sec, sec._globalIdx)}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg border border-gray-100 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-800">{initialData ? 'Edit Entry' : 'Add Manual Entry'}</h3>
                    {loading && <span className="text-xs text-violet-500 animate-pulse font-semibold">Loading availability...</span>}
                </div>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {/* Multi-course tabs (Fix 3 & Add/Delete) */}
                    {courseGroups.length > 0 ? (
                        <>
                            <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl items-center">
                                {courseGroups.map((g, idx) => (
                                    <button key={idx} type="button" onClick={() => setActiveTab(idx)}
                                        className={`flex-1 min-w-[60px] text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${activeTab === idx ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                        {g.code}
                                    </button>
                                ))}
                                {!isAddingCourse ? (
                                    <button type="button" onClick={() => setIsAddingCourse(true)}
                                        className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all text-violet-600 hover:bg-violet-50 flex items-center gap-1 border border-dashed border-violet-300 ml-1">
                                        <Plus className="w-3.5 h-3.5" /> Add Course
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-1 ml-1">
                                        <select autoFocus className="text-xs border border-violet-300 rounded px-2 py-1 outline-none text-violet-800"
                                            onChange={e => {
                                                if (e.target.value) addNewCourseGroup(e.target.value);
                                                else setIsAddingCourse(false);
                                            }}
                                            onBlur={() => setIsAddingCourse(false)}>
                                            <option value="">Select course...</option>
                                            {allCourses.map(c => (
                                                <option key={c.course_code} value={c.course_code} disabled={courseGroups.some(g => g.code === c.course_code)}>
                                                    {c.course_code} - {c.course_name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                            {courseGroups[activeTab] && renderCourseGroup(courseGroups[activeTab].code, courseGroups[activeTab].name)}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                            <BookOpen className="w-8 h-8 text-gray-300 mb-2" />
                            <p className="text-sm font-semibold text-gray-500 mb-4">No courses scheduled here yet.</p>
                            {!isAddingCourse ? (
                                <button type="button" onClick={() => setIsAddingCourse(true)}
                                    className="text-sm font-bold px-4 py-2 rounded-lg transition-all text-white bg-violet-600 hover:bg-violet-700 flex items-center gap-2 shadow-md">
                                    <Plus className="w-4 h-4" /> Add First Course Session
                                </button>
                            ) : (
                                <div className="w-full max-w-xs">
                                    <select autoFocus className="w-full border border-violet-300 rounded-lg px-3 py-2 outline-none text-violet-800 shadow-sm"
                                        onChange={e => {
                                            if (e.target.value) addNewCourseGroup(e.target.value);
                                            else setIsAddingCourse(false);
                                        }}
                                        onBlur={() => setIsAddingCourse(false)}>
                                        <option value="">Select course to add...</option>
                                        {allCourses.map(c => (
                                            <option key={c.course_code} value={c.course_code}>
                                                {c.course_code} - {c.course_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex justify-between items-center gap-2 mt-2 border-t border-gray-100 pt-3">
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                                <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{day}</span>
                                <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                                    Period {period} {currentSpan > 1 ? `to ${period + currentSpan - 1}` : ''}
                                </span>
                                <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{department} - Sem {semester}</span>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                {(sectionEdits[0]?.session_type || formData.session_type) !== 'LAB' && (
                                    <button type="button" onClick={() => {
                                        setSectionEdits(prev => prev.map(s => ({ ...s, session_type: 'LAB' })));
                                        setFormData(prev => ({ ...prev, session_type: 'LAB' }));
                                    }}
                                        className="text-[10px] px-2.5 py-1 font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all flex items-center gap-1" title="Convert to Lab Slot">
                                        <FlaskConical className="w-3 h-3" /> Convert to Lab Slot
                                    </button>
                                )}
                                {(sectionEdits[0]?.session_type || formData.session_type) === 'LAB' && (
                                    <button type="button" onClick={() => {
                                        setSectionEdits(prev => prev.map(s => ({ ...s, session_type: 'THEORY' })));
                                        setFormData(prev => ({ ...prev, session_type: 'THEORY' }));
                                    }}
                                        className="text-[10px] px-2.5 py-1 font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-all flex items-center gap-1" title="Convert to Theory Slot">
                                        Convert to Theory Slot
                                    </button>
                                )}

                                <button type="button" disabled={isExtending} onClick={async () => {
                                    const targetP = period + currentSpan;
                                    if (validPeriods && !validPeriods.has(targetP)) {
                                        alert("Cannot extend beyond valid periods for the day."); return;
                                    }
                                    const existing = gridMap[`${day}-${targetP}`];
                                    if (existing) {
                                        alert(`Period ${targetP} is already occupied by ${existing.course_code}. Please clear it first before extending.`); return;
                                    }
                                    setIsExtending(true);
                                    try {
                                        const [facRes, venRes] = await Promise.all([
                                            api.getAvailableFaculty(department, day, targetP, currentCourseCode, showAllFaculty).catch(() => ({ data: [] })),
                                            api.getAvailableVenues(department, semester, day, targetP, currentCourseCode, showAllVenues).catch(() => ({ data: [] }))
                                        ]);
                                        const availFacs = facRes.data || [];
                                        const availVens = venRes.data || [];
                                        for (const sec of sectionEdits.filter(s => !s._deleted)) {
                                            if (sec.faculty_name && sec.faculty_name.trim().toLowerCase() !== 'unassigned') {
                                                const fa = availFacs.find(f => f.faculty_name === sec.faculty_name);
                                                if (!fa || !fa.is_available) {
                                                    alert(`Cannot extend: Faculty '${sec.faculty_name}' is not available in Period ${targetP}.`);
                                                    setIsExtending(false); return;
                                                }
                                            }
                                            if (sec.venue_name && sec.venue_name.trim().toLowerCase() !== 'unassigned') {
                                                const va = availVens.find(v => v.venue_name === sec.venue_name);
                                                if (!va || !va.is_available) {
                                                    alert(`Cannot extend: Venue '${sec.venue_name}' is not available in Period ${targetP}.`);
                                                    setIsExtending(false); return;
                                                }
                                            }
                                        }
                                        setCurrentSpan(prev => prev + 1);
                                    } finally { setIsExtending(false); }
                                }}
                                    className={`text-[10px] px-2.5 py-1 font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg transition-all flex items-center gap-1 ${isExtending ? 'opacity-50 cursor-wait' : 'hover:bg-blue-100'}`} title="Extend block by 1 more period">
                                    {isExtending ? 'Checking Availability...' : '+ Extend Period'}
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 shrink-0">
                            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
                            <button type="submit" className="px-4 py-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg shadow-lg hover:shadow-violet-200">Save</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════
export default function TimetableEditor({ department, semester, initialData, masterData, onSave, onExportPDF, selectedLearningModes: initialLearningModes }) {
    const [allCourses, setAllCourses] = useState([]);
    const [entries, setEntries] = useState(initialData || []);
    const [localLearningModes, setLocalLearningModes] = useState(initialLearningModes || [1, 2]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [redoStack, setRedoStack] = useState([]);
    const [slots, setSlots] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [facultyMap, setFacultyMap] = useState({});
    const [venueMap, setVenueMap] = useState({});
    const [draggedItem, setDraggedItem] = useState(null);
    const [isSwapMode, setIsSwapMode] = useState(false);
    const [swapSource, setSwapSource] = useState(null);
    const [editModalData, setEditModalData] = useState(null);

    // Merge Mode
    const [isMergeMode, setIsMergeMode] = useState(false);
    const [mergeSource, setMergeSource] = useState(null);

    // View Toggles (Fix 6)
    const [showCourseCode, setShowCourseCode] = useState(true);
    const [showFaculty, setShowFaculty] = useState(true);
    const [showVenues, setShowVenues] = useState(true);
    const [showLabels, setShowLabels] = useState(true);

    // Conflict Modal (Fix 7 & 8)
    const [conflictModal, setConflictModal] = useState(null); // { conflicts, onProceed, onCancel }

    // Filters
    const [paletteDept, setPaletteDept] = useState(department || '');
    const [searchQuery, setSearchQuery] = useState('');
    const [showTheory, setShowTheory] = useState(true);
    const [showLabs, setShowLabs] = useState(true);

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
    );

    // ─── Load Data ───
    useEffect(() => { loadData(); }, [department, semester]);

    const loadData = async () => {
        try {
            const modeIdsStr = localLearningModes.sort().join(',');
            const [tRes, sRes, dRes] = await Promise.all([
                api.getTimetable(department, semester, modeIdsStr),
                api.getSlots(),
                api.getDepartments()
            ]);
            setEntries(tRes.data || []);
            setSlots(sRes.data || []);
            setDepartments(dRes.data?.map(d => d.department_code) || []);
            setPaletteDept(department);
            // Reset history when loading new data
            setHistory([{ entries: [...(tRes.data || [])], action: 'Initial Load' }]);
            setHistoryIndex(0);
        } catch (err) { console.error('Load error:', err); }
    };

    // Load courses when palette dept changes
    useEffect(() => {
        if (!paletteDept) return;
        const loadCourses = async () => {
            try {
                const [cRes, fRes, cvRes, dvRes] = await Promise.all([
                    api.getCourses(paletteDept),
                    api.getCourseFaculty(paletteDept),
                    api.getCourseVenues ? api.getCourseVenues(paletteDept).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
                    api.getDepartmentVenues ? api.getDepartmentVenues(paletteDept).catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
                ]);
                setAllCourses(cRes.data || []);
                const fMap = {};
                (fRes.data || []).forEach(m => { fMap[m.course_code] = m.faculty_name || m.faculty_id; });
                setFacultyMap(fMap);

                const vMap = {};
                const theoryVenues = [];
                const labVenues = [];

                (dvRes.data || []).forEach(dv => {
                    const isLab = dv.venue?.is_lab;
                    const vName = dv.venue?.venue_name || dv.venue_name || `Venue ${dv.venue_id}`;
                    if (isLab) labVenues.push(vName);
                    else theoryVenues.push(vName);
                });

                (cvRes.data || []).forEach(cv => {
                    vMap[cv.course_code] = cv.venue?.venue_name || cv.venue_name || `Venue ${cv.venue_id}`;
                });

                let tIdx = 0;
                let lIdx = 0;

                (cRes.data || []).forEach(c => {
                    if (!vMap[c.course_code]) {
                        if (c.is_lab) {
                            vMap[c.course_code] = labVenues.length > 0 ? labVenues[lIdx % labVenues.length] : 'No Lab Venue';
                            if (labVenues.length > 0) lIdx++;
                        } else {
                            vMap[c.course_code] = theoryVenues.length > 0 ? theoryVenues[tIdx % theoryVenues.length] : 'No Theory Venue';
                            if (theoryVenues.length > 0) tIdx++;
                        }
                    }
                });

                setVenueMap(vMap);
            } catch (err) { console.error('Load courses error:', err); }
        };
        loadCourses();
    }, [paletteDept]);

    // ─── Memoized structures ───
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const { periodColumns, validPeriods } = useMemo(() => {
        if (!slots.length) return { periodColumns: [], validPeriods: new Set() };

        const sampleDay = slots.find(s => s.day_of_week === 'Monday') ? 'Monday' : slots[0]?.day_of_week;
        const daySlots = slots.filter(s => s.day_of_week === sampleDay).sort((a, b) => a.period_number - b.period_number);

        const cols = [];
        const valid = new Set();

        let lastEndTime = null;

        daySlots.forEach(slot => {
            if (lastEndTime && slot.start_time > lastEndTime) {
                const gap = timeToMinutes(slot.start_time) - timeToMinutes(lastEndTime);
                if (gap >= 10) {
                    cols.push({ type: 'BREAK', label: 'Break', start: lastEndTime, end: slot.start_time });
                }
            }

            if (slot.slot_type === 'LUNCH') {
                cols.push({ type: 'LUNCH', label: 'Lunch', start: slot.start_time, end: slot.end_time });
            } else if (slot.slot_type !== 'REGULAR') {
                cols.push({ type: 'BREAK', label: slot.slot_type, start: slot.start_time, end: slot.end_time });
            } else {
                cols.push({ type: 'PERIOD', period: slot.period_number, start: slot.start_time, end: slot.end_time });
                valid.add(slot.period_number);
            }
            lastEndTime = slot.end_time;
        });

        return { periodColumns: cols, validPeriods: valid };
    }, [slots]);

    const activeDays = useMemo(() =>
        dayOrder.filter(d => slots.some(s => s.day_of_week === d)),
        [slots]
    );

    const { gridMap, sectionsMap } = useMemo(() => {
        const gm = {};
        const sm = {};
        entries.forEach(e => {
            const key = `${e.day_of_week}-${e.period_number}`;
            // gridMap: keep the first entry (section 1 or first encountered) as the primary for drag-and-drop
            if (!gm[key]) gm[key] = e;
            // sectionsMap: group all entries for the same slot
            if (!sm[key]) sm[key] = [];
            sm[key].push(e);
        });
        return { gridMap: gm, sectionsMap: sm };
    }, [entries]);

    const filteredCourses = useMemo(() => {
        const dummyOE = {
            course_code: 'OPEN_ELEC',
            course_name: 'OPEN ELECTIVE',
            session_type: 'OPEN_ELECTIVE',
            is_open_elective: true,
            is_lab: false
        };

        // Inject the dummy OE course into the allCourses list
        let list = [...allCourses, dummyOE];

        if (!showTheory) list = list.filter(c => c.is_lab);
        if (!showLabs) list = list.filter(c => !c.is_lab);
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(c => c.course_code.toLowerCase().includes(q) || c.course_name.toLowerCase().includes(q));
        }
        return list;
    }, [allCourses, searchQuery, showTheory, showLabs]);

    // ─── Helpers ───
    function timeToMinutes(t) {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    }

    const pushHistory = useCallback(() => {
        setHistory(prev => [...prev.slice(-20), JSON.parse(JSON.stringify(entries))]);
        setRedoStack([]); // clear redo on new action
    }, [entries]);

    const undo = useCallback(() => {
        if (history.length === 0) return;
        setRedoStack(prev => [...prev, JSON.parse(JSON.stringify(entries))]);
        const prev = history[history.length - 1];
        setEntries(prev);
        setHistory(h => h.slice(0, -1));
    }, [history, entries]);

    const redo = useCallback(() => {
        if (redoStack.length === 0) return;
        setHistory(prev => [...prev, JSON.parse(JSON.stringify(entries))]);
        const next = redoStack[redoStack.length - 1];
        setEntries(next);
        setRedoStack(r => r.slice(0, -1));
    }, [redoStack, entries]);

    // Keyboard shortcuts: Ctrl+Z / Ctrl+Y
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);

    // ─── Drag Logic ───
    const handleDragStart = ({ active }) => setDraggedItem(active.data.current);

    // Conflict check helper (Fix 7)
    const checkConflictsForEntries = async (entriesToCheck, onSuccess, rollbackEntries) => {
        try {
            const checkData = {
                department_code: department,
                semester: parseInt(semester),
                entries: entriesToCheck.map(e => ({
                    faculty_name: e.faculty_name || '',
                    venue_name: e.venue_name || '',
                    day_of_week: e.day_of_week,
                    period_number: e.period_number,
                    course_code: e.course_code || ''
                }))
            };
            const res = await api.checkConflicts(checkData);
            if (res.data.has_conflicts) {
                const allConflicts = [...(res.data.faculty_conflicts || []), ...(res.data.venue_conflicts || [])];
                const msgs = allConflicts.map(c => c.message);
                alert('⚠️ Conflict Detected!\n\n' + msgs.join('\n') + '\n\nChanges have been undone.');
                if (rollbackEntries) setEntries(rollbackEntries);
                return;
            }
            onSuccess();
        } catch (err) {
            console.warn('Conflict check failed, proceeding anyway:', err);
            onSuccess();
        }
    };

    const handleDragEnd = ({ active, over }) => {
        setDraggedItem(null);
        if (!over) return;

        const overId = over.id;
        if (overId.includes('BREAK') || overId.includes('LUNCH')) return;

        const activeData = active.data.current;
        const [targetDay, targetPeriodStr] = overId.split('-');
        const targetPeriod = parseInt(targetPeriodStr);

        pushHistory();

        if (activeData.type === 'new') {
            placeCourse(activeData.course, activeData.facultyName, activeData.venueName, targetDay, targetPeriod);
        } else if (activeData.type === 'placed') {
            moveEntry(activeData.entry, targetDay, targetPeriod);
        }
    };

    const placeCourse = (course, facultyName, venueName, day, period) => {
        const isLab = course.is_lab;
        if (isLab) {
            if (!isValidPeriod(day, period)) return;
            if (!isContiguous(day, period, 2)) return;
        } else {
            if (!isValidPeriod(day, period)) return;
        }

        const fName = facultyName || facultyMap[course.course_code] || 'Unassigned';
        const newEntry = {
            department_code: department, semester: parseInt(semester),
            course_code: course.course_code, course_name: course.course_name,
            session_type: isLab ? 'LAB' : 'THEORY',
            faculty_id: null, faculty_name: fName, slot_id: 0,
            venue_name: venueName || '',
            day_of_week: day, period_number: period
        };

        const newEntries = simpleInsert(newEntry, isLab ? 2 : 1, entries);

        const insertedEntries = isLab
            ? [{ ...newEntry }, { ...newEntry, period_number: period + 1 }]
            : [newEntry];
        const prevEntries = [...entries];
        setEntries(newEntries);
        checkConflictsForEntries(insertedEntries, () => { }, prevEntries);
    };

    // Fix 1: moveEntry moves ALL entries at the source slot
    const moveEntry = (entry, newDay, newPeriod) => {
        const isLab = entry.session_type === 'LAB';
        if (isLab) {
            if (!isValidPeriod(newDay, newPeriod)) return;
            if (!isContiguous(newDay, newPeriod, 2)) return;
        } else {
            if (!isValidPeriod(newDay, newPeriod)) return;
        }

        const sourceKey = `${entry.day_of_week}-${entry.period_number}`;
        const allSourceEntries = sectionsMap[sourceKey] || [entry];

        let fullSource = [...allSourceEntries];

        let headP = entry.period_number;
        while (headP > 1) {
            const prevE = gridMap[`${entry.day_of_week}-${headP - 1}`];
            if (prevE &&
                prevE.course_code === entry.course_code &&
                prevE.session_type === entry.session_type &&
                prevE.faculty_name === entry.faculty_name &&
                prevE.venue_name === entry.venue_name) headP--;
            else break;
        }
        const blockSpan = getBlockSpan(entry.day_of_week, headP, entry.course_code, entry.session_type, entry.faculty_name, entry.venue_name);
        for (let i = 0; i < blockSpan; i++) {
            const adjKey = `${entry.day_of_week}-${headP + i}`;
            const adjEntries = sectionsMap[adjKey] || [];
            adjEntries.forEach(e => {
                if (e.course_code === entry.course_code && e.session_type === entry.session_type && !fullSource.includes(e)) {
                    fullSource.push(e);
                }
            });
        }

        let tempEntries = entries.filter(e => !fullSource.includes(e));

        const sourceStartP = Math.min(...fullSource.map(e => e.period_number));

        const targetPeriods = [];
        for (let i = 0; i < blockSpan; i++) targetPeriods.push(newPeriod + i);

        tempEntries = tempEntries.filter(e => !(e.day_of_week === newDay && targetPeriods.includes(e.period_number)));

        const movedEntries = fullSource.map(e => ({
            ...e,
            day_of_week: newDay,
            period_number: newPeriod + (e.period_number - sourceStartP)
        }));

        const finalEntries = [...tempEntries, ...movedEntries];
        const prevEntries = [...entries];
        setEntries(finalEntries);

        // Conflict check (Fix 7)
        checkConflictsForEntries(movedEntries, () => { }, prevEntries);
    };

    // ─── Smart Logic ───
    const isValidPeriod = (day, p) => {
        const parsedP = parseInt(p);
        return periodColumns.some(c => c.type === 'PERIOD' && c.period === parsedP);
    };

    const isContiguous = (day, p, size) => {
        if (size <= 1) return true;
        const startIdx = periodColumns.findIndex(c => c.type === 'PERIOD' && c.period === parseInt(p));
        if (startIdx === -1) return false;

        for (let i = 1; i < size; i++) {
            const nextCol = periodColumns[startIdx + i];
            if (!nextCol || nextCol.type !== 'PERIOD' || nextCol.period !== parseInt(p) + i) {
                return false;
            }
        }
        return true;
    };

    // Fix 2: Simple insert — just delete what's at target and place new entry
    const simpleInsert = (newEntry, size, currentList = entries) => {
        const day = newEntry.day_of_week;
        const p = newEntry.period_number;

        // Remove any entries at target periods
        const targetPeriods = [];
        for (let i = 0; i < size; i++) targetPeriods.push(p + i);

        let tempList = currentList.filter(e => !(e.day_of_week === day && targetPeriods.includes(e.period_number)));

        // Add the new entry
        tempList = [...tempList, { ...newEntry }];
        if (size === 2) tempList = [...tempList, { ...newEntry, period_number: p + 1 }];

        return tempList;
    };

    const handleDeleteEntry = (day, period) => {
        pushHistory();
        const entry = gridMap[`${day}-${period}`];
        if (!entry) return;

        let headP = period;
        while (headP > 1) {
            const prevE = gridMap[`${day}-${headP - 1}`];
            if (prevE &&
                prevE.course_code === entry.course_code &&
                prevE.session_type === entry.session_type &&
                prevE.faculty_name === entry.faculty_name &&
                prevE.venue_name === entry.venue_name) headP--;
            else break;
        }
        const blockSpan = getBlockSpan(day, headP, entry.course_code, entry.session_type, entry.faculty_name, entry.venue_name);
        const periodsToRemove = Array.from({ length: blockSpan }, (_, i) => headP + i);

        setEntries(prev => prev.filter(e => !(
            e.day_of_week === day && e.course_code === entry.course_code && e.session_type === entry.session_type &&
            periodsToRemove.includes(e.period_number)
        )));
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaveError(null);
        setSaveSuccess(false);
        try {
            await onSave(entries, localLearningModes);
            setHistory([{ entries: [...entries], action: 'Initial Save' }]);
            setHistoryIndex(0);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (error) {
            let msg = "An unexpected error occurred while saving.";
            if (error.response?.data?.detail) {
                msg = typeof error.response.data.detail === 'string' 
                    ? error.response.data.detail 
                    : "Validation failed. Please check the data.";
            } else if (error.message) {
                msg = error.message;
            }
            setSaveError(msg);
        } finally {
            setIsSaving(false);
        }
    };

    const handleModeSwitch = async (modeId) => {
        const updated = localLearningModes.includes(modeId)
            ? localLearningModes.filter(id => id !== modeId)
            : [...localLearningModes, modeId];
        
        if (updated.length === 0) return; // Must select at least one

        if (historyIndex > 0 && !confirm("You have unsaved changes. Switching modes will load the saved timetable for that mode and discard current edits. Proceed?")) {
            return;
        }

        setLocalLearningModes(updated);
        
        // Fetch data for the new mode combination
        try {
            const modeIdsStr = updated.sort().join(',');
            const res = await api.getTimetableEntries(department, semester, modeIdsStr);
            setEntries(res.data || []);
            setHistory([{ entries: [...(res.data || [])], action: `Loaded ${modeIdsStr}` }]);
            setHistoryIndex(0);
        } catch (err) {
            console.error("Failed to fetch mode-specific timetable:", err);
            alert("Failed to load timetable for selected modes.");
        }
    };

    const isBlockStart = (day, period) => {
        const entry = gridMap[`${day}-${period}`];
        if (!entry) return false;
        const prevEntry = gridMap[`${day}-${period - 1}`];
        if (prevEntry &&
            prevEntry.course_code === entry.course_code &&
            prevEntry.session_type === entry.session_type &&
            prevEntry.faculty_name === entry.faculty_name &&
            prevEntry.venue_name === entry.venue_name) return false;
        return true;
    };

    const getBlockSpan = useCallback((day, period, courseCode, sessionType, facultyName, venueName) => {
        let span = 1;
        let currP = period + 1;
        while (currP <= 8) {
            const e = gridMap[`${day}-${currP}`];
            if (e &&
                e.course_code === courseCode &&
                e.session_type === sessionType &&
                e.faculty_name === facultyName &&
                e.venue_name === venueName) {
                span++;
                currP++;
            } else break;
        }
        return span;
    }, [gridMap]);

    const isBlockTail = (day, period) => {
        const entry = gridMap[`${day}-${period}`];
        if (!entry) return false;
        const prevEntry = gridMap[`${day}-${period - 1}`];
        return prevEntry &&
            prevEntry.course_code === entry.course_code &&
            prevEntry.session_type === entry.session_type &&
            prevEntry.faculty_name === entry.faculty_name &&
            prevEntry.venue_name === entry.venue_name;
    };

    const handleSwapClick = (day, period, entry) => {
        if (!isSwapMode || !entry) return;

        if (!swapSource) {
            setSwapSource({ day, period, entry });
            return;
        }

        // Deselect if clicking same
        if (swapSource.day === day && swapSource.period === period) {
            setSwapSource(null);
            return;
        }

        // Validate types
        if (swapSource.entry.session_type !== entry.session_type) {
            alert(`Cannot swap ${swapSource.entry.session_type} with ${entry.session_type}. Types must match.`);
            setSwapSource(null);
            return;
        }

        // Execute Swap
        executeSwap(swapSource, { day, period, entry });
        setSwapSource(null);
        // setIsSwapMode(false); // User might want to do multiple swaps
    };

    // Fix 1: executeSwap uses sectionsMap to get ALL entries at both slots
    const executeSwap = (source, target) => {
        pushHistory();
        let newEntries = [...entries];

        // Get ALL entries at source and target slots via sectionsMap
        const getSlotEntries = (refEntry, d, p) => {
            const key = `${d}-${p}`;
            let group = [...(sectionsMap[key] || [])];
            let headP = p;
            while (headP > 1) {
                const prevE = gridMap[`${d}-${headP - 1}`];
                if (prevE &&
                    prevE.course_code === refEntry.course_code &&
                    prevE.session_type === refEntry.session_type &&
                    prevE.faculty_name === refEntry.faculty_name &&
                    prevE.venue_name === refEntry.venue_name) headP--;
                else break;
            }
            const blockSpan = getBlockSpan(d, headP, refEntry.course_code, refEntry.session_type, refEntry.faculty_name, refEntry.venue_name);
            for (let i = 0; i < blockSpan; i++) {
                const adjKey = `${d}-${headP + i}`;
                const adjEntries = sectionsMap[adjKey] || [];
                adjEntries.forEach(e => {
                    if (e.course_code === refEntry.course_code && e.session_type === refEntry.session_type && !group.includes(e)) {
                        group.push(e);
                    }
                });
            }

            return group;
        };

        const sourceGroup = getSlotEntries(source.entry, source.day, source.period);
        const targetGroup = getSlotEntries(target.entry, target.day, target.period);

        newEntries = newEntries.filter(e => !sourceGroup.includes(e) && !targetGroup.includes(e));

        const sourceStartP = Math.min(...sourceGroup.map(e => e.period_number));
        const targetStartP = Math.min(...targetGroup.map(e => e.period_number));

        const updatedSourceGroup = sourceGroup.map(e => ({
            ...e,
            day_of_week: target.day,
            period_number: targetStartP + (e.period_number - sourceStartP)
        }));

        const updatedTargetGroup = targetGroup.map(e => ({
            ...e,
            day_of_week: source.day,
            period_number: sourceStartP + (e.period_number - targetStartP)
        }));

        const finalEntries = [...newEntries, ...updatedSourceGroup, ...updatedTargetGroup];
        const prevEntries = [...entries];
        setEntries(finalEntries);

        // Conflict check (Fix 7)
        checkConflictsForEntries([...updatedSourceGroup, ...updatedTargetGroup], () => { }, prevEntries);
    };

    const handleCellClick = (day, period, entry = null) => {
        if (isSwapMode) {
            handleSwapClick(day, period, entry);
            return;
        }
        if (isMergeMode) {
            handleMergeClick(day, period);
            return;
        }
        const key = `${day}-${period}`;
        const allSectionsForSlot = sectionsMap[key] || [];

        let initialSpan = 1;
        if (entry) {
            if (isBlockStart(day, period)) {
                initialSpan = getBlockSpan(day, period, entry.course_code, entry.session_type, entry.faculty_name, entry.venue_name);
            } else {
                // If they click on a tail, default to 1 for this individual editor isolated view or maybe re-route to head
                // Re-routing to head makes more sense for UX 
                let headP = period;
                while (headP > 1) {
                    const prevE = gridMap[`${day}-${headP - 1}`];
                    if (prevE &&
                        prevE.course_code === entry.course_code &&
                        prevE.session_type === entry.session_type &&
                        prevE.faculty_name === entry.faculty_name &&
                        prevE.venue_name === entry.venue_name) headP--;
                    else break;
                }
                initialSpan = getBlockSpan(day, headP, entry.course_code, entry.session_type, entry.faculty_name, entry.venue_name);
                // Auto-adjust modal to open the head of the block logically
                handleCellClick(day, headP, gridMap[`${day}-${headP}`]);
                return;
            }
        }

        setEditModalData({
            isOpen: true,
            day,
            period,
            entry,
            allSections: allSectionsForSlot,
            initialSpan,
            initialData: entry ? {
                course_code: entry.course_code,
                course_name: entry.course_name,
                faculty_name: entry.faculty_name,
                venue_name: entry.venue_name || ''
            } : null
        });
    };

    // ─── Merge Mode Logic ───
    const handleMergeClick = (day, period) => {
        const key = `${day}-${period}`;
        const slotEntries = sectionsMap[key] || [];

        if (!mergeSource) {
            // First click: select source
            if (slotEntries.length === 0) {
                alert('Source slot is empty. Select a slot with entries to merge.');
                return;
            }
            setMergeSource({ day, period });
            return;
        }

        // Clicking the same slot deselects
        if (mergeSource.day === day && mergeSource.period === period) {
            setMergeSource(null);
            return;
        }

        // Second click: execute merge into target
        executeMerge(mergeSource, { day, period });
        setMergeSource(null);
    };

    const executeMerge = (source, target) => {
        const sourceKey = `${source.day}-${source.period}`;
        const sourceEntries = sectionsMap[sourceKey] || [];
        const targetKey = `${target.day}-${target.period}`;
        const targetEntries = sectionsMap[targetKey] || [];

        // Collect full source group (including lab adjacent periods)
        let fullSourceEntries = [...sourceEntries];
        sourceEntries.forEach(se => {
            let headP = source.period;
            while (headP > 1) {
                const prevE = gridMap[`${source.day}-${headP - 1}`];
                if (prevE &&
                    prevE.course_code === se.course_code &&
                    prevE.session_type === se.session_type &&
                    prevE.faculty_name === se.faculty_name &&
                    prevE.venue_name === se.venue_name) headP--;
                else break;
            }
            const blockSpan = getBlockSpan(source.day, headP, se.course_code, se.session_type, se.faculty_name, se.venue_name);
            for (let i = 0; i < blockSpan; i++) {
                const adjKey = `${source.day}-${headP + i}`;
                const adjEntries = sectionsMap[adjKey] || [];
                adjEntries.forEach(e => {
                    if (e.course_code === se.course_code && e.session_type === se.session_type && !fullSourceEntries.includes(e)) {
                        fullSourceEntries.push(e);
                    }
                });
            }
        });

        // Guard: max 15 merged entries
        if (targetEntries.length + fullSourceEntries.length > 15) {
            alert(`Cannot merge: would result in ${targetEntries.length + fullSourceEntries.length} entries (max 15).`);
            return;
        }

        pushHistory();

        // Remove source entries from their original position
        let newEntries = entries.filter(e => !fullSourceEntries.includes(e));

        // Move source entries to the target slot
        const movedEntries = fullSourceEntries.map(e => ({
            ...e,
            day_of_week: target.day,
            period_number: target.period + (e.period_number - source.period)
        }));

        const finalEntries = [...newEntries, ...movedEntries];
        const prevEntries = [...entries];
        setEntries(finalEntries);

        // Conflict check globally
        checkConflictsForEntries(movedEntries, () => { }, prevEntries);
    };

    const handleManualSave = (formData, sectionEdits = [], spanCount = 1) => {
        const { day, period, entry, allSections } = editModalData;
        pushHistory();

        // Sanitize faculty names: strip out placeholder/dropdown values
        const cleanFaculty = (name) => {
            if (!name || name.trim() === '') return '';
            const lower = name.trim().toLowerCase();
            if (lower === 'unassigned' || lower.includes('select')) return '';
            return name.trim();
        };

        let currentEntries = [...entries];

        if (sectionEdits.length > 0) {
            // Clean faculty names in section edits
            sectionEdits = sectionEdits.map(s => ({ ...s, faculty_name: cleanFaculty(s.faculty_name) }));

            // Step 1: Remove ALL original entries that were in this slot
            if (allSections && allSections.length > 0) {
                const allSectionSet = new Set(allSections);
                currentEntries = currentEntries.filter(e => !allSectionSet.has(e));
            }

            // Step 2: Re-add only the surviving (non-deleted) sections
            sectionEdits.filter(s => !s._deleted).forEach(s => {
                const base = s._original ? { ...s._original } : {};
                const newEntry = {
                    ...base,
                    department_code: department,
                    semester: parseInt(semester),
                    course_code: s.course_code || 'CUSTOM',
                    course_name: s.course_name || '',
                    session_type: s.session_type || 'THEORY',
                    faculty_id: base.faculty_id || null,
                    faculty_name: s.faculty_name || '',
                    venue_name: s.venue_name || '',
                    slot_id: base.slot_id || 0,
                    day_of_week: day,
                    period_number: period,
                    section_number: s.section_number
                };
                currentEntries.push(newEntry);

                for (let i = 1; i < spanCount; i++) {
                    const nextP = period + i;
                    currentEntries = currentEntries.filter(e =>
                        !(e.day_of_week === day && e.period_number === nextP &&
                            e.course_code === s.course_code && e.section_number === s.section_number)
                    );
                    currentEntries.push({ ...newEntry, period_number: nextP });
                }
            });
        } else {
            // Single-section edit / new entry (original logic)
            const newEntry = {
                department_code: department, semester: parseInt(semester),
                course_code: formData.course_code || 'CUSTOM',
                course_name: formData.course_name,
                session_type: formData.session_type || 'THEORY',
                faculty_id: null,
                faculty_name: cleanFaculty(formData.faculty_name),
                venue_name: formData.venue_name || '',
                slot_id: 0,
                day_of_week: day,
                period_number: period
            };

            if (entry) {
                currentEntries = currentEntries.map(e => {
                    if (e === entry) return { ...e, ...newEntry };
                    if (e.day_of_week === day && e.course_code === entry.course_code && e.session_type === entry.session_type && Math.abs(e.period_number - period) === 1) {
                        return { ...e, ...newEntry, period_number: e.period_number };
                    }
                    return e;
                });
            } else {
                currentEntries = currentEntries.filter(e => !(e.day_of_week === day && e.period_number === period));
                currentEntries.push(newEntry);

                // Place for spanCount universally
                for (let i = 1; i < spanCount; i++) {
                    const nextP = period + i;
                    currentEntries = currentEntries.filter(e => !(e.day_of_week === day && e.period_number === nextP));
                    currentEntries.push({ ...newEntry, period_number: nextP });
                }
            }
        }

        setEntries(currentEntries);
        setEditModalData(null);
    };

    // ═══════════════════════════════════════
    // RENDER (ELEGANT WHITES & PURPLES)
    // ═══════════════════════════════════════
    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={pointerWithin}>
            <div className="flex flex-col h-full bg-white font-sans text-gray-800" style={{ minHeight: '80vh' }}>

                {/* --- NOTIFICATIONS --- */}
                {saveError && (
                    <div className="bg-red-50 border-b border-red-200 px-8 py-3 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-2 text-red-700">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <span className="font-medium text-sm">{saveError}</span>
                        </div>
                        <button onClick={() => setSaveError(null)} className="text-red-400 hover:text-red-600 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}
                {saveSuccess && (
                    <div className="bg-emerald-50 border-b border-emerald-200 px-8 py-3 flex items-center shadow-sm">
                        <div className="flex items-center gap-2 text-emerald-700">
                            <CheckCircle className="w-5 h-5 flex-shrink-0" />
                            <span className="font-medium text-sm">Timetable saved successfully!</span>
                        </div>
                    </div>
                )}
                {/* ─── TOOLBAR ─── */}
                <div className="flex items-center justify-between px-8 py-4 bg-white border-b border-gray-100 shadow-sm flex-shrink-0 z-20">
                    <div className="flex items-center gap-5">
                        <div className="flex items-center gap-3 bg-white rounded-xl px-5 py-2.5 border border-violet-100 shadow-sm ring-1 ring-violet-50">
                            <span className="text-lg font-bold text-gray-800 tracking-tight">{department}</span>
                            <span className="text-violet-200 h-5 w-px bg-violet-200"></span>
                            <span className="text-base font-medium text-gray-500">Sem {semester}</span>
                        </div>
                        <LearningModeSelector 
                            department={department}
                            semester={semester}
                            selectedModes={localLearningModes}
                            onModesChange={(newModes) => {
                                // LearningModeSelector passes the full updated array;
                                // find which id was toggled and pass it to handleModeSwitch
                                const added = newModes.find(id => !localLearningModes.includes(id));
                                const removed = localLearningModes.find(id => !newModes.includes(id));
                                if (added !== undefined) handleModeSwitch(added);
                                else if (removed !== undefined) handleModeSwitch(removed);
                            }}
                            className="scale-95"
                        />
                        <div className="h-6 w-px bg-gray-200 mx-2 hidden md:block"></div>
                        <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all hover:-translate-y-0.5 active:scale-95 disabled:bg-gray-400">
                            <Save className="w-4 h-4" /> Save Changes
                        </button>
                        {/* View Options (Fix 6) */}
                        <div className="flex items-center gap-3 bg-white p-2 border border-gray-200 rounded-lg shadow-sm text-xs">
                            <span className="font-semibold text-gray-500 flex items-center gap-1 pr-2 border-r border-gray-200">
                                <Eye className="w-3.5 h-3.5" /> View:
                            </span>
                            <label className="flex items-center gap-1.5 cursor-pointer hover:text-violet-600 transition-colors">
                                <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} className="rounded text-violet-600 focus:ring-violet-500 cursor-pointer" />
                                Labels
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer hover:text-violet-600 transition-colors">
                                <input type="checkbox" checked={showCourseCode} onChange={e => setShowCourseCode(e.target.checked)} className="rounded text-violet-600 focus:ring-violet-500 cursor-pointer" />
                                Codes
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer hover:text-violet-600 transition-colors">
                                <input type="checkbox" checked={showFaculty} onChange={e => setShowFaculty(e.target.checked)} className="rounded text-violet-600 focus:ring-violet-500 cursor-pointer" />
                                Faculty
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer hover:text-violet-600 transition-colors">
                                <input type="checkbox" checked={showVenues} onChange={e => setShowVenues(e.target.checked)} className="rounded text-violet-600 focus:ring-violet-500 cursor-pointer" />
                                Venues
                            </label>
                        </div>
                    </div>
                </div>

                {/* ─── FLOATING ACTION BAR (RIGHT) ─── */}
                <div className="fixed right-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-50">
                    <button onClick={undo} disabled={history.length === 0} title="Undo"
                        className={`p-3 rounded-full shadow-lg transition-all transform hover:scale-110 ${history.length ? 'bg-white text-gray-700 hover:text-gray-900 border border-gray-200' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}>
                        <Undo2 className="w-5 h-5" />
                    </button>

                    <button onClick={() => { setIsSwapMode(!isSwapMode); setSwapSource(null); setIsMergeMode(false); setMergeSource(null); }} title={isSwapMode ? "Exit Swap Mode" : "Swap Slots"}
                        className={`p-3 rounded-full shadow-lg transition-all transform hover:scale-110 ${isSwapMode ? 'bg-fuchsia-600 text-white ring-4 ring-fuchsia-200' : 'bg-white text-fuchsia-600 border border-gray-200 hover:bg-fuchsia-50'}`}>
                        <ArrowLeftRight className="w-5 h-5" />
                    </button>

                    <button onClick={() => { setIsMergeMode(!isMergeMode); setMergeSource(null); setIsSwapMode(false); setSwapSource(null); }} title={isMergeMode ? "Exit Merge Mode" : "Merge Slots"}
                        className={`p-3 rounded-full shadow-lg transition-all transform hover:scale-110 ${isMergeMode ? 'bg-teal-600 text-white ring-4 ring-teal-200' : 'bg-white text-teal-600 border border-gray-200 hover:bg-teal-50'}`}>
                        <Merge className="w-5 h-5" />
                    </button>

                    <button onClick={() => { pushHistory(); setEntries([]); }} title="Clear Timetable"
                        className="p-3 bg-white text-rose-500 rounded-full border border-gray-200 shadow-lg hover:bg-rose-50 hover:text-rose-600 transition-all transform hover:scale-110">
                        <Trash2 className="w-5 h-5" />
                    </button>

                    {onExportPDF && (
                        <button onClick={() => onExportPDF(entries)} title="Export PDF"
                            className="p-3 bg-white text-violet-600 rounded-full border border-gray-200 shadow-lg hover:bg-violet-50 hover:text-violet-700 transition-all transform hover:scale-110">
                            <Download className="w-5 h-5" />
                        </button>
                    )}

                    <button onClick={handleSave} title="Save Timetable"
                        className="p-3 bg-violet-600 text-white rounded-full shadow-xl shadow-violet-300 hover:bg-violet-700 transition-all transform hover:scale-110 hover:shadow-violet-400">
                        <Save className="w-5 h-5" />
                    </button>
                </div>



                {/* ─── MODE BANNERS ─── */}
                {isSwapMode && (
                    <div className="px-8 py-3 bg-fuchsia-50 border-b border-fuchsia-200 flex items-center gap-2 text-sm font-bold text-fuchsia-700">
                        <ArrowLeftRight className="w-4 h-4" /> SWAP MODE — {swapSource ? `Source: ${swapSource.day} P${swapSource.period}. Click target slot to swap.` : 'Click the first slot to swap.'}
                    </div>
                )}
                {isMergeMode && (
                    <div className="px-8 py-3 bg-teal-50 border-b border-teal-200 flex items-center gap-2 text-sm font-bold text-teal-700">
                        <Merge className="w-4 h-4" /> MERGE MODE — {mergeSource ? `Source: ${mergeSource.day} P${mergeSource.period}. Click target slot to merge into.` : 'Click the first slot to merge from.'}
                    </div>
                )}

                {/* ─── TIMETABLE GRID (SMOOTH) ─── */}
                <div className="flex-1 overflow-auto p-10 bg-gray-50/50">
                    <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-auto ring-1 ring-gray-50 mx-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-white border-b border-gray-200 text-gray-900">
                                    <th className="py-5 px-6 text-left text-xs font-bold uppercase tracking-widest border-r border-gray-100 w-32">Day</th>
                                    {periodColumns.filter(col => col.type === 'PERIOD').map((col) => (
                                        <th key={`h-${col.period}`} className="py-4 px-3 text-center border-r border-gray-100 last:border-r-0 min-w-[220px]">
                                            <div className="text-[10px] font-black text-gray-400 tracking-widest mb-1 uppercase">Period {col.period}</div>
                                            <div className="text-[11px] font-medium text-gray-600 font-mono tracking-tight bg-gray-50 rounded-full px-2 py-0.5 inline-block border border-gray-200">{col.start} – {col.end}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {activeDays.map((day, dayIdx) => {
                                    let skipCount = 0;

                                    return (
                                        <tr key={day} className={`border-b border-gray-50 last:border-b-0 hover:bg-slate-50/50 transition-colors duration-300 ${dayIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                                            <td className="py-6 px-6 font-bold text-xs text-gray-500 border-r border-gray-100 bg-gray-50/50 uppercase tracking-widest">{day.slice(0, 3)}</td>
                                            {periodColumns.filter(col => col.type === 'PERIOD').map((col, colIdx) => {
                                                if (skipCount > 0) { skipCount--; return null; }

                                                const p = col.period;
                                                const key = `${day}-${p}`;
                                                const entry = gridMap[key];

                                                const isBlockStartP = isBlockStart(day, p);
                                                let cellSpan = 1;

                                                if (isBlockStartP && entry) {
                                                    cellSpan = getBlockSpan(day, p, entry.course_code, entry.session_type, entry.faculty_name, entry.venue_name);
                                                    skipCount = cellSpan - 1;
                                                }

                                                return (
                                                    <DroppableGridCellSpan
                                                        key={key}
                                                        id={key}
                                                        colSpan={cellSpan}
                                                        entry={entry}
                                                        sections={sectionsMap[key]}
                                                        isLabStart={isBlockStartP}
                                                        onDelete={() => handleDeleteEntry(day, p)}
                                                        isSwapMode={isSwapMode || isMergeMode}
                                                        isSelected={
                                                            (swapSource?.day === day && Math.abs(swapSource?.period - p) < (entry?.session_type === 'LAB' ? 2 : 1)) ||
                                                            (mergeSource?.day === day && mergeSource?.period === p)
                                                        }
                                                        onCellClick={() => handleCellClick(day, p, entry)}
                                                        showCourseCode={showCourseCode}
                                                        showFaculty={showFaculty}
                                                        showVenues={showVenues}
                                                        showLabels={showLabels}
                                                        allCourses={allCourses}
                                                    />
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {/* Elegant Legend */}
                    <Legend />
                </div>
            </div>

            {/* ─── DRAG OVERLAY (ELEGANT) ─── */}
            <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
                {draggedItem ? (
                    <div className={`px-5 py-4 rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] border-2 transform scale-105 backdrop-blur-xl ${draggedItem.type === 'new'
                        ? (draggedItem.course.is_lab ? 'bg-amber-50/90 border-amber-400 text-amber-900' : 'bg-blue-50/90 border-blue-400 text-blue-900')
                        : (draggedItem.entry.session_type === 'LAB' ? 'bg-amber-50/90 border-amber-400 text-amber-900' : 'bg-blue-50/90 border-blue-400 text-blue-900')
                        } flex flex-col items-center justify-center min-w-[160px]`}>

                        <div className="font-bold text-sm tracking-tight flex items-center justify-center gap-1.5 w-full">
                            {(draggedItem.type === 'new' ? draggedItem.course.is_lab : draggedItem.entry.session_type === 'LAB')
                                ? <FlaskConical className="w-4 h-4 text-amber-700/80" />
                                : <BookOpen className="w-4 h-4 opacity-50" />}
                            {draggedItem.type === 'new' ? draggedItem.course.course_code : draggedItem.entry.course_code}
                        </div>

                        <div className="text-[10px] opacity-80 font-medium mt-1 tracking-wide text-center">
                            {draggedItem.type === 'new' ? draggedItem.course.course_name : (draggedItem.entry.course_name || '')}
                        </div>

                        {(draggedItem.type === 'new' ? draggedItem.venueName : draggedItem.entry.venue_name) && (
                            <div className="text-[9px] font-bold mt-2 text-indigo-700 bg-indigo-50/90 px-2 py-0.5 rounded border border-indigo-200 shadow-sm text-center">
                                {draggedItem.type === 'new' ? draggedItem.venueName : draggedItem.entry.venue_name}
                            </div>
                        )}

                        {(draggedItem.type === 'new' ? draggedItem.course.is_lab : draggedItem.entry.session_type === 'LAB') && (
                            <span className="text-[9px] font-bold opacity-70 block mt-1 tracking-wider uppercase text-amber-800 text-center">
                                2 Periods
                            </span>
                        )}

                    </div>
                ) : null}
            </DragOverlay>

            <ManualEntryModal
                isOpen={editModalData?.isOpen}
                onClose={() => setEditModalData(null)}
                onSave={handleManualSave}
                initialData={editModalData?.initialData}
                allSections={editModalData?.allSections}
                initialSpan={editModalData?.initialSpan}
                allCourses={allCourses}
                department={department}
                semester={semester}
                day={editModalData?.day}
                period={editModalData?.period}
                gridMap={gridMap}
                validPeriods={validPeriods}
            />
        </DndContext >
    );
}
