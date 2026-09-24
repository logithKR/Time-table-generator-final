import React, { useState, useEffect } from 'react';
import {
    LayoutDashboard,
    BookOpen,
    Users,
    GraduationCap,
    Clock,
    Calendar,
    Menu,
    X,
    Plus,
    Trash2,
    Edit2,
    Check,
    ChevronDown,
    RotateCw,
    Monitor,
    Download,
    FileSpreadsheet,
    Share2,
    Layers,
    Filter,
    Pencil,
    ChevronLeft,
    ChevronRight,
    Search,
    MapPin,
    Building2,
    LogOut,
    Settings,
    Link2,
    Info,
    AlertCircle,
    AlertTriangle,
    Bell
} from 'lucide-react';
import TimetableEditor from './components/TimetableEditor';
import ConstraintsManager from './components/ConstraintsManager';
import UserConstraints from './components/UserConstraints';

import Venues from './components/Venues';
import VenueMapping from './components/VenueMapping';
import DepartmentsManager from './components/DepartmentsManager';
import StudentRegistrations from './components/StudentRegistrations';
import FacultyTimetable from './components/FacultyTimetable';
import StudentTimetable from './components/StudentTimetable';
import BITTimetable from './components/BITTimetable';
import VenueTimetable from './components/VenueTimetable';
import LoginPage from './components/LoginPage';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import LearningModeSelector from './components/LearningModeSelector';
import DashboardOverrides from './components/DashboardOverrides';
import { useAuth } from './contexts/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as api from './utils/api';
import { formatTime } from './utils/timeFormat';

function App() {
    // --- Routing & Admin Guard ---
    const [currentHash, setCurrentHash] = useState(window.location.hash || '#/');
    useEffect(() => {
        const onHashChange = () => setCurrentHash(window.location.hash || '#/');
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    // --- Authentication Gate ---
    const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [activeTab, setActiveTab] = useState('dashboard');

    // Master Data
    const [departments, setDepartments] = useState([]);
    const [semesters, setSemesters] = useState([]);
    const [slots, setSlots] = useState([]);
    const [breakConfigs, setBreakConfigs] = useState([]);

    // Data pages
    const [allCourses, setAllCourses] = useState([]);
    const [allFaculty, setAllFaculty] = useState([]);
    const [courseFacultyMappings, setCourseFacultyMappings] = useState([]);

    // Filters for data pages
    const [filterDept, setFilterDept] = useState('');
    const [filterSem, setFilterSem] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [slotFilterSem, setSlotFilterSem] = useState('');

    // Show/hide add forms
    const [showAddCourse, setShowAddCourse] = useState(false);
    const [editingCourse, setEditingCourse] = useState(null);
    const [newCourseIsHonoursOrMinor, setNewCourseIsHonoursOrMinor] = useState(false);
    const [newCourseCommonDepts, setNewCourseCommonDepts] = useState([]);
    const [showAddFaculty, setShowAddFaculty] = useState(false);
    const [showAddMapping, setShowAddMapping] = useState(false);
    const [editorDept, setEditorDept] = useState('');
    const [editorSem, setEditorSem] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [editingSlotId, setEditingSlotId] = useState(null);
    const [editingSlotData, setEditingSlotData] = useState({});
    const [showAddSlot, setShowAddSlot] = useState(false);
    
    // Break timings state
    const [editingBreakId, setEditingBreakId] = useState(null);
    const [editingBreakData, setEditingBreakData] = useState({});
    const [showAddBreak, setShowAddBreak] = useState(false);

    // Semester Config state
    const [semesterConfigs, setSemesterConfigs] = useState([]);

    // Lookups
    const [coursesMap, setCoursesMap] = useState({});
    const [facultyMap, setFacultyMap] = useState({});

    // Selection State (dashboard)
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedSem, setSelectedSem] = useState('');
    const [mentorDay, setMentorDay] = useState('Friday');
    const [mentorPeriod, setMentorPeriod] = useState(7);
    const [lockedSlots, setLockedSlots] = useState([]);
    const [selectedLearningModes, setSelectedLearningModes] = useState([1, 2]); // 1: UAL, 2: PBL

    const [timetableEntries, setTimetableEntries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [syncingCms, setSyncingCms] = useState(false);
    
    // Generation Feedback
    const [generationErrors, setGenerationErrors] = useState(null);
        const [generationWarnings, setGenerationWarnings] = useState([]);
    const [isWarningsPanelOpen, setIsWarningsPanelOpen] = useState(false);

    
    // Conflict Detection
    const [detectedConflicts, setDetectedConflicts] = useState({ faculty_conflicts: [], venue_conflicts: [] });

    // Display Toggles
    const [showLabels, setShowLabels] = useState(true);
    const [showCourseCode, setShowCourseCode] = useState(true);
    const [showFaculty, setShowFaculty] = useState(true);
    const [showVenues, setShowVenues] = useState(true);

    // Clear locked slots when department or semester selection changes
    useEffect(() => {
        setLockedSlots([]);
    }, [selectedDept, selectedSem]);

    useEffect(() => { 
        if (isAuthenticated) {
            fetchMasterData(); 
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (isAuthenticated) {
            if (activeTab === 'subjects') fetchCourses();
            if (activeTab === 'faculty') fetchFaculty();
            if (activeTab === 'mappings') fetchCourseFacultyMappings();
        }
    }, [activeTab, filterDept, filterSem, isAuthenticated]);

    const fetchMasterData = async () => {
        try {
            const [d, s, sl, brks, sConf] = await Promise.all([api.getDepartments(), api.getSemesters(), api.getSlots(), api.getBreaks(), api.getSemesterConfigs()]);
            setDepartments(d.data);
            setSemesters(s.data);
            setSlots(sl.data);
            setBreakConfigs(brks.data);
            setSemesterConfigs(sConf.data);
        } catch (err) { console.error("Failed to load master data", err); }
    };

    const fetchCourses = async () => {
        try { setAllCourses((await api.getCourses(filterDept || null, filterSem ? parseInt(filterSem) : null)).data); }
        catch (err) { console.error(err); }
    };
    const fetchFaculty = async () => {
        try { setAllFaculty((await api.getFaculty(filterDept || null)).data); }
        catch (err) { console.error(err); }
    };
    const fetchCourseFacultyMappings = async () => {
        try { setCourseFacultyMappings((await api.getCourseFaculty(filterDept || null)).data); }
        catch (err) { console.error(err); }
    };

    // --- CRUD Handlers ---
    const handleAddCourse = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
            course_code: fd.get('course_code'),
            course_name: fd.get('course_name'),
            department_code: fd.get('department_code'),
            semester: parseInt(fd.get('semester')),
            lecture_hours: parseInt(fd.get('lecture_hours') || '0'),
            tutorial_hours: parseInt(fd.get('tutorial_hours') || '0'),
            practical_hours: parseInt(fd.get('practical_hours') || '0'),
            credits: parseInt(fd.get('credits') || '0'),
            weekly_sessions: parseInt(fd.get('weekly_sessions') || '1'),
            is_lab: fd.get('is_lab') === 'on',
            is_honours: fd.get('is_honours') === 'on',
            is_minor: fd.get('is_minor') === 'on',
            is_elective: fd.get('is_elective') === 'on',
            is_add_course: fd.get('is_add_course') === 'on',
            common_departments: newCourseCommonDepts
        };
        try {
            await api.createCourse(data);
            setShowAddCourse(false);
            setNewCourseIsHonoursOrMinor(false);
            setNewCourseCommonDepts([]);
            fetchCourses();
            fetchMasterData();
            e.target.reset();
        } catch (err) { alert(api.getErrorMessage(err)); }
    };

    const handleUpdateCourse = async (e, originalCode) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
            course_code: fd.get('course_code'),
            course_name: fd.get('course_name'),
            department_code: fd.get('department_code'),
            semester: parseInt(fd.get('semester')),
            lecture_hours: parseInt(fd.get('lecture_hours') || '0'),
            tutorial_hours: parseInt(fd.get('tutorial_hours') || '0'),
            practical_hours: parseInt(fd.get('practical_hours') || '0'),
            credits: parseInt(fd.get('credits') || '0'),
            weekly_sessions: parseInt(fd.get('weekly_sessions') || '1'),
            is_lab: fd.get('is_lab') === 'on',
            is_honours: fd.get('is_honours') === 'on',
            is_minor: fd.get('is_minor') === 'on',
            is_elective: fd.get('is_elective') === 'on',
            is_add_course: fd.get('is_add_course') === 'on',
            common_departments: newCourseCommonDepts
        };
        try {
            await api.updateCourse(originalCode, data);
            setEditingCourse(null);
            setNewCourseIsHonoursOrMinor(false);
            setNewCourseCommonDepts([]);
            fetchCourses();
            fetchMasterData();
        } catch (err) { alert(api.getErrorMessage(err)); }
    };

    const handleDeleteCourse = async (code) => {
        if (!confirm(`Delete course ${code}? This also removes faculty mappings.`)) return;
        try { await api.deleteCourse(code); fetchCourses(); }
        catch (err) { alert(api.getErrorMessage(err)); }
    };

    const handleAddFaculty = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
            faculty_id: fd.get('faculty_id'),
            faculty_name: fd.get('faculty_name'),
            faculty_email: fd.get('faculty_email') || null,
            department_code: fd.get('department_code'),
            status: 'Active',
        };
        try {
            await api.createFaculty(data);
            setShowAddFaculty(false);
            fetchFaculty();
            e.target.reset();
        } catch (err) { alert(api.getErrorMessage(err)); }
    };

    const handleDeleteFaculty = async (fid) => {
        if (!confirm(`Delete faculty ${fid}? This also removes their course mappings.`)) return;
        try { await api.deleteFaculty(fid); fetchFaculty(); }
        catch (err) { alert(api.getErrorMessage(err)); }
    };

    const handleAddMapping = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
            course_code: fd.get('course_code'),
            faculty_id: fd.get('faculty_id'),
            department_code: fd.get('department_code'),
            delivery_type: fd.get('delivery_type') || 'Theory',
        };
        try {
            await api.createCourseFaculty(data);
            setShowAddMapping(false);
            fetchCourseFacultyMappings();
            e.target.reset();
        } catch (err) { alert(api.getErrorMessage(err)); }
    };

    const handleDeleteMapping = async (mid) => {
        if (!confirm('Remove this faculty-course mapping?')) return;
        try { await api.deleteCourseFaculty(mid); fetchCourseFacultyMappings(); }
        catch (err) { alert(api.getErrorMessage(err)); }
    };

    // --- Timetable Generation ---
    const fetchTimetable = async () => {
        if (!selectedDept || !selectedSem) return;
        try {
            const modeIdsStr = selectedLearningModes.sort().join(',');
            const t_res = await api.getTimetable(selectedDept, parseInt(selectedSem), modeIdsStr);
            setTimetableEntries(t_res.data);
            const c_res = await api.getCourses(selectedDept, parseInt(selectedSem));
            setAllCourses(c_res.data); // IMPORTANT: sets allCourses for badge checks
            const c_map = {}; c_res.data.forEach(c => c_map[c.course_code] = c.course_name); setCoursesMap(c_map);
            const f_res = await api.getFaculty(selectedDept);
            const f_map = {}; f_res.data.forEach(f => f_map[f.faculty_id] = f.faculty_name); setFacultyMap(f_map);
        } catch (err) {
            console.error("Failed to fetch timetable data:", err);
            setTimetableEntries([]);
            setCoursesMap({});
            setFacultyMap({});
        }
    };

    const handleGenerate = async () => {
        if (!selectedDept || !selectedSem) { alert("Please select Department and Semester!"); return; }
        setLoading(true);
        setGenerationErrors(null);
        setGenerationWarnings([]);
        
        try {
            const res = await api.generateTimetable({
                department_code: selectedDept, semester: parseInt(selectedSem),
                mentor_day: mentorDay, mentor_period: parseInt(mentorPeriod),
                learning_mode_ids: selectedLearningModes,
                locked_slots: lockedSlots
            });
            
            if (res.data.status === 'success') {
                                if (res.data.warnings && res.data.warnings.length > 0) {
                    setGenerationWarnings(res.data.warnings);
                    setIsWarningsPanelOpen(true);
                } else {
                    alert('Timetable Generated Successfully!');
                }
                fetchTimetable();
                setRefreshTrigger(prev => prev + 1);
            }
        } catch (err) {
            const status = err.response?.status;
            const dept = selectedDept;
            const sem = selectedSem;

            // Handle HTTP 403 (Finalized timetable)
            if (status === 403) {
                setGenerationErrors({
                    message: "Timetable Locked",
                    errors: [{ message: `The timetable for ${dept} Semester ${sem} is finalized and locked by an admin. Go to Admin Dashboard ? Timetable Management ? click the Unlock icon to unfinalize it, then try generating again.` }],
                    warnings: []
                });
            }
            // Handle HTTP 422 (Hard Constraint Stop)
            else if (status === 422 && err.response?.data?.detail?.errors) {
                setGenerationErrors({
                    message: err.response.data.detail.message || "Constraint Violation",
                    errors: err.response.data.detail.errors,
                    warnings: err.response.data.detail.warnings || []
                });
            }
            // Handle HTTP 400 (Bad Request - no courses, etc.)
            else if (status === 400) {
                setGenerationErrors({
                    message: "Cannot Generate Timetable",
                    errors: [{ message: api.getErrorMessage(err) || `Generation failed for ${dept} Semester ${sem}. Please verify that courses, faculty, and venues are properly configured.` }],
                    warnings: []
                });
            }
            // Handle HTTP 500 (Server error)
            else if (status >= 500) {
                setGenerationErrors({
                    message: "Server Error",
                    errors: [{ message: `The server encountered an error while generating the timetable for ${dept} Semester ${sem}. Error: ${api.getErrorMessage(err)}` }],
                    warnings: []
                });
            }
            // Handle Network Error
            else if (err.message === 'Network Error') {
                setGenerationErrors({
                    message: "Connection Failed",
                    errors: [{ message: "Cannot connect to the backend server. Please make sure the server is running (node server.js) on port 8000." }],
                    warnings: []
                });
            }
            // Fallback
            else {
                setGenerationErrors({
                    message: "Generation Failed",
                    errors: [{ message: api.getErrorMessage(err) || "An unexpected error occurred." }],
                    warnings: []
                });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSyncCms = async () => {
        setSyncingCms(true);
        try {
            await api.syncCmsData();
            
            // Start polling for status
            const intervalId = setInterval(async () => {
                try {
                    const statusRes = await api.getSyncStatus();
                    const state = statusRes.data;
                    
                    if (state.status === "complete") {
                        clearInterval(intervalId);
                        setSyncingCms(false);
                        alert('CMS Data Synchronized successfully!');
                    } else if (state.status === "error") {
                        clearInterval(intervalId);
                        setSyncingCms(false);
                        alert('Failed to sync CMS data: ' + state.error);
                    }
                    // if "syncing", just continue polling
                } catch (pollErr) {
                    clearInterval(intervalId);
                    setSyncingCms(false);
                    console.error("Polling error:", pollErr);
                }
            }, 2000);
            
        } catch (err) {
            setSyncingCms(false);
            alert('Failed to start CMS sync: ' + (api.getErrorMessage(err) || 'Cannot connect to CMS. Check network and try again.'));
        }
    };

    // --- NEW HELPER: Fetch Data for Print View (Supports Master View) ---
    const fetchPrintData = async (dept, sem, modesStr = '') => {
        setLoading(true);
        try {
            const d = dept || '';
            const s = sem || '';
            const modes = modesStr || selectedLearningModes.sort().join(',');
            
            // Fetch timetable entries and conflicts in parallel
            const [entryRes, conflictRes] = await Promise.all([
                api.getTimetableEntries(d, s, modes),
                api.getConflicts(d, s)
            ]);
            
            setTimetableEntries(entryRes.data);
            setDetectedConflicts(conflictRes.data || { faculty_conflicts: [], venue_conflicts: [] });
            
            if (d && s) {
                const c_res = await api.getCourses(d, parseInt(s));
                setAllCourses(c_res.data);
            } else {
                const dep_res = await api.getDepartments();
                // To support master view accurately, we could fetch all courses. For now just fetch a simple list.
                const all_c = await api.getCourses('', ''); // assuming backend supports empty GET params or just skips
                if (all_c && all_c.data) setAllCourses(all_c.data);
            }
            setEditorDept(d);
            setEditorSem(s);
            setActiveTab('print');
        } catch (e) {
            console.error("Print Load Error:", e);
            // Silently handle — show empty state instead of alert
            setTimetableEntries([]);
            setDetectedConflicts({ faculty_conflicts: [], venue_conflicts: [] });
        } finally {
            setLoading(false);
        }
    };

    // --- UPDATED: Handle PDF Download (Entry Point) ---
    const handleDownloadPDF = () => {
        if (activeTab === 'editor') {
            if (!confirm("Switching to Print View. Unsaved changes in Editor will be lost. Proceed?")) return;
        }
        fetchPrintData(selectedDept, selectedSem);
    };

    const handleDownloadExcel = async () => {
        try {
            const res = await api.exportTimetableExcel(selectedDept, selectedSem);
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `timetable_${selectedDept || 'all'}_${selectedSem || 'all'}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch (err) {
            console.error("Excel Export Error:", err);
            alert("Failed to export Excel for " + selectedDept + " Semester " + selectedSem + ": " + (api.getErrorMessage(err) || "Unknown error. Check if the backend is running."));
        }
    };

    // --- Timetable Render ---
    const renderTimetable = () => {
        if (!timetableEntries.length && !loading) return <div className="text-center p-10 text-gray-500">No timetable generated yet. Select criteria and click Generate.</div>;
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        if (slots.some(s => s.day_of_week === 'Saturday')) days.push('Saturday');
        const maxPeriod = Math.max(...slots.map(s => s.period_number), 0);
        const periods = Array.from({ length: maxPeriod }, (_, i) => i + 1);

        const getEntriesForSlot = (day, p) => timetableEntries.filter(t => t.day_of_week === day && t.period_number === p);

        const isLabStart = (day, p) => {
            const currentEntries = getEntriesForSlot(day, p);
            const nextEntries = getEntriesForSlot(day, p + 1);
            if (!currentEntries.length || !nextEntries.length) return false;
            // Check if any current lab entry continues into the next period
            return currentEntries.some(curr => curr.session_type === 'LAB' && nextEntries.some(next => next.course_code === curr.course_code && next.session_type === 'LAB'));
        };
        const isLabEnd = (day, p) => {
            const prevEntries = getEntriesForSlot(day, p - 1);
            const currentEntries = getEntriesForSlot(day, p);
            if (!prevEntries.length || !currentEntries.length) return false;
            return currentEntries.some(curr => curr.session_type === 'LAB' && prevEntries.some(prev => prev.course_code === curr.course_code && prev.session_type === 'LAB'));
        };

        const getCourseBadge = (courseCode) => {
            const course = allCourses.find(c => c.course_code === courseCode);
            if (!course) return null;
            if (course.is_honours) return <span className="text-[8px] bg-purple-100 text-purple-700 px-1 rounded shadow-sm font-semibold border border-purple-200 uppercase tracking-wider">Honours</span>;
            if (course.is_minor) return <span className="text-[8px] bg-indigo-100 text-indigo-700 px-1 rounded shadow-sm font-semibold border border-indigo-200 uppercase tracking-wider">Minor</span>;
            if (course.is_elective) return <span className="text-[8px] bg-green-100 text-green-700 px-1 rounded shadow-sm font-semibold border border-green-200 uppercase tracking-wider">Elective</span>;
            if (course.is_add_course) return <span className="text-[8px] bg-amber-100 text-amber-700 px-1 rounded shadow-sm font-semibold border border-amber-200 uppercase tracking-wider">Add Course</span>;
            return null;
        };

        return (
            <div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <div className="flex gap-4 text-xs">
                        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded" style={{ backgroundColor: '#FEF9C3' }}></span> Lab (2 periods)</span>
                        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded" style={{ backgroundColor: '#BFDBFE' }}></span> Mentor Hour</span>
                        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded" style={{ backgroundColor: '#F3F4F6' }}></span> Open Elective</span>
                    </div>

                    {/* Display Options Toggles */}
                    <div className="flex flex-wrap gap-3 bg-white p-2 border border-gray-200 rounded-lg shadow-sm text-xs">
                        <span className="font-semibold text-gray-600 flex items-center pr-2 border-r border-gray-200">View Options:</span>
                        <label className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600 transition-colors">
                            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />
                            Labels
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600 transition-colors">
                            <input type="checkbox" checked={showCourseCode} onChange={(e) => setShowCourseCode(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />
                            Codes
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600 transition-colors">
                            <input type="checkbox" checked={showFaculty} onChange={(e) => setShowFaculty(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />
                            Faculty
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600 transition-colors">
                            <input type="checkbox" checked={showVenues} onChange={(e) => setShowVenues(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />
                            Venues
                        </label>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border-collapse border border-gray-300 text-xs shadow-sm rounded-lg overflow-hidden">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="p-2 border border-gray-300 text-left font-bold w-24 sticky left-0 bg-gray-100 z-10">Day</th>
                                {periods.map(p => {
                                    const slot = slots.find(s => s.period_number === p && s.day_of_week === 'Monday');
                                    return (<th key={p} className="p-2 border border-gray-300 text-center font-bold min-w-[110px]"><div>Period {p}</div><div className="text-[10px] text-gray-500 font-normal">{slot ? `${slot.start_time} - ${slot.end_time} ` : ''}</div></th>);
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {days.map(day => {
                                const cells = []; let skipNext = false;
                                periods.forEach(p => {
                                    if (skipNext) { skipNext = false; return; }
                                    const isValidSlot = slots.some(s => s.day_of_week === day && s.period_number === p);
                                    if (!isValidSlot) { cells.push(<td key={p} className="p-2 border border-gray-300 bg-gray-200"></td>); return; }

                                    const cellEntries = getEntriesForSlot(day, p);

                                    if (isLabStart(day, p)) {
                                        skipNext = true;
                                        const labEntries = cellEntries.filter(e => e.session_type === 'LAB');
                                        const uniqueLabCodes = [...new Set(labEntries.map(e => e.course_code))];
                                        cells.push(
                                            <td key={p} colSpan={2} className="p-0 border border-gray-300 text-center align-middle hover:bg-amber-100 transition-colors" style={{ backgroundColor: '#FEF9C3' }}>
                                                <div className="flex flex-col min-h-[80px]">
                                                    {uniqueLabCodes.map((code, idx) => {
                                                        const groupEntries = labEntries.filter(e => e.course_code === code);
                                                        const groupName = groupEntries[0]?.course_name || '';

                                                        return (
                                                            <div key={idx} className={`p-2 flex flex-col justify-center flex-grow ${idx > 0 ? 'border-t border-amber-300' : ''}`}>
                                                                <div className="font-bold text-amber-900 text-[11px] leading-tight flex justify-center items-center gap-1 flex-wrap">
                                                                    {showCourseCode && <span>{code}</span>}
                                                                    {showLabels && getCourseBadge(code)}
                                                                </div>
                                                                <div className="text-[10px] text-amber-800 font-medium leading-tight my-0.5">{groupName}</div>

                                                                {groupEntries.length > 1 ? (
                                                                    <div className="mt-1 flex flex-col gap-0.5 pt-1">
                                                                        {groupEntries.map((e, sIdx) => (
                                                                            <div key={sIdx} className="text-[9px] text-amber-700 italic leading-tight whitespace-nowrap">
                                                                                {showFaculty && e.faculty_name && e.faculty_name !== 'Unassigned' && <>{e.faculty_name}</>}
                                                                                {showVenues && e.venue_name && <span className="ml-1 px-1 rounded bg-amber-200 border border-amber-300 font-bold text-amber-900 whitespace-nowrap">{e.venue_name}</span>}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        {showFaculty && groupEntries[0]?.faculty_name && groupEntries[0]?.faculty_name !== 'Unassigned' && <div className="text-[10px] text-amber-700 mt-0.5 italic whitespace-nowrap">{groupEntries[0].faculty_name}</div>}
                                                                        {showVenues && groupEntries[0]?.venue_name && <div className="text-[8.5px] px-1 rounded border border-amber-300 bg-amber-200 font-bold text-amber-900 mt-0.5 mx-auto w-fit whitespace-nowrap">{groupEntries[0].venue_name}</div>}
                                                                    </>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                        );
                                        return;
                                    }

                                    if (isLabEnd(day, p)) return;
                                    if (!cellEntries.length) { cells.push(<td key={p} className="p-2 border border-gray-300 text-center text-gray-300">-</td>); return; }

                                    const primaryEntry = cellEntries[0];

                                    if (primaryEntry.session_type === 'MENTOR') {
                                        cells.push(<td key={p} className="p-2 border border-gray-300 text-center align-middle h-20" style={{ backgroundColor: '#BFDBFE' }}><div className="flex flex-col justify-center h-full"><div className="font-bold text-blue-900 text-sm">MENTOR</div><div className="text-xs text-blue-700 mt-1">INTERACTION</div></div></td>);
                                        return;
                                    }
                                    if (primaryEntry.session_type === 'OPEN_ELECTIVE') {
                                        cells.push(<td key={p} className="p-2 border border-gray-300 text-center align-middle h-20 bg-gray-100"><div className="flex flex-col justify-center h-full"><div className="font-bold text-gray-600 text-xs">OPEN</div><div className="text-xs text-gray-500">ELECTIVE</div></div></td>);
                                        return;
                                    }

                                    // ── HONOURS / MINOR: treat as regular split sections (same as paired electives) ──
                                    // No special rendering needed — fall through to standard renderCourseBlock below.
                                    // HONOURS and MINOR session_types show with their respective course badges.

                                    // Separate regular courses from explicit OE slots
                                    const explicitOEEntries = cellEntries.filter(e => e.session_type === 'OPEN_ELECTIVE' || e.course_code === 'OPEN_ELEC' || allCourses.find(c => c.course_code === e.course_code)?.is_open_elective);
                                    const regularEntries = cellEntries.filter(e => !explicitOEEntries.includes(e));

                                    const regularCodes = [...new Set(regularEntries.map(e => e.course_code))];
                                    const explicitOECodes = [...new Set(explicitOEEntries.map(e => e.course_code))];
                                    const isPaired = (regularCodes.length + explicitOECodes.length) > 1;

                                    // Check if any regular course has 'OPEN ELECTIVE' in its name
                                    const hasImplicitOE = regularEntries.some(e => e.course_name && e.course_name.toLowerCase().includes('open elective'));
                                    const shouldShowOEPlaceholder = hasImplicitOE && explicitOECodes.length === 0;

                                    // Helper to clean OE from course name
                                    const cleanCourseName = (name) => {
                                        if (!name) return '';
                                        return name.replace(/\s*\/\s*OPEN\s*ELECTIVE\s*/gi, '').trim();
                                    };

                                    const renderCourseBlock = (code, idx, isOEBlock, groupEntries) => {
                                        let groupName = cleanCourseName(groupEntries[0]?.course_name || '');
                                        const isMiniProject = groupName.toLowerCase().includes('mini project');

                                        // Mini Project Display: append " / Mini Project" for Add Courses when toggle is ON
                                        const courseObj = allCourses.find(c => c.course_code === code);
                                        const deptObj = departments.find(d => d.department_code === selectedDept);
                                        const showMPSlash = courseObj?.is_add_course && deptObj?.pair_add_course_miniproject;
                                        if (showMPSlash) groupName = groupName + ' / Mini Project';

                                        return (
                                            <div key={`${code}-${idx}`} className={`p-2 flex flex-col justify-center flex-grow ${idx > 0 || isOEBlock && regularCodes.length > 0 ? 'border-t border-gray-200' : ''} ${isOEBlock ? 'bg-teal-50 hover:bg-teal-100/50' : 'bg-gray-50 hover:bg-blue-50'}`}>
                                                <div className={`font-bold text-[11px] leading-tight flex justify-center items-center gap-1 flex-wrap ${isOEBlock ? 'text-teal-800' : 'text-blue-800'}`}>
                                                    {showCourseCode && <span>{code}</span>}
                                                    {isOEBlock ? (
                                                        <span className="text-[8px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-semibold border border-teal-200 uppercase tracking-wider">Open Elec</span>
                                                    ) : (
                                                        showLabels && getCourseBadge(code)
                                                    )}
                                                </div>
                                                <div className={`text-[9.5px] font-medium leading-tight my-0.5 ${isOEBlock ? 'text-teal-600' : 'text-blue-600'}`}>{groupName || (isOEBlock ? 'OPEN ELECTIVE' : '')}</div>

                                                {!isMiniProject && (
                                                    groupEntries.length > 1 && !isPaired ? (
                                                        <div className={`mt-1 flex flex-col gap-0.5 pt-1 border-t ${isOEBlock ? 'border-teal-100' : 'border-blue-50/50'}`}>
                                                            {groupEntries.map((e, sIdx) => (
                                                                <div key={sIdx} className={`text-[8.5px] italic leading-tight whitespace-nowrap ${isOEBlock ? 'text-teal-700' : 'text-gray-600'}`}>
                                                                    {showFaculty && e.faculty_name && e.faculty_name !== 'Unassigned' && <>{e.faculty_name}</>}
                                                                    {showVenues && e.venue_name && <span className={`ml-1 px-1 rounded font-bold whitespace-nowrap ${isOEBlock ? 'bg-teal-100 border border-teal-200 text-teal-700' : 'bg-indigo-50 border border-indigo-100 text-indigo-600'}`}>{e.venue_name}</span>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {showFaculty && groupEntries[0]?.faculty_name && groupEntries[0]?.faculty_name !== 'Unassigned' && <div className={`text-[9px] italic mt-0.5 whitespace-nowrap ${isOEBlock ? 'text-teal-700' : 'text-gray-500'}`}>{groupEntries[0].faculty_name}</div>}
                                                            {showVenues && groupEntries[0]?.venue_name && <div className={`text-[8.5px] px-1 rounded font-bold mt-0.5 mx-auto w-fit whitespace-nowrap ${isOEBlock ? 'border border-teal-200 bg-teal-100 text-teal-700' : 'border border-indigo-200 bg-indigo-50 text-indigo-700'}`}>{groupEntries[0].venue_name}</div>}
                                                        </>
                                                    )
                                                )}
                                            </div>
                                        );
                                    };

                                    cells.push(
                                        <td key={p} className="p-0 border border-gray-300 text-center align-middle hover:bg-blue-50 transition-colors">
                                            <div className="flex flex-col min-h-[80px]">
                                                {regularCodes.map((code, idx) => renderCourseBlock(code, idx, false, regularEntries.filter(e => e.course_code === code)))}
                                                {explicitOECodes.map((code, idx) => renderCourseBlock(code, regularCodes.length + idx, true, explicitOEEntries.filter(e => e.course_code === code)))}

                                                {/* Disconnected Open Elective Placeholder */}
                                                {shouldShowOEPlaceholder && (
                                                    <div className={`p-2 flex flex-col justify-center flex-grow bg-teal-50 border-t border-teal-100 ${regularCodes.length > 0 ? 'border-t-2 border-t-gray-200' : ''}`}>
                                                        <div className="flex justify-center items-center">
                                                            <span className="text-[9px] bg-teal-100 text-teal-700 px-2 py-1 rounded-md font-bold border border-teal-200 uppercase tracking-widest shadow-sm">OPEN ELECTIVE</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    );
                                });
                                return (<tr key={day}><td className="p-2 border border-gray-300 font-bold text-gray-700 bg-gray-50 sticky left-0 z-10 text-xs">{day.substring(0, 3).toUpperCase()}</td>{cells}</tr>);
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // ============================================
    // FILTER BAR
    // ============================================
    const renderFilterBar = (showSem, filteredCount, totalCount) => (
        <div className="flex flex-wrap gap-3 items-center mb-4 bg-violet-50 p-4 rounded-2xl border border-violet-100 shadow-sm">
            <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-semibold text-violet-700">Filter:</span>
            </div>
            <select className="p-2.5 border border-violet-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400 focus:border-violet-400 focus:outline-none shadow-sm font-medium text-gray-700 cursor-pointer transition-all hover:border-violet-300" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
                <option value="">All Departments</option>
                {departments.map(d => <option key={d.department_code} value={d.department_code}>{d.department_code}</option>)}
            </select>
            {showSem && (
                <select className="p-2.5 border border-violet-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400 focus:border-violet-400 focus:outline-none shadow-sm font-medium text-gray-700 cursor-pointer transition-all hover:border-violet-300" value={filterSem} onChange={e => setFilterSem(e.target.value)}>
                    <option value="">All Semesters</option>
                    {semesters.map(s => <option key={s.semester_number} value={s.semester_number}>Semester {s.semester_number}</option>)}
                </select>
            )}
            <div className="flex-1 min-w-0">
                <div className="relative group">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-violet-500 transition-colors" />
                    <input type="text" placeholder="Search by name, code..." className="w-full pl-10 p-2.5 border border-violet-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm placeholder:text-gray-400 font-medium text-gray-700 transition-all hover:border-violet-300"
                        value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
            </div>
            <div className="text-xs text-violet-600 font-semibold bg-white px-4 py-2.5 rounded-xl border border-violet-100 shadow-sm">
                Showing {filteredCount} of {totalCount}
            </div>
        </div>
    );

    // ============================================
    // SUBJECTS PAGE
    // ============================================
    const renderSubjectsPage = () => {
        const q = searchQuery.toLowerCase().trim();
        const filtered = allCourses.filter(c => {
            if (!q) return true;
            return (c.course_code || '').toLowerCase().includes(q) || (c.course_name || '').toLowerCase().includes(q) || (c.department_code || '').toLowerCase().includes(q);
        });

        return (
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                    <div className="flex-1">{renderFilterBar(true, filtered.length, allCourses.length)}</div>
                    
                </div>

                {showAddCourse && (
                    <div className="bg-white rounded-2xl border-2 border-violet-200 shadow-xl shadow-violet-100/50 p-6">
                        <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-violet-600" /> Add New Course</h4>
                        <form onSubmit={handleAddCourse} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Course Code *</label>
                                <input name="course_code" placeholder="e.g. 21CS101" required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            </div>
                            <div className="flex flex-col gap-1 col-span-2">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Course Name *</label>
                                <input name="course_name" placeholder="e.g. Data Structures" required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Department *</label>
                                <select name="department_code" required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm">
                                    <option value="">Select Dept</option>
                                    {departments.map(d => <option key={d.department_code} value={d.department_code}>{d.department_code}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Semester *</label>
                                <select name="semester" required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm">
                                    <option value="">Select Sem</option>
                                    {semesters.map(s => <option key={s.semester_number} value={s.semester_number}>Sem {s.semester_number}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">L Hours</label>
                                <input name="lecture_hours" type="number" defaultValue="0" min="0" className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">T Hours</label>
                                <input name="tutorial_hours" type="number" defaultValue="0" min="0" className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">P Hours</label>
                                <input name="practical_hours" type="number" defaultValue="0" min="0" className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Credits</label>
                                <input name="credits" type="number" defaultValue="0" min="0" className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Weekly Sessions *</label>
                                <input name="weekly_sessions" type="number" defaultValue="1" min="1" required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            </div>
                            <div className="flex flex-wrap gap-4 items-center col-span-3">
                                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer"><input name="is_lab" type="checkbox" className="rounded border-violet-300 text-violet-600 focus:ring-violet-400" /> Lab</label>
                                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
                                    <input name="is_honours" type="checkbox" className="rounded border-violet-300 text-violet-600 focus:ring-violet-400" onChange={(e) => {
                                        const form = e.target.closest('form');
                                        setNewCourseIsHonoursOrMinor(e.target.checked || form.elements['is_minor'].checked);
                                    }} /> Honours
                                </label>
                                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
                                    <input name="is_minor" type="checkbox" className="rounded border-violet-300 text-violet-600 focus:ring-violet-400" onChange={(e) => {
                                        const form = e.target.closest('form');
                                        setNewCourseIsHonoursOrMinor(e.target.checked || form.elements['is_honours'].checked);
                                    }} /> Minor
                                </label>
                                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer"><input name="is_elective" type="checkbox" className="rounded border-violet-300 text-violet-600 focus:ring-violet-400" /> Elective</label>
                                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer"><input name="is_add_course" type="checkbox" className="rounded border-violet-300 text-amber-600 focus:ring-amber-400" /> Add Course</label>
                            </div>

                            {/* Enabled Native Course Sharing globally for all course structures */}
                                <div className="col-span-full space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-xl mt-2">
                                    <label className="text-sm font-semibold text-slate-700">Common across departments?</label>
                                    <p className="text-xs text-slate-500 mb-2">Select other departments that share this course.</p>
                                    <div className="flex flex-wrap gap-2">
                                        {departments.map(dept => {
                                            const isSelected = newCourseCommonDepts.includes(dept.department_code);
                                            return (
                                                <button
                                                    key={dept.department_code}
                                                    type="button"
                                                    onClick={() => {
                                                        setNewCourseCommonDepts(prev =>
                                                            isSelected ? prev.filter(c => c !== dept.department_code) : [...prev, dept.department_code]
                                                        );
                                                    }}
                                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${isSelected
                                                        ? 'bg-violet-100 text-violet-700 border-violet-200 shadow-sm'
                                                        : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                                                        }`}
                                                >
                                                    {dept.department_code}
                                                </button>
                                            );
                                        })}
                                        {departments.length === 0 && <p className="text-xs text-slate-400 italic">No departments available.</p>}
                                    </div>
                                </div>

                            <div className="flex gap-2">
                                <button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-violet-200 transition-all">Save</button>
                                <button type="button" onClick={() => setShowAddCourse(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium transition-all">Cancel</button>
                            </div>
                        </form>
                    </div>
                )}

                {editingCourse && (
                    <div className="bg-white rounded-2xl border-2 border-violet-400 shadow-xl shadow-violet-200/50 p-6">
                        <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Pencil className="w-4 h-4 text-violet-600" /> Edit Course {editingCourse.course_code}</h4>
                        <form onSubmit={(e) => handleUpdateCourse(e, editingCourse.course_code)} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Course Code</label>
                                <input name="course_code" defaultValue={editingCourse.course_code} required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Course Name</label>
                                <input name="course_name" defaultValue={editingCourse.course_name} required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Department</label>
                                <select name="department_code" defaultValue={editingCourse.department_code} required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm">
                                    <option value="">Department *</option>
                                    {departments.map(d => <option key={d.department_code} value={d.department_code}>{d.department_code}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Semester</label>
                                <select name="semester" defaultValue={editingCourse.semester} required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm">
                                    <option value="">Semester *</option>
                                    {semesters.map(s => <option key={s.semester_number} value={s.semester_number}>Sem {s.semester_number}</option>)}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">L Hours</label>
                                <input name="lecture_hours" type="number" defaultValue={editingCourse.lecture_hours} min="0" className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">T Hours</label>
                                <input name="tutorial_hours" type="number" defaultValue={editingCourse.tutorial_hours} min="0" className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">P Hours</label>
                                <input name="practical_hours" type="number" defaultValue={editingCourse.practical_hours} min="0" className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Credits</label>
                                <input name="credits" type="number" defaultValue={editingCourse.credits} min="0" className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Weekly Sessions</label>
                                <input name="weekly_sessions" type="number" defaultValue={editingCourse.weekly_sessions} min="1" required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            </div>

                            <div className="flex flex-wrap gap-4 items-center col-span-3">
                                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
                                    <input name="is_lab" type="checkbox" defaultChecked={editingCourse.is_lab} className="rounded border-violet-300 text-violet-600 focus:ring-violet-400" /> Lab
                                </label>
                                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
                                    <input name="is_honours" type="checkbox" defaultChecked={editingCourse.is_honours} className="rounded border-violet-300 text-violet-600 focus:ring-violet-400" onChange={(e) => {
                                        const form = e.target.closest('form');
                                        setNewCourseIsHonoursOrMinor(e.target.checked || form.elements['is_minor'].checked);
                                    }} /> Honours
                                </label>
                                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
                                    <input name="is_minor" type="checkbox" defaultChecked={editingCourse.is_minor} className="rounded border-violet-300 text-violet-600 focus:ring-violet-400" onChange={(e) => {
                                        const form = e.target.closest('form');
                                        setNewCourseIsHonoursOrMinor(e.target.checked || form.elements['is_honours'].checked);
                                    }} /> Minor
                                </label>
                                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
                                    <input name="is_elective" type="checkbox" defaultChecked={editingCourse.is_elective} className="rounded border-violet-300 text-violet-600 focus:ring-violet-400" /> Elective
                                </label>
                                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
                                    <input name="is_add_course" type="checkbox" defaultChecked={editingCourse.is_add_course} className="rounded border-violet-300 text-amber-600 focus:ring-amber-400" /> Add Course
                                </label>
                            </div>

                            {/* Enabled universally shared target variables cross-departments */}
                                <div className="col-span-full space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-xl mt-2">
                                    <label className="text-sm font-semibold text-slate-700">Common across departments?</label>
                                    <p className="text-xs text-slate-500 mb-2">Select other departments that share this course.</p>
                                    <div className="flex flex-wrap gap-2">
                                        {departments.map(dept => {
                                            const isSelected = newCourseCommonDepts.includes(dept.department_code);
                                            return (
                                                <button
                                                    key={dept.department_code}
                                                    type="button"
                                                    onClick={() => {
                                                        setNewCourseCommonDepts(prev =>
                                                            isSelected ? prev.filter(c => c !== dept.department_code) : [...prev, dept.department_code]
                                                        );
                                                    }}
                                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${isSelected
                                                        ? 'bg-violet-100 text-violet-700 border-violet-200 shadow-sm'
                                                        : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                                                        }`}
                                                >
                                                    {dept.department_code}
                                                </button>
                                            );
                                        })}
                                        {departments.length === 0 && <p className="text-xs text-slate-400 italic">No departments available.</p>}
                                    </div>
                                </div>

                            <div className="flex gap-2 col-span-full mt-2">
                                <button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-violet-200 transition-all">Update</button>
                                <button type="button" onClick={() => { setEditingCourse(null); setNewCourseIsHonoursOrMinor(false); setNewCourseCommonDepts([]); }} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium transition-all">Cancel</button>
                            </div>
                        </form>
                    </div>
                )}

                {Object.entries(filtered.reduce((acc, c) => {
                    const dept = c.department_code || 'Other';
                    if (!acc[dept]) acc[dept] = [];
                    acc[dept].push(c);
                    return acc;
                }, {})).sort().map(([dept, courses]) => (
                    <div key={dept} className="mb-8">
                        <h3 className="text-lg font-bold text-violet-800 mb-3 flex items-center gap-2 px-1">
                            <span className="bg-violet-100/50 px-3 py-1 rounded-lg border border-violet-100">{dept}</span>
                            <span className="bg-fuchsia-100 text-fuchsia-700 px-2.5 py-0.5 rounded-full text-xs font-bold border border-fuchsia-200 shadow-sm">{courses.length} Courses</span>
                        </h3>
                        <div className="bg-white rounded-2xl border border-violet-100 shadow-lg shadow-violet-50/50">
                            {/* Desktop View */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-100">
                                            <th className="p-3.5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Code</th>
                                            <th className="p-3.5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Course Name</th>
                                            <th className="p-3.5 text-center font-semibold text-gray-500 text-xs uppercase tracking-wider">Sem</th>
                                            <th className="p-3.5 text-center font-semibold text-gray-500 text-xs uppercase tracking-wider">L</th>
                                            <th className="p-3.5 text-center font-semibold text-gray-500 text-xs uppercase tracking-wider">T</th>
                                            <th className="p-3.5 text-center font-semibold text-gray-500 text-xs uppercase tracking-wider">P</th>
                                            <th className="p-3.5 text-center font-semibold text-gray-500 text-xs uppercase tracking-wider">Cr</th>
                                            <th className="p-3.5 text-center font-semibold text-gray-500 text-xs uppercase tracking-wider">Weekly</th>
                                            <th className="p-3.5 text-center font-semibold text-gray-500 text-xs uppercase tracking-wider">Type</th>
                                            
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {courses.map((c, i) => (
                                            <tr key={c.course_code} className={`border-b border-violet-50 hover:bg-violet-50/40 transition-colors duration-200 ${i % 2 === 0 ? 'bg-white' : 'bg-purple-50/20'}`}>
                                                <td className="p-3.5 font-mono font-bold text-violet-800">{c.course_code}</td>
                                                <td className="p-3.5 text-gray-800 font-medium">{c.course_name}</td>
                                                <td className="p-3.5 text-center font-semibold text-gray-700">{c.semester}</td>
                                                <td className="p-3.5 text-center text-gray-600">{c.lecture_hours || 0}</td>
                                                <td className="p-3.5 text-center text-gray-600">{c.tutorial_hours || 0}</td>
                                                <td className="p-3.5 text-center text-gray-600">{c.practical_hours || 0}</td>
                                                <td className="p-3.5 text-center font-semibold text-gray-700">{c.credits || '-'}</td>
                                                <td className="p-3.5 text-center"><span className="bg-violet-100 text-violet-800 px-2.5 py-1 rounded-full text-xs font-bold">{c.weekly_sessions}</span></td>
                                                <td className="p-3.5 text-center">
                                                    <div className="flex flex-wrap gap-1 justify-center">
                                                        {!!c.is_honours && <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-lg text-[10px] font-semibold">Honours</span>}
                                                        {!!c.is_minor && <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-lg text-[10px] font-semibold">Minor</span>}
                                                        {!!c.is_lab && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-lg text-[10px] font-semibold">Lab</span>}
                                                        {!!c.is_elective && <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-lg text-[10px] font-semibold">Elective</span>}
                                                        {!!c.is_open_elective && <span className="bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-lg text-[10px] font-semibold">Open Elec</span>}
                                                        {!!c.is_add_course && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-lg text-[10px] font-semibold">Add Course</span>}
                                                        {!c.is_honours && !c.is_minor && !c.is_lab && !c.is_elective && !c.is_open_elective && !c.is_add_course && <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-lg text-[10px] font-medium">Regular</span>}
                                                    </div>
                                                </td>
                                                
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile View */}
                            <div className="flex flex-col md:hidden divide-y divide-gray-100 p-2 gap-2 bg-slate-50 relative z-0">
                                {courses.map((c, i) => (
                                    <div key={c.course_code} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-3 relative z-0">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className="font-mono font-bold text-violet-800 tracking-tight text-sm inline-block">{c.course_code}</span>
                                                <h4 className="text-gray-800 font-bold leading-tight mt-1 line-clamp-2">{c.course_name}</h4>
                                            </div>
                                            <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg text-xs font-bold border border-indigo-100">Sem {c.semester}</span>
                                        </div>
                                        
                                        <div className="grid grid-cols-4 gap-2 text-center text-xs bg-gray-50 p-2 rounded-lg border border-gray-100">
                                            <div><span className="block text-gray-400 font-semibold mb-0.5 text-[10px] uppercase">L</span><span className="font-bold text-gray-700">{c.lecture_hours || 0}</span></div>
                                            <div><span className="block text-gray-400 font-semibold mb-0.5 text-[10px] uppercase">T</span><span className="font-bold text-gray-700">{c.tutorial_hours || 0}</span></div>
                                            <div><span className="block text-gray-400 font-semibold mb-0.5 text-[10px] uppercase">P</span><span className="font-bold text-gray-700">{c.practical_hours || 0}</span></div>
                                            <div><span className="block text-gray-400 font-semibold mb-0.5 text-[10px] uppercase">Cr</span><span className="font-bold text-violet-700">{c.credits || '-'}</span></div>
                                        </div>

                                        <div className="flex justify-between items-center mt-1">
                                            <div className="flex flex-wrap gap-1">
                                                {!!c.is_honours && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide">Honours</span>}
                                                {!!c.is_minor && <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide">Minor</span>}
                                                {!!c.is_lab && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide">Lab</span>}
                                                {!!c.is_elective && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide">Elective</span>}
                                                {!!c.is_open_elective && <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide">Open Elec</span>}
                                                {!!c.is_add_course && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide">Add Course</span>}
                                            </div>
                                            <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-md">{c.weekly_sessions} session{c.weekly_sessions > 1 ? 's' : ''}/wk</span>
                                        </div>

                                        <div className="flex gap-2 pt-3 border-t border-gray-100">
                                            <button onClick={async () => {
                                                setEditingCourse(c);
                                                setNewCourseIsHonoursOrMinor(c.is_honours || c.is_minor);
                                                try {
                                                    const { data: commonMap } = await api.getCommonCourses();
                                                    const group = commonMap.find(g => g.course_code === c.course_code && g.semester === c.semester);
                                                    if (group) {
                                                        setNewCourseCommonDepts(group.departments.filter(d => d !== c.department_code));
                                                    } else {
                                                        setNewCourseCommonDepts([]);
                                                    }
                                                } catch (e) { console.error("Could not load common departments", e); setNewCourseCommonDepts([]); }
                                                setShowAddCourse(false); 
                                            }} className="flex-1 bg-violet-50 hover:bg-violet-100 text-violet-700 py-2 rounded-xl text-xs font-bold transition-colors flex justify-center items-center gap-1"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                                            <button onClick={() => handleDeleteCourse(c.course_code)} className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-xl text-xs font-bold transition-colors flex justify-center items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}

                {filtered.length === 0 && <div className="p-10 text-center text-gray-400 text-sm">No courses found.</div>}
            </div>
        );
    };

    // ============================================
    // FACULTY PAGE
    // ============================================
    const renderFacultyPage = () => {
        const q = searchQuery.toLowerCase().trim();
        const filtered = allFaculty.filter(f => {
            if (!q) return true;
            return (f.faculty_id || '').toLowerCase().includes(q) || (f.faculty_name || '').toLowerCase().includes(q) || (f.faculty_email || '').toLowerCase().includes(q) || (f.department_code || '').toLowerCase().includes(q);
        });

        return (
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                    <div className="flex-1">{renderFilterBar(false, filtered.length, allFaculty.length)}</div>
                    
                </div>

                {showAddFaculty && (
                    <div className="bg-white rounded-2xl border-2 border-violet-200 shadow-xl shadow-violet-100/50 p-6">
                        <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-violet-600" /> Add New Faculty</h4>
                        <form onSubmit={handleAddFaculty} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                            <input name="faculty_id" placeholder="Faculty ID *" required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            <input name="faculty_name" placeholder="Faculty Name *" required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            <input name="faculty_email" placeholder="Email (optional)" type="email" className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            <select name="department_code" required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm">
                                <option value="">Department *</option>
                                {departments.map(d => <option key={d.department_code} value={d.department_code}>{d.department_code}</option>)}
                            </select>
                            <div className="flex gap-2">
                                <button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-violet-200 transition-all">Save</button>
                                <button type="button" onClick={() => setShowAddFaculty(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium transition-all">Cancel</button>
                            </div>
                        </form>
                    </div>
                )}

                {Object.entries(filtered.reduce((acc, f) => {
                    const dept = f.department_code || 'Other';
                    if (!acc[dept]) acc[dept] = [];
                    acc[dept].push(f);
                    return acc;
                }, {})).sort().map(([dept, faculty]) => (
                    <div key={dept} className="mb-8">
                        <h3 className="text-lg font-bold text-violet-800 mb-3 flex items-center gap-2 px-1">
                            <span className="bg-violet-100/50 px-3 py-1 rounded-lg border border-violet-100">{dept}</span>
                            <span className="bg-fuchsia-100 text-fuchsia-700 px-2.5 py-0.5 rounded-full text-xs font-bold border border-fuchsia-200 shadow-sm">{faculty.length} Faculty</span>
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {faculty.map(f => (
                                <div key={f.faculty_id} className="bg-white rounded-2xl border border-violet-100 shadow-md shadow-violet-50/30 hover:shadow-xl hover:shadow-violet-100/50 hover:border-violet-200 transition-all duration-300 p-5 group">
                                    <div className="flex items-start gap-3">
                                        <div className="w-12 h-12 bg-violet-600 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-violet-200 flex-shrink-0">
                                            {(f.faculty_name || '?').charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <h4 className="font-bold text-gray-900 text-sm truncate">{f.faculty_name || 'Unknown'}</h4>
                                                
                                            </div>
                                            <p className="text-xs text-gray-400 font-mono mt-0.5">{f.faculty_id}</p>
                                            <div className="flex items-center gap-2 mt-2.5">
                                                <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${(f.status || '') === 'Active' || (f.status || '') === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                                                    {f.status || 'Active'}
                                                </span>
                                            </div>
                                            {f.faculty_email && <p className="text-xs text-violet-500 mt-2 truncate font-medium">{f.faculty_email}</p>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {filtered.length === 0 && <div className="p-10 text-center text-gray-400 bg-white rounded-2xl border border-violet-100 text-sm">No faculty found.</div>}
            </div>
        );
    };

    // ============================================
    // COURSE-FACULTY MAPPINGS PAGE
    // ============================================
    const renderMappingsPage = () => {
        const q = searchQuery.toLowerCase().trim();
        const filtered = courseFacultyMappings.filter(m => {
            if (!q) return true;
            return (m.course_code || '').toLowerCase().includes(q) ||
                (m.course_name || '').toLowerCase().includes(q) ||
                (m.faculty_name || '').toLowerCase().includes(q) ||
                (m.course_dept || '').toLowerCase().includes(q) ||     // NEW
                (m.for_department || '').toLowerCase().includes(q) ||  // NEW
                (m.faculty_dept || '').toLowerCase().includes(q);      // NEW
        });

        const grouped = {};
        filtered.forEach(m => {
            if (!grouped[m.course_code]) {
                grouped[m.course_code] = {
                    course_name: m.course_name,
                    course_dept: m.course_dept,
                    target_depts: new Set(), // Track all target departments
                    faculty: []
                };
            }
            grouped[m.course_code].faculty.push(m);
            if (m.for_department) grouped[m.course_code].target_depts.add(m.for_department);
        });

        return (
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                    <div className="flex-1">{renderFilterBar(false, Object.keys(grouped).length, [...new Set(courseFacultyMappings.map(m => m.course_code))].length)}</div>
                    <button onClick={() => setShowAddMapping(!showAddMapping)} className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-violet-200 hover:shadow-violet-300 transition-all whitespace-nowrap hover:-translate-y-0.5 active:scale-95">
                        <Plus className="w-4 h-4" /> Add Mapping
                    </button>
                </div>

                {showAddMapping && (
                    <div className="bg-white rounded-2xl border-2 border-violet-200 shadow-xl shadow-violet-100/50 p-6">
                        <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-violet-600" /> Add Course-Faculty Mapping</h4>
                        <form onSubmit={handleAddMapping} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                            <input name="course_code" placeholder="Course Code *" required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            <input name="faculty_id" placeholder="Faculty ID *" required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            <select name="department_code" required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm">
                                <option value="">Taught To (Dept) *</option>
                                {departments.map(d => <option key={d.department_code} value={d.department_code}>{d.department_code}</option>)}
                            </select>
                            <select name="delivery_type" className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm">
                                <option value="Theory">Theory</option>
                                <option value="Lab">Lab</option>
                                <option value="Both">Both</option>
                            </select>
                            <div className="flex gap-2">
                                <button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-violet-200 transition-all">Save</button>
                                <button type="button" onClick={() => setShowAddMapping(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium transition-all">Cancel</button>
                            </div>
                        </form>
                    </div>
                )}

                <div className="space-y-4">
                    {Object.entries(grouped).map(([code, data]) => (
                        <div key={code} className="bg-white rounded-2xl border border-violet-100 shadow-md shadow-violet-50/30 overflow-hidden hover:shadow-lg transition-shadow duration-300">
                            <div className="bg-white p-4 border-b border-gray-100 flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-violet-800 text-sm">{code}</span>
                                        {/* Logic to determine offering department from faculty */}
                                        {(() => {
                                            const facDepts = new Set(data.faculty.map(f => f.faculty_dept).filter(d => d && d !== '?'));
                                            const offeringDept = facDepts.size === 1 ? Array.from(facDepts)[0] : (facDepts.size > 1 ? 'Mixed' : data.course_dept);
                                            return (
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium border ${offeringDept === '?' ? 'bg-gray-100 text-gray-500' : 'bg-slate-100 text-slate-700'}`}>
                                                    {offeringDept}
                                                </span>
                                            );
                                        })()}
                                        {/* Show Target Depts */}
                                        {data.target_depts.size > 0 && (
                                            <span className="flex items-center gap-1 text-[10px] text-gray-500 font-medium ml-2 bg-yellow-50 px-2 py-0.5 rounded border border-yellow-100">
                                                For {Array.from(data.target_depts).join(', ')}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-700 mt-0.5 font-medium">{data.course_name}</p>
                                </div>
                                <div className="bg-violet-100 text-violet-700 px-3.5 py-1.5 rounded-full text-xs font-bold border border-violet-200">
                                    {data.faculty.length} faculty
                                </div>
                            </div>
                            <div className="p-3">
                                <div className="flex flex-wrap gap-2">
                                    {data.faculty.map((f, i) => (
                                        <div key={i} className="flex items-center gap-2 bg-purple-50/50 rounded-xl px-3.5 py-2.5 border border-violet-100 group hover:border-violet-300 hover:bg-violet-50 transition-all duration-200">
                                            <div className="w-8 h-8 bg-violet-600 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-sm">
                                                {(f.faculty_name || '?').charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-xs font-medium text-gray-800">{f.faculty_name || 'Unknown'}</p>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] text-gray-500">{f.delivery_type || 'Theory'}</span>
                                                    {f.faculty_dept && f.faculty_dept !== '?' && f.faculty_dept !== data.course_dept && (
                                                        <span className="text-[9px] px-1 rounded bg-gray-200 text-gray-600">{f.faculty_dept}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button onClick={() => handleDeleteMapping(f.id)} className="text-red-300 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 transition-all ml-1 p-1" title="Remove Mapping">
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                    {Object.keys(grouped).length === 0 && <div className="p-10 text-center text-gray-400 bg-white rounded-2xl border border-violet-100 text-sm">No mappings found.</div>}
                </div>
            </div>
        );
    };

    // ============================================
    // EDITOR PAGE
    // ============================================
    const renderEditorPage = () => (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Pencil className="w-5 h-5 text-yellow-600" />
                    <span>Edit Saved Timetable</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                        <select className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500" value={editorDept} onChange={e => setEditorDept(e.target.value)}>
                            <option value="">Select Dept</option>
                            {departments.map(d => <option key={d.department_code} value={d.department_code}>{d.department_code}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
                        <select className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500" value={editorSem} onChange={e => setEditorSem(e.target.value)}>
                            <option value="">Select Sem</option>
                            {semesters.map(s => <option key={s.semester_number} value={s.semester_number}>Semester {s.semester_number}</option>)}
                        </select>
                    </div>
                </div>
            </div>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden min-h-[600px] flex flex-col">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-700">{editorDept && editorSem ? `${editorDept} - Semester ${editorSem} ` : 'Timetable Editor'}</h3>
                </div>
                <div className="flex-1 relative">
                    {editorDept && editorSem ? (
                        <TimetableEditor
                            key={`${editorDept}-${editorSem}`}
                            department={editorDept}
                            semester={editorSem}
                            initialData={timetableEntries}
                            masterData={{ departments, semesters, slots, courses: allCourses, faculty: allFaculty }}
                            selectedLearningModes={selectedLearningModes}
                            onSave={async (updatedEntries, overrideModes) => {
                                try {
                                    const modeIdsStr = (overrideModes || selectedLearningModes).sort().join(',');
                                    await api.saveTimetable({ 
                                        department_code: editorDept, 
                                        semester: parseInt(editorSem), 
                                        entries: updatedEntries,
                                        learning_mode_ids: modeIdsStr
                                    });
                                    // Re-fetch to ensure state is consistent
                                    const res = await api.getTimetableEntries(editorDept, editorSem, modeIdsStr);
                                    setTimetableEntries(res.data);
                                } catch (error) {
                                    throw error; // Let TimetableEditor catch and display it
                                }
                            }}
                            onExportPDF={handleDownloadPDF}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <Pencil className="w-16 h-16 mb-4 opacity-20" />
                            <p>Select Department and Semester to edit saved timetable</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    // ============================================
    // TIME SLOTS PAGE
    // ============================================
    const handleDeleteSlot = async (slotId) => {
        if (!confirm('Delete this time slot?')) return;
        try {
            await api.deleteSlot(slotId);
            const res = await api.getSlots();
            setSlots(res.data);
        } catch (err) {
            alert('Failed to delete slot: ' + (api.getErrorMessage(err) || 'Unknown error. The slot may be in use by existing timetables.'));
        }
    };

    const handleUpdateSlot = async (slotId) => {
        try {
            await api.updateSlot(slotId, editingSlotData);
            setEditingSlotId(null);
            setEditingSlotData({});
            const res = await api.getSlots();
            setSlots(res.data);
        } catch (err) {
            alert('Failed to update slot: ' + (api.getErrorMessage(err) || 'Unknown error. Please check the slot data and try again.'));
        }
    };

    const handleUpdateBreak = async (breakId) => {
        try {
            await api.updateBreak(breakId, editingBreakData);
            setEditingBreakId(null);
            setEditingBreakData({});
            const res = await api.getBreaks();
            setBreakConfigs(res.data);
        } catch (err) {
            alert('Failed to update break: ' + (api.getErrorMessage(err) || 'Unknown error. Please check the break timing and try again.'));
        }
    };

    const handleDeleteBreak = async (breakId) => {
        if (!confirm('Delete this Break format?')) return;
        try {
            await api.deleteBreak(breakId);
            const res = await api.getBreaks();
            setBreakConfigs(res.data);
        } catch (err) {
            alert('Failed to delete break: ' + (api.getErrorMessage(err) || 'Unknown error. The break may be in use.'));
        }
    };

    const handleAddSlot = async (e) => {
        e.preventDefault();
        const form = e.target;
        
        // Extract selected semesters
        const checkboxes = form.querySelectorAll('input[name="semesters"]:checked');
        const selectedSems = Array.from(checkboxes).map(cb => parseInt(cb.value));
        
        try {
            await api.createSlot({
                day_of_week: form.day_of_week.value,
                period_number: parseInt(form.period_number.value),
                start_time: form.start_time.value,
                end_time: form.end_time.value,
                slot_type: form.slot_type.value,
                is_active: true,
                semester_ids: selectedSems.length > 0 ? selectedSems : []
            });
            form.reset();
            setShowAddSlot(false);
            const res = await api.getSlots();
            setSlots(res.data);
        } catch (err) {
            alert('Failed to add slot: ' + (api.getErrorMessage(err) || 'Unknown error. Please check for overlapping time ranges.'));
        }
    };

    const handleAddBreak = async (e) => {
        e.preventDefault();
        const form = e.target;
        const checkboxes = form.querySelectorAll('input[name="break_semesters"]:checked');
        const selectedSems = Array.from(checkboxes).map(cb => parseInt(cb.value));
        
        try {
            await api.createBreak({
                break_type: form.break_type.value,
                start_time: form.start_time.value,
                end_time: form.end_time.value,
                semester_ids: selectedSems.length > 0 ? selectedSems : []
            });
            form.reset();
            setShowAddBreak(false);
            const res = await api.getBreaks();
            setBreakConfigs(res.data);
        } catch (err) {
            alert('Failed to add break: ' + (api.getErrorMessage(err) || 'Unknown error. Please check for overlapping break times.'));
        }
    };

    const startEditSlot = (slot) => {
        setEditingSlotId(slot.slot_id);
        setEditingSlotData({
            start_time: slot.start_time,
            end_time: slot.end_time,
            slot_type: slot.slot_type,
            is_active: slot.is_active,
            semester_ids: slot.semester_ids || []
        });
    };

    const handleSaveSemesterConfig = async (semester, academic_year) => {
        try {
            await api.updateSemesterConfig(semester, { academic_year });
            const res = await api.getSemesterConfigs();
            setSemesterConfigs(res.data);
        } catch(err) {
            alert('Failed to update config: ' + (api.getErrorMessage(err) || err.message || 'Unknown error'));
        }
    };

    const renderSlotsPage = () => {
        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const grouped = {};
        slots.forEach(s => {
            if (slotFilterSem) {
                const targetSem = parseInt(slotFilterSem);
                const sids = s.semester_ids || [];
                if (sids.length > 0 && !sids.includes(targetSem)) return;
            }
            if (!grouped[s.day_of_week]) grouped[s.day_of_week] = [];
            grouped[s.day_of_week].push(s);
        });
        Object.values(grouped).forEach(arr => arr.sort((a, b) => a.period_number - b.period_number));
        const sortedDays = dayOrder.filter(d => grouped[d] && grouped[d].length > 0);
        
        const filteredBreaks = breakConfigs.filter(b => {
             if (!slotFilterSem) return true;
             const targetSem = parseInt(slotFilterSem);
             const sids = b.semester_ids || [];
             return sids.length === 0 || sids.includes(targetSem);
        });

        return (
            <div className="space-y-6">
                {/* --- BREAK TIMINGS PANEL --- */}
                <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border border-orange-200 shadow-md shadow-orange-100/50 p-6 overflow-hidden">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-orange-900 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-orange-600" /> Break Configuration
                            </h3>
                            <p className="text-sm text-orange-700/80 mt-1">Configure FN, Lunch, and AN break timings specifically rendered into Timetables.</p>
                        </div>
                        <button onClick={() => setShowAddBreak(!showAddBreak)} className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold shadow-lg shadow-orange-200 hover:-translate-y-0.5 transition-all text-sm">
                            <Plus className="w-4 h-4" /> Add Break
                        </button>
                    </div>

                    {showAddBreak && (
                        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-orange-200 p-5 mb-6 shadow-sm">
                            <form onSubmit={handleAddBreak} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <select name="break_type" required className="p-2.5 border border-orange-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-200 outline-none">
                                    <option value="">Select Break Type *</option>
                                    <option value="FN Break">FN Break (Morning)</option>
                                    <option value="Lunch Break">Lunch Break</option>
                                    <option value="AN Break">AN Break (Afternoon)</option>
                                </select>
                                <input name="start_time" type="time" required className="p-2.5 border border-orange-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-200 outline-none" />
                                <input name="end_time" type="time" required className="p-2.5 border border-orange-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-200 outline-none" />
                                
                                <div className="md:col-span-4 mt-2">
                                    <label className="block text-xs font-bold text-orange-800 uppercase tracking-widest mb-2">Apply To Semesters (Leave empty for Global)</label>
                                    <div className="flex flex-wrap gap-2">
                                        {[1,2,3,4,5,6,7,8].map(sem => (
                                            <label key={sem} className="flex items-center gap-1.5 text-sm bg-white border border-orange-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-orange-50 hover:border-orange-300">
                                                <input type="checkbox" name="break_semesters" value={sem} className="w-4 h-4 text-orange-600 rounded border-orange-300 focus:ring-orange-500" />
                                                Sem {sem}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="md:col-span-4 flex gap-2 pt-2">
                                    <button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-md shadow-orange-200 transition-all">Save Break</button>
                                    <button type="button" onClick={() => setShowAddBreak(false)} className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50">Cancel</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {filteredBreaks.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredBreaks.map(b => (
                                <div key={b.id} className="bg-white rounded-xl border border-orange-100 p-4 shadow-sm relative group overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-orange-400"></div>
                                    <div className="pl-2">
                                        {editingBreakId === b.id ? (
                                            <div className="flex flex-col gap-2">
                                                <select value={editingBreakData.break_type || ''} onChange={e => setEditingBreakData(prev => ({ ...prev, break_type: e.target.value }))} className="text-sm p-1 border rounded bg-gray-50 text-gray-900 border-gray-200 font-bold mb-1">
                                                    <option value="FN Break">FN Break (Morning)</option>
                                                    <option value="Lunch Break">Lunch Break</option>
                                                    <option value="AN Break">AN Break (Afternoon)</option>
                                                </select>
                                                <div className="flex gap-2">
                                                    <input type="time" value={editingBreakData.start_time || ''} onChange={e => setEditingBreakData(prev => ({ ...prev, start_time: e.target.value }))} className="p-1 border border-gray-200 rounded text-xs w-full bg-gray-50" />
                                                    <span className="text-gray-400 self-center">-</span>
                                                    <input type="time" value={editingBreakData.end_time || ''} onChange={e => setEditingBreakData(prev => ({ ...prev, end_time: e.target.value }))} className="p-1 border border-gray-200 rounded text-xs w-full bg-gray-50" />
                                                </div>
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {[1,2,3,4,5,6,7,8].map(sem => (
                                                        <label key={sem} className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded cursor-pointer border border-gray-200 shadow-sm hover:bg-gray-100">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={(editingBreakData.semester_ids || []).includes(sem)}
                                                                onChange={e => {
                                                                    const current = editingBreakData.semester_ids || [];
                                                                    const updated = e.target.checked ? [...current, sem] : current.filter(s => s !== sem);
                                                                    setEditingBreakData(prev => ({ ...prev, semester_ids: updated }));
                                                                }}
                                                                className="w-3 h-3 text-orange-600 rounded" 
                                                            />
                                                            <span className="text-[10px] whitespace-nowrap">S{sem}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                                                    <button onClick={() => handleUpdateBreak(b.id)} className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 py-1.5 rounded text-xs font-bold transition-colors">Save</button>
                                                    <button onClick={() => { setEditingBreakId(null); setEditingBreakData({}); }} className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-600 py-1.5 rounded text-xs font-bold transition-colors">Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-extrabold text-orange-900">{b.break_type}</h4>
                                                    <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => { setEditingBreakId(b.id); setEditingBreakData({...b, semester_ids: b.semester_ids || []}); }} className="p-1 text-gray-400 hover:text-blue-600 rounded bg-gray-50 hover:bg-blue-50 transition-colors"><Pencil className="w-3 h-3" /></button>
                                                        <button onClick={() => handleDeleteBreak(b.id)} className="p-1 text-gray-400 hover:text-red-500 rounded bg-gray-50 hover:bg-red-50 transition-colors"><Trash2 className="w-3 h-3" /></button>
                                                    </div>
                                                </div>
                                                
                                                <p className="font-mono text-gray-700 bg-orange-50 tracking-wider inline-block px-2 py-1 rounded text-sm mb-3 font-semibold border border-orange-100">{formatTime(b.start_time)} - {formatTime(b.end_time)}</p>
                                                
                                                <div className="flex flex-wrap gap-1 mt-auto">
                                                    {(!b.semester_ids || b.semester_ids.length === 0) ? (
                                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-semibold">Global Allocation</span>
                                                    ) : (
                                                        b.semester_ids.sort().map(s => (
                                                            <span key={s} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold">
                                                                Sem {s}
                                                            </span>
                                                        ))
                                                    )}
                                                </div>
                                            </>
                                        )} 
 
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center p-8 bg-white/50 rounded-xl border border-dashed border-orange-200 text-orange-600/60 font-medium text-sm">
                            No break timings configured. Click "Add Break" to allocate formatting.
                        </div>
                    )}
                </div>

                {/* --- GLOBAL ACADEMIC YEAR CONFIG --- */}
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl border border-indigo-200 shadow-md p-6 overflow-hidden">
                    <div className="mb-4">
                        <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                            <Layers className="w-5 h-5 text-indigo-600" /> Academic Year
                        </h3>
                        <p className="text-sm text-indigo-700/80 mt-1">Set the current Academic Year for all timetable exports (PDF & Excel).</p>
                    </div>
                    <div className="max-w-md">
                        <div className="bg-white rounded-xl border border-indigo-100 p-4 shadow-sm relative group overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-400"></div>
                            <div className="pl-2 flex items-center gap-3">
                                <h4 className="font-extrabold text-indigo-900 whitespace-nowrap">Academic Year:</h4>
                                <input 
                                    type="text" 
                                    placeholder="e.g. 2025-2026" 
                                    defaultValue={(semesterConfigs.find(c => c.semester === 0) || {}).academic_year || ''}
                                    onBlur={e => {
                                        const current = (semesterConfigs.find(c => c.semester === 0) || {}).academic_year || '';
                                        if(e.target.value !== current) {
                                            handleSaveSemesterConfig(0, e.target.value);
                                        }
                                    }}
                                    className="flex-1 text-sm p-2 border border-indigo-200 rounded focus:ring-2 focus:ring-indigo-400 outline-none transition-shadow" 
                                />
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* --- TIME SLOTS SYSTEM --- */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-2xl shadow-sm border border-violet-100">
                    <div>
                        <p className="text-sm font-semibold text-gray-700">Manage period timings across specific semesters.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                        <select 
                            value={slotFilterSem} 
                            onChange={e => setSlotFilterSem(e.target.value)}
                            className="flex-1 sm:flex-none p-2 border border-violet-200 rounded-xl text-sm font-semibold text-gray-700 bg-gray-50 focus:ring-2 focus:ring-violet-400 focus:outline-none"
                        >
                            <option value="">All Semesters (Raw View)</option>
                            {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                        </select>
                        <button onClick={() => setShowAddSlot(!showAddSlot)} className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold shadow-lg shadow-violet-200 hover:shadow-violet-300 transition-all hover:-translate-y-0.5 active:scale-95 whitespace-nowrap">
                            <Plus className="w-4 h-4" /> Add Slot
                        </button>
                    </div>
                </div>

                {showAddSlot && (
                    <div className="bg-white rounded-2xl border-2 border-violet-200 shadow-xl shadow-violet-100/50 p-6">
                        <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-violet-600" /> Add New Time Slot</h4>
                        <form onSubmit={handleAddSlot} className="grid grid-cols-2 md:grid-cols-6 gap-3">
                            <select name="day_of_week" required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm">
                                <option value="">Day *</option>
                                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                            <input name="period_number" type="number" placeholder="Period # *" required min="1" className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            <input name="start_time" type="time" required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            <input name="end_time" type="time" required className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm" />
                            <select name="slot_type" className="p-2.5 border border-violet-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm">
                                <option value="REGULAR">Regular</option>
                                <option value="BREAK">Break</option>
                                <option value="LUNCH">Lunch</option>
                                <option value="SPECIAL">Special</option>
                            </select>
                            <div className="col-span-2 md:col-span-6 mt-2">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Apply to Semesters (Leave all unchecked to apply globally)</label>
                                <div className="flex flex-wrap gap-3">
                                    {[1,2,3,4,5,6,7,8].map(sem => (
                                        <label key={sem} className="flex items-center gap-1.5 text-sm bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-violet-50 hover:border-violet-200 transition-colors">
                                            <input type="checkbox" name="semesters" value={sem} className="w-4 h-4 text-violet-600 rounded border-gray-300 focus:ring-violet-500" />
                                            Sem {sem}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="col-span-2 md:col-span-6 flex gap-2 mt-2">
                                <button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-violet-200 transition-all">Save</button>
                                <button type="button" onClick={() => setShowAddSlot(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium transition-all">Cancel</button>
                            </div>
                        </form>
                    </div>
                )}

                {sortedDays.map(day => (
                    <div key={day} className="bg-white rounded-2xl border border-violet-100 shadow-md shadow-violet-50/30 overflow-hidden">
                        <div className="bg-white p-4 border-b border-gray-100">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-violet-600" />
                                {day}
                                <span className="ml-2 text-xs font-semibold bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full border border-violet-200">{grouped[day].length} periods</span>
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="px-4 py-3 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Period</th>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Start Time</th>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">End Time</th>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Type</th>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Semesters</th>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Status</th>
                                        <th className="px-4 py-3 text-right font-semibold text-gray-500 text-xs uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {grouped[day].map(slot => (
                                        <tr key={slot.slot_id} className="border-b border-violet-50 hover:bg-violet-50/40 transition-colors duration-200">
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center justify-center w-8 h-8 bg-violet-100 text-violet-800 rounded-xl font-bold text-sm border border-violet-200">
                                                    P{slot.period_number}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {editingSlotId === slot.slot_id ? (
                                                    <input type="time" value={editingSlotData.start_time || ''} onChange={e => setEditingSlotData(prev => ({ ...prev, start_time: e.target.value }))} className="p-1 border rounded text-sm w-28" />
                                                ) : (
                                                    <span className="font-mono text-gray-800">{formatTime(slot.start_time)}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {editingSlotId === slot.slot_id ? (
                                                    <input type="time" value={editingSlotData.end_time || ''} onChange={e => setEditingSlotData(prev => ({ ...prev, end_time: e.target.value }))} className="p-1 border rounded text-sm w-28" />
                                                ) : (
                                                    <span className="font-mono text-gray-800">{formatTime(slot.end_time)}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {editingSlotId === slot.slot_id ? (
                                                    <select value={editingSlotData.slot_type || 'REGULAR'} onChange={e => setEditingSlotData(prev => ({ ...prev, slot_type: e.target.value }))} className="p-1 border rounded text-sm">
                                                        <option value="REGULAR">Regular</option>
                                                        <option value="BREAK">Break</option>
                                                        <option value="LUNCH">Lunch</option>
                                                        <option value="SPECIAL">Special</option>
                                                    </select>
                                                ) : (
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${slot.slot_type === 'REGULAR' ? 'bg-green-100 text-green-700' : slot.slot_type === 'BREAK' ? 'bg-orange-100 text-orange-700' : slot.slot_type === 'LUNCH' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                                        {slot.slot_type}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs w-48">
                                                {editingSlotId === slot.slot_id ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {[1,2,3,4,5,6,7,8].map(sem => (
                                                            <label key={sem} className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded cursor-pointer border border-gray-200 shadow-sm hover:bg-gray-100">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={(editingSlotData.semester_ids || []).includes(sem)}
                                                                    onChange={e => {
                                                                        const current = editingSlotData.semester_ids || [];
                                                                        const updated = e.target.checked ? [...current, sem] : current.filter(s => s !== sem);
                                                                        setEditingSlotData(prev => ({ ...prev, semester_ids: updated }));
                                                                    }}
                                                                    className="w-3 h-3 text-violet-600 rounded" 
                                                                />
                                                                <span className="text-[10px] whitespace-nowrap">S{sem}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1">
                                                        {(!slot.semester_ids || slot.semester_ids.length === 0) ? (
                                                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-semibold">Global</span>
                                                        ) : (
                                                            slot.semester_ids.sort().map(s => (
                                                                <span key={s} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold">
                                                                    S{s}
                                                                </span>
                                                            ))
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {editingSlotId === slot.slot_id ? (
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input type="checkbox" checked={editingSlotData.is_active ?? true} onChange={e => setEditingSlotData(prev => ({ ...prev, is_active: e.target.checked }))} className="w-4 h-4 rounded" />
                                                        <span className="text-xs">{editingSlotData.is_active ? 'Active' : 'Inactive'}</span>
                                                    </label>
                                                ) : (
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${slot.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${slot.is_active ? 'bg-emerald-500' : 'bg-red-400'}`}></span>
                                                        {slot.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {editingSlotId === slot.slot_id ? (
                                                    <div className="flex gap-2 justify-end">
                                                        <button onClick={() => handleUpdateSlot(slot.slot_id)} className="text-green-600 hover:text-green-800 p-1" title="Save"><Check className="w-4 h-4" /></button>
                                                        <button onClick={() => { setEditingSlotId(null); setEditingSlotData({}); }} className="text-gray-400 hover:text-gray-600 p-1" title="Cancel"><X className="w-4 h-4" /></button>
                                                    </div>
                                                ) : (
                                                    <div className="flex gap-2 justify-end">
                                                        <button onClick={() => startEditSlot(slot)} className="text-blue-500 hover:text-blue-700 p-1" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                                                        <button onClick={() => handleDeleteSlot(slot.slot_id)} className="text-red-400 hover:text-red-600 p-1" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
                {sortedDays.length === 0 && <div className="p-10 text-center text-gray-400 bg-white rounded-2xl border border-violet-100 text-sm">No time slots configured. Click "Add Slot" to create one.</div>}
            </div>
        );
    };

    // ============================================
    // DASHBOARD
    // ============================================
    const renderDashboard = () => (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-lg shadow-violet-50/50 border border-violet-100">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Monitor className="w-5 h-5 text-violet-600" />
                        <span>Generate Timetable</span>
                    </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Department</label>
                        <select className="w-full p-2.5 border border-violet-200 rounded-xl focus:ring-2 focus:ring-violet-400 focus:border-violet-400 focus:outline-none shadow-sm bg-white font-medium text-gray-700 cursor-pointer transition-all hover:border-violet-300" value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
                            <option value="">Select Dept</option>
                            {departments.map(d => <option key={d.department_code} value={d.department_code}>{d.department_code}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Semester</label>
                        <select className="w-full p-2.5 border border-violet-200 rounded-xl focus:ring-2 focus:ring-violet-400 focus:border-violet-400 focus:outline-none shadow-sm bg-white font-medium text-gray-700 cursor-pointer transition-all hover:border-violet-300" value={selectedSem} onChange={e => setSelectedSem(e.target.value)}>
                            <option value="">Select Sem</option>
                            {semesters.map(s => <option key={s.semester_number} value={s.semester_number}>Semester {s.semester_number}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Mentor Day</label>
                        <select className="w-full p-2.5 border border-violet-200 rounded-xl focus:ring-2 focus:ring-violet-400 focus:border-violet-400 focus:outline-none shadow-sm bg-white font-medium text-gray-700 cursor-pointer transition-all hover:border-violet-300" value={mentorDay} onChange={e => setMentorDay(e.target.value)}>
                            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Mentor Period</label>
                        <input type="number" className="w-full p-2.5 border border-violet-200 rounded-xl focus:ring-2 focus:ring-violet-400 focus:border-violet-400 focus:outline-none shadow-sm bg-white font-medium text-gray-700" value={mentorPeriod} onChange={e => setMentorPeriod(e.target.value)} min="1" max="8" />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mt-4">
                    <div className="md:col-span-3">
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Learning Mode</label>
                        <LearningModeSelector 
                            department={selectedDept}
                            semester={selectedSem}
                            selectedModes={selectedLearningModes}
                            onModesChange={setSelectedLearningModes}
                        />
                    </div>
                    <button onClick={handleGenerate} disabled={loading} className={`w-full py-2.5 px-4 rounded-xl text-white font-bold flex items-center justify-center space-x-2 transition-all ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-200 hover:shadow-violet-300 hover:-translate-y-0.5 active:scale-95'}`}>
                        {loading ? <RotateCw className="w-5 h-5 animate-spin" /> : <Monitor className="w-5 h-5" />}
                        <span>{loading ? 'Processing...' : 'Generate'}</span>
                    </button>
                </div>
            </div>
            
            {/* --- GENERATION ERRORS INLINE (HARD MODE) --- */}
            
            {selectedDept && selectedSem && timetableEntries.length === 0 && (
                <div className="bg-white p-6 rounded-2xl shadow-lg shadow-violet-50/50 border border-violet-100 mt-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <span className="p-1.5 bg-violet-100 rounded-lg text-violet-600">
                                <Monitor className="w-4 h-4" />
                            </span>
                            <span>Pre-Lock Timetable Slots</span>
                        </h3>
                        <p className="text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded border border-gray-100">Click cells to lock. They will be labeled "LOCKED" and kept empty during generation.</p>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr>
                                    <th className="border border-violet-100 bg-violet-50 p-2 text-violet-800 font-semibold w-24">Day \ Period</th>
                                    {[1, 2, 3, 4, 5, 6, 7, 8].map(p => (
                                        <th key={p} 
                                            onClick={() => {
                                                const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                                                const isAllLocked = days.every(d => lockedSlots.some(s => s.day === d && s.period === p));
                                                if (isAllLocked) {
                                                    setLockedSlots(prev => prev.filter(s => s.period !== p));
                                                } else {
                                                    const newLocks = [...lockedSlots];
                                                    days.forEach(d => {
                                                        if (!newLocks.some(s => s.day === d && s.period === p)) {
                                                            newLocks.push({ day: d, period: p });
                                                        }
                                                    });
                                                    setLockedSlots(newLocks);
                                                }
                                            }}
                                            className="border border-violet-100 bg-violet-50 p-2 text-violet-800 font-semibold cursor-pointer hover:bg-violet-100 transition-colors"
                                            title="Click to lock/unlock entire period"
                                        >
                                            Period {p}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                                    <tr key={day}>
                                        <td 
                                            onClick={() => {
                                                const periods = [1, 2, 3, 4, 5, 6, 7, 8];
                                                const isAllLocked = periods.every(p => lockedSlots.some(s => s.day === day && s.period === p));
                                                if (isAllLocked) {
                                                    setLockedSlots(prev => prev.filter(s => s.day !== day));
                                                } else {
                                                    const newLocks = [...lockedSlots];
                                                    periods.forEach(p => {
                                                        if (!newLocks.some(s => s.day === day && s.period === p)) {
                                                            newLocks.push({ day: day, period: p });
                                                        }
                                                    });
                                                    setLockedSlots(newLocks);
                                                }
                                            }}
                                            className="border border-violet-100 bg-violet-50/50 p-2 font-medium text-gray-700 cursor-pointer hover:bg-violet-100 transition-colors"
                                            title="Click to lock/unlock entire day"
                                        >
                                            {day}
                                        </td>
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map(p => {
                                            const isLocked = lockedSlots.some(s => s.day === day && s.period === p);
                                            return (
                                                <td 
                                                    key={p} 
                                                    onClick={() => {
                                                        if (isLocked) {
                                                            setLockedSlots(prev => prev.filter(s => !(s.day === day && s.period === p)));
                                                        } else {
                                                            setLockedSlots(prev => [...prev, { day, period: p }]);
                                                        }
                                                    }}
                                                    className={`border p-2 text-center cursor-pointer transition-all hover:opacity-80 ${isLocked ? 'bg-rose-100 border-rose-200 shadow-inner' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
                                                >
                                                    {isLocked ? (
                                                        <div className="flex flex-col items-center justify-center text-rose-600">
                                                            <span className="font-bold text-xs uppercase tracking-wider">Locked</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-300 text-xs">-</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {generationErrors && (
                <div className="bg-white rounded-2xl shadow-lg shadow-rose-100/50 w-full overflow-hidden flex flex-col border-2 border-rose-200">
                    <div className="bg-rose-50 border-b border-rose-100 p-6 flex items-start gap-4">
                        <div className="p-3 bg-rose-100 text-rose-600 rounded-xl">
                            <AlertTriangle className="w-8 h-8" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-xl font-black text-rose-900 tracking-tight">Generation Aborted</h2>
                            <p className="text-sm font-medium text-rose-700 mt-1">{generationErrors.message}</p>
                        </div>
                        <button onClick={() => setGenerationErrors(null)} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    
                    <div className="p-6 overflow-y-auto bg-gray-50 flex-1 space-y-4 max-h-96">
                        {generationErrors.errors.map((err, idx) => (
                            <div key={idx} className="bg-white border-2 border-rose-100 rounded-xl p-4 shadow-sm relative overflow-hidden">
                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-rose-500"></div>
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 uppercase tracking-wider">{err.type}</span>
                                            {err.course_code && <span className="text-[11px] font-bold text-gray-500">{err.course_code}</span>}
                                        </div>
                                        <h3 className="font-bold text-gray-800 text-sm mb-2">{err.course_name || 'System Resource'}</h3>
                                        
                                        {err.details && (
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {err.details.required !== undefined && <span className="text-xs bg-gray-50 border border-gray-100 text-gray-600 px-2 py-1 rounded-md">Required: <strong>{err.details.required}</strong></span>}
                                                {err.details.available !== undefined && <span className="text-xs bg-gray-50 border border-gray-100 text-gray-600 px-2 py-1 rounded-md">Available: <strong className="text-rose-600">{err.details.available}</strong></span>}
                                                {err.details.type && <span className="text-xs bg-purple-50 border border-purple-100 text-purple-600 px-2 py-1 rounded-md">Type: <strong>{err.details.type}</strong></span>}
                                            </div>
                                        )}
                                        
                                        <div className="mt-3 flex items-start gap-2 text-sm text-gray-800 bg-blue-50/50 p-3 rounded-lg border border-blue-200">
                                            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                                            <div className="flex flex-col gap-1">
                                                {err.message && <p className="font-semibold text-gray-900">{err.message}</p>}
                                                {err.suggestion ? <p><strong className="text-blue-800">Suggestion:</strong> {err.suggestion}</p> : null}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            <div className="bg-white rounded-2xl shadow-lg shadow-violet-50/50 border border-violet-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white">
                    <h3 className="font-bold text-gray-700">{selectedDept && selectedSem ? `${selectedDept} - Semester ${selectedSem} ` : 'Timetable Preview'}</h3>
                    <div className="flex items-center flex-wrap gap-2">
                        <button 
                            onClick={() => {
                                if (selectedDept && selectedSem) {
                                    setEditorDept(selectedDept);
                                    setEditorSem(selectedSem);
                                    setActiveTab('editor');
                                } else {
                                    alert('Please select a department and semester first.');
                                }
                            }}
                            className="flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-900 border border-blue-200 px-3 py-1.5 rounded-xl bg-white shadow-sm hover:shadow-md hover:border-blue-300 font-semibold transition-all"
                        >
                            <Edit2 className="w-4 h-4" /><span>Edit</span>
                        </button>
                        <button onClick={handleDownloadExcel} className="flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-900 border border-emerald-200 px-3 py-1.5 rounded-xl bg-white shadow-sm hover:shadow-md hover:border-emerald-300 font-semibold transition-all">
                            <FileSpreadsheet className="w-4 h-4" /><span>Excel</span>
                        </button>
                        <button onClick={handleDownloadPDF} className="flex items-center gap-1.5 text-sm text-violet-700 hover:text-violet-900 border border-violet-200 px-3 py-1.5 rounded-xl bg-white shadow-sm hover:shadow-md hover:border-violet-300 font-semibold transition-all">
                            <Download className="w-4 h-4" /><span>PDF</span>
                        </button>
                    </div>
                </div>
                <div className="p-4">{renderTimetable()}</div>
            </div>
            <DashboardOverrides selectedDept={selectedDept} selectedSem={selectedSem} timetableEntries={timetableEntries} />
        </div>
    );

    // --- UPDATED: Print View Page Render ---
    const renderPrintViewPage = () => (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Download className="w-5 h-5 text-blue-600" />
                    <span>Print View Manager</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                        <select
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            value={editorDept}
                            onChange={e => setEditorDept(e.target.value)}
                        >
                            <option value="">-- All Departments (Master View) --</option>
                            {departments.map(d => <option key={d.department_code} value={d.department_code}>{d.department_code}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
                        <select
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            value={editorSem}
                            onChange={e => setEditorSem(e.target.value)}
                        >
                            <option value="">-- All Semesters --</option>
                            {semesters.map(s => <option key={s.semester_number} value={s.semester_number}>Semester {s.semester_number}</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex flex-wrap gap-3 items-end mt-4">
                    <div className="flex-1">
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Learning Mode</label>
                        <div className="flex flex-wrap items-center gap-2 bg-violet-50/50 p-2 border border-violet-100 rounded-xl">
                            {[
                                { modes: [1], label: 'UAL Only', modeStr: '1', dotColor: 'bg-blue-500' },
                                { modes: [2], label: 'PBL Only', modeStr: '2', dotColor: 'bg-emerald-500' },
                                { modes: [1, 2], label: 'Combined', modeStr: '1,2', dotColor: 'bg-violet-500' }
                            ].map(opt => {
                                const currentStr = selectedLearningModes.sort().join(',');
                                const isActive = currentStr === opt.modeStr;
                                return (
                                    <button
                                        key={opt.modeStr}
                                        onClick={() => {
                                            setSelectedLearningModes(opt.modes);
                                            fetchPrintData(editorDept, editorSem, opt.modeStr);
                                        }}
                                        disabled={loading}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border-2 ${
                                            isActive
                                                ? 'bg-violet-600 text-white border-violet-600 shadow-md'
                                                : 'bg-white text-gray-500 border-violet-100 hover:border-violet-300'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : opt.dotColor}`} />
                                        <span>{opt.label}</span>
                                        {loading && isActive && <RotateCw className="w-3 h-3 animate-spin" />}
                                    </button>
                                );
                            })}
                            <span className="ml-auto text-[10px] text-violet-400 font-bold uppercase tracking-widest pr-1 hidden sm:inline-block">
                                {selectedLearningModes.length === 2 ? 'All Students' : selectedLearningModes.includes(1) ? 'UAL Students' : 'PBL Students'}
                            </span>
                        </div>
                    </div>
                    <div className="pb-0.5">
                        <button
                            onClick={() => fetchPrintData(editorDept, editorSem)}
                            disabled={loading}
                            className="bg-blue-600 w-full flex items-center justify-center gap-2 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow hover:bg-blue-700 transition-all disabled:bg-gray-400"
                        >
                            {loading ? <RotateCw className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                            Load / Refresh
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden min-h-[600px] flex flex-col">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-700">
                        {!editorDept && !editorSem ? 'MASTER TIMETABLE (All Data)' :
                            `${editorDept || 'All Depts'} - ${editorSem ? 'Sem ' + editorSem : 'All Sems'}`}
                    </h3>
                </div>
                <div className="flex-1 relative">
                    <BITTimetable
                        timetableData={timetableEntries}
                        department={departments.find(d => d.department_code === editorDept)?.department_code}
                        semester={semesters.find(s => s.semester_number === parseInt(editorSem))?.semester_number}
                        slots={slots}
                        courses={allCourses}
                        faculty={allFaculty}
                        breakConfigs={breakConfigs}
                        departments={departments}
                        semesterConfigs={semesterConfigs}
                        conflicts={detectedConflicts}
                        // Pass the refresh handler to the component
                        onRefresh={() => fetchPrintData(editorDept, editorSem)}
                    />
                </div>
            </div>
        </div>
    );

    const pageTitle = { dashboard: 'Timetable Generator', editor: 'Timetable Editor', print: 'Print View', timeslots: 'Time Slots', departments: 'Departments Setup', subjects: 'Course / Subject Details', faculty: 'Faculty Details', mappings: 'Course-Faculty Mappings', venues: 'Venues & Classrooms', venue_mappings: 'Department Venues', students: 'Students & Registrations', faculty_timetable: 'Faculty Personal Timetable', student_timetable: 'Student Personal Timetable', venue_timetable: 'Venue Timetable', constraints: 'Algorithm Constraints', user_constraints: 'User Constraints' };

    const switchTab = (tab) => {
        setActiveTab(tab);
        setIsSidebarOpen(false); // Close mobile sidebar on navigation
        if (tab === 'editor' || tab === 'print') {
            setIsCollapsed(true); // Auto-collapse for editor/print
        }
        setSearchQuery('');
        setFilterDept(''); // Clear filter to avoid confusion
        setFilterSem('');
        setShowAddCourse(false);
        setShowAddFaculty(false);
        setShowAddMapping(false);
    };

    // --- Authentication Gate (variables moved to top) ---
    
    // Show loading screen while checking auth state from localStorage
    if (authLoading) {
        return (
            <div className="auth-loading-screen">
                <div className="auth-loading-content">
                    <div className="auth-loading-spinner"></div>
                    <p className="auth-loading-text">Loading BIT Scheduler...</p>
                </div>
            </div>
        );
    }

    // --- Admin Routes ---
    if (currentHash === '#/admin/login') {
        return <AdminLogin onLoginSuccess={() => window.location.hash = '#/admin'} onBack={() => window.location.hash = '#/'} />;
    }
    
    if (currentHash === '#/admin') {
        if (!api.getAdminToken()) {
            window.location.hash = '#/admin/login';
            return null;
        }
        return <AdminDashboard onLogout={() => window.location.hash = '#/'} />;
    }

    // Show login page if not authenticated
    if (!isAuthenticated) {
        return <LoginPage />;
    }

    // Helper: get user initials for avatar fallback
    const getUserInitials = () => {
        if (user?.name) {
            return user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        }
        if (user?.email) {
            return user.email[0].toUpperCase();
        }
        return 'U';
    };

    return (
        <div className="flex h-screen bg-white font-sans text-gray-900 overflow-hidden">
            {/* Mobile sidebar backdrop */}
            {isSidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}
            {/* Desktop Sidebar (hidden on mobile, acts as slide-over if toggled) */}
            <aside className={`fixed inset-y-0 left-0 z-50 ${isCollapsed ? 'w-20' : 'w-64'} bg-white border-r border-purple-100 transform transition-all duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 shadow-xl shadow-purple-100/50 flex flex-col print:hidden`}>
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} ${isCollapsed ? 'p-4' : 'px-5 py-5'} bg-white border-b border-purple-100 transition-all duration-300`}>
                    <div className="flex items-center space-x-3 overflow-hidden">
                        <div className="w-9 h-9 flex items-center justify-center flex-shrink-0 bg-purple-100 rounded-xl shadow-lg shadow-purple-200/50 p-1">
                            <img src="/bitsathy-logo.png" alt="BITSATHY Logo" className="w-full h-full object-contain" />
                        </div>
                        <span className={`text-xl font-bold tracking-tight text-purple-700 whitespace-nowrap transition-opacity duration-300 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
                            BITSATHY
                        </span>
                    </div>
                </div>

                {/* Collapse Toggle Button - Desktop Only */}
                <button onClick={() => setIsCollapsed(!isCollapsed)}
                    className="hidden lg:flex absolute -right-3 top-20 bg-white border border-purple-200 text-purple-400 rounded-full p-1.5 shadow-md hover:bg-purple-50 hover:text-purple-600 transition-colors z-50">
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>

                <nav className="mt-4 px-3 space-y-1.5 flex-grow overflow-y-auto">
                    {[
                        { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
                        { id: 'editor', icon: Edit2, label: 'Editor' },
                        { id: 'print', icon: Download, label: 'Print View' },
                        { id: 'departments', icon: Building2, label: 'Departments' },
                        { id: 'subjects', icon: BookOpen, label: 'Subjects' },
                        { id: 'faculty', icon: Users, label: 'Faculty' },
                        // { id: 'students', icon: Users, label: 'Students & Reg.' },
                        { id: 'faculty_timetable', icon: BookOpen, label: 'Faculty Timetable' },
                        { id: 'student_timetable', icon: GraduationCap, label: 'Student Timetable' },
                        { id: 'venue_timetable', icon: MapPin, label: 'Venue Timetable' },
                        // { id: 'mappings', icon: GraduationCap, label: 'Course-Faculty' },
                        // { id: 'timeslots', icon: Clock, label: 'Time Slots' },
                        { id: 'venues', icon: MapPin, label: 'Venues' },
                        { id: 'venue_mappings', icon: Layers, label: 'Venue Mapping' },
                        { id: 'constraints', icon: Settings, label: 'Constraints & Rules' },
                        { id: 'user_constraints', icon: Filter, label: 'User Constraints' }
                    ].map(item => (
                        <button key={item.id} onClick={() => switchTab(item.id)}
                            title={isCollapsed ? item.label : ''}
                            className={`flex items-center ${isCollapsed ? 'justify-center px-0' : 'space-x-3 px-3'} w-full py-2.5 rounded-xl transition-all duration-200 font-medium ${activeTab === item.id ? 'bg-purple-100 text-purple-700 shadow-md shadow-purple-200/50 border border-purple-200' : 'text-gray-500 hover:bg-purple-50 hover:text-purple-600'}`}>
                            <item.icon className="w-5 h-5 flex-shrink-0" />
                            <span className={`whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>{item.label}</span>
                        </button>
                    ))}
                </nav>
                <div className="p-4 border-t border-purple-100">
                    <div className={`bg-purple-50/50 rounded-xl p-3 border border-purple-100 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} transition-all duration-300`}>
                        {user?.picture ? (
                            <img src={user.picture} alt="Profile" className="h-9 w-9 rounded-full flex-shrink-0 border-2 border-purple-200 object-cover" referrerPolicy="no-referrer" />
                        ) : (
                            <div className="h-9 w-9 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-xs flex-shrink-0">{getUserInitials()}</div>
                        )}
                        <div className={`overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>
                            <p className="text-sm font-bold text-gray-800 truncate" title={user?.name || 'User'}>{user?.name || 'User'}</p>
                            <p className="text-xs text-purple-500 truncate" title={user?.email || ''}>{user?.email || ''}</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        title="Logout"
                        className={`sidebar-logout-btn ${isCollapsed ? 'justify-center' : ''}`}
                    >
                        <LogOut className="w-4 h-4 flex-shrink-0" />
                        <span className={`whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>Logout</span>
                    </button>
                </div>
            </aside>

            {/* --- GENERATION ERRORS INLINE HAS MOVED TO DASHBOARD TAB --- */}


            <main className="flex-1 flex flex-col h-screen overflow-hidden relative print:overflow-visible print:h-auto print:block lg:pb-0 pb-16">
                <header className="bg-white border-b-2 border-purple-100 shadow-sm shadow-purple-50/50 z-10 px-4 md:px-8 py-4 flex items-center justify-between print:hidden">
                    <div className="flex items-center space-x-4">
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-xl hover:bg-violet-50 lg:hidden text-gray-600"><Menu className="w-6 h-6" /></button>
                        <h2 className="text-xl md:text-2xl font-bold text-purple-900 line-clamp-1">{pageTitle[activeTab] || 'Dashboard'}</h2>
                    </div>
                    <div className="flex items-center space-x-3">
                        {generationWarnings.length > 0 && (
                            <button 
                                onClick={() => setIsWarningsPanelOpen(!isWarningsPanelOpen)}
                                className="relative p-2 rounded-full text-amber-500 hover:bg-amber-50 transition-colors"
                            >
                                <Bell className="w-5 h-5 md:w-6 md:h-6 animate-pulse" />
                                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                            </button>
                        )}
                        {user?.picture ? (
                            <img src={user.picture} alt="Profile" className="h-8 w-8 md:h-10 md:w-10 rounded-full border-2 border-purple-200 shadow-sm object-cover" referrerPolicy="no-referrer" />
                        ) : (
                            <div className="h-8 w-8 md:h-10 md:w-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 font-bold border-2 border-purple-200 shadow-sm text-sm">{getUserInitials()}</div>
                        )}
                    </div>
                </header>

                <div className="flex-1 overflow-x-hidden overflow-y-auto bg-transparent p-4 md:p-6 custom-scrollbar">
                    <div className="max-w-7xl mx-auto">
                        {activeTab === 'dashboard' && renderDashboard()}
                        {activeTab === 'editor' && renderEditorPage()}
                        {activeTab === 'departments' && <DepartmentsManager />}
                        {activeTab === 'subjects' && renderSubjectsPage()}
                        {activeTab === 'faculty' && renderFacultyPage()}
                        {activeTab === 'students' && <StudentRegistrations />}
                        {activeTab === 'faculty_timetable' && <FacultyTimetable slots={slots} />}
                        { activeTab === 'student_timetable' && <StudentTimetable slots={slots} /> }
                        { activeTab === 'venue_timetable' && <VenueTimetable slots={slots} /> }
                        { activeTab === 'mappings' && renderMappingsPage() }
                        {activeTab === 'timeslots' && renderSlotsPage()}
                        {activeTab === 'venues' && <Venues />}
                        {activeTab === 'venue_mappings' && <VenueMapping />}
                        {activeTab === 'constraints' && <ConstraintsManager />}
                        {activeTab === 'user_constraints' && <UserConstraints />}
                        {/* New Print View Render */}
                        {activeTab === 'print' && renderPrintViewPage()}
                    </div>
                </div>
            </main>
{/* --- RIGHT SIDEBAR WARNINGS UI --- */}
            {isWarningsPanelOpen && generationWarnings.length > 0 && (
                <div 
                    className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsWarningsPanelOpen(false)}
                />
            )}
            <aside 
                className={`fixed lg:static inset-y-0 right-0 z-50 bg-white flex flex-col overflow-hidden transition-all duration-300 ease-in-out shadow-2xl lg:shadow-none print:hidden flex-shrink-0 ${isWarningsPanelOpen && generationWarnings.length > 0 ? 'w-80 sm:w-96 translate-x-0 border-l border-gray-200 opacity-100' : 'w-0 translate-x-full lg:translate-x-0 opacity-0 border-transparent'}`}
            >
                <div className="w-80 sm:w-96 h-full flex flex-col">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-amber-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100/50 rounded-xl">
                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-800">Generation Alerts</h2>
                            <p className="text-xs text-gray-500">{generationWarnings.length} notices found</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setIsWarningsPanelOpen(false)} 
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50/50">
                    {generationWarnings.map((w, i) => (
                        <div key={i} className="bg-white rounded-xl p-4 border border-red-50/80 shadow-sm shadow-red-100/20 relative group hover:shadow-md hover:border-red-100 transition-all">
                            <div className={`absolute top-0 left-0 w-1 h-full rounded-l-xl ${w.type === 'FACULTY' ? 'bg-orange-400' : 'bg-rose-400'}`}></div>
                            
                            <div className="pl-2">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-bold text-gray-800 break-words pr-2">{w.subject_name || w.course_code}</h4>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex-shrink-0 ${w.type === 'FACULTY' ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                        {w.type}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-500 font-medium mb-2 bg-slate-50 border border-slate-100 rounded-md p-1.5 inline-flex w-full">
                                    <MapPin className="w-3.5 h-3.5 text-blue-400" />
                                    <span>{w.course_code}</span>
                                    <span className="text-gray-300">|</span>
                                    <span className="capitalize">{w.day ? `${w.day} ` : ''}{String(w.period).replace(/period\s*/i, 'Period ')}</span>
                                    {w.section && (
                                        <>
                                            <span className="text-gray-300">|</span>
                                            <span>Section {w.section}</span>
                                        </>
                                    )}
                                </div>
                                
                                <p className="text-[13px] text-gray-700 leading-snug">{w.reason}</p>
                                
                                {w.resource_name && w.resource_name !== 'Unassigned' && (
                                    <p className="text-xs text-gray-500 mt-2 bg-gray-50 p-1.5 rounded border border-gray-100">
                                        Affected: <span className="font-semibold text-gray-700">{w.resource_name}</span>
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                {/* Clear button at bottom */}
                {generationWarnings.length > 0 && (
                    <div className="p-4 border-t border-gray-100 bg-white">
                        <button 
                            onClick={() => { setGenerationWarnings([]); setIsWarningsPanelOpen(false); }}
                            className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold transition-all"
                        >
                            Dismiss All
                        </button>
                    </div>
                )}
                </div>
            </aside>

            {/* Mobile Bottom Navigation Bar */}
            <nav className="lg:hidden fixed bottom-0 w-full bg-white/95 backdrop-blur-md border-t-2 border-purple-100 flex justify-around items-center z-40 pb-safe shadow-[0_-4px_20px_-10px_rgba(124,58,237,0.08)] transition-all">
                {[
                    { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
                    { id: 'subjects', icon: BookOpen, label: 'Subjects' },
                    { id: 'editor', icon: Edit2, label: 'Editor' },
                    { id: 'faculty', icon: Users, label: 'Faculty' },
                    { id: 'menu', icon: Menu, label: 'Menu', isMenu: true }
                ].map(item => (
                    <button 
                        key={item.id} 
                        onClick={() => item.isMenu ? setIsSidebarOpen(true) : switchTab(item.id)}
                        className={`flex flex-col items-center justify-center w-full py-3 h-16 transition-all duration-200 ${activeTab === item.id && !item.isMenu ? 'text-purple-600 font-bold' : 'text-gray-400 hover:text-purple-500'}`}
                    >
                        <div className={`relative ${activeTab === item.id && !item.isMenu ? 'transform -translate-y-1 transition-transform' : ''}`}>
                            <item.icon className={`w-6 h-6 mb-1 ${activeTab === item.id && !item.isMenu ? 'text-purple-600' : ''}`} />
                            {activeTab === item.id && !item.isMenu && (
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-purple-600 rounded-full"></span>
                            )}
                        </div>
                        <span className="text-[10px] tracking-wide">{item.label}</span>
                    </button>
                ))}
            </nav>

        </div>
    );
}


            

export default App;