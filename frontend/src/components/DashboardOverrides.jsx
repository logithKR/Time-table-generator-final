import React, { useState, useEffect } from 'react';
import { Save, BookOpen, RotateCcw } from 'lucide-react';
import * as api from '../utils/api';

export default function DashboardOverrides({ selectedDept, selectedSem, timetableEntries = [] }) {
    const [courses, setCourses] = useState([]);
    const [overrides, setOverrides] = useState({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!selectedDept || !selectedSem) {
            setCourses([]);
            setOverrides({});
            return;
        }
        fetchData();
    }, [selectedDept, selectedSem]);

    const computeOriginalAllocation = (c) => {
        const theory = (c.lecture_hours || 0) + (c.tutorial_hours || 0);
        const lab = c.practical_hours || 0;
        let labBlocks = lab >= 2 ? Math.floor(lab / 2) : 0;
        let adjTheory = theory;
        if (lab % 2 === 1) adjTheory += 1;
        const total = c.weekly_sessions || (adjTheory + labBlocks * 2);
        
        return {
            theory_per_week: adjTheory,
            lab_per_week: lab,
            total_per_week: total
        };
    };

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [coursesRes, overridesRes] = await Promise.all([
                api.getCourses(selectedDept, selectedSem),
                api.fetchSubjectOverrides(selectedDept, selectedSem)
            ]);
            
            const validCourses = (coursesRes.data || []).filter(c => !c.is_open_elective);
            setCourses(validCourses);
            
            const stateOverrides = {};
            
            validCourses.forEach(c => {
                stateOverrides[c.course_code] = computeOriginalAllocation(c);
            });
            
            if (overridesRes.data && overridesRes.data.data) {
                overridesRes.data.data.forEach(o => {
                    if (stateOverrides[o.course_code]) {
                        stateOverrides[o.course_code] = {
                            theory_per_week: o.theory_per_week,
                            lab_per_week: o.lab_per_week,
                            total_per_week: o.total_per_week
                        };
                    }
                });
            }
            
            setOverrides(stateOverrides);
        } catch (err) {
            setError('Failed to load courses or overrides.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (courseCode, field, value) => {
        const val = Math.max(0, parseInt(value) || 0);
        setOverrides(prev => {
            const currentOverride = prev[courseCode] || { theory_per_week: 0, lab_per_week: 0, total_per_week: 0 };
            const newOverride = { ...currentOverride, [field]: val };
            newOverride.total_per_week = newOverride.theory_per_week + newOverride.lab_per_week;
            return { ...prev, [courseCode]: newOverride };
        });
    };

    const handleRestoreOriginal = (courseCode) => {
        const course = courses.find(c => c.course_code === courseCode);
        if (!course) return;
        setOverrides(prev => ({
            ...prev,
            [courseCode]: computeOriginalAllocation(course)
        }));
    };

    const handleRestoreAll = () => {
        const restored = {};
        courses.forEach(c => {
            restored[c.course_code] = computeOriginalAllocation(c);
        });
        setOverrides(restored);
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const payload = Object.keys(overrides).map(code => ({
                course_code: code,
                theory_per_week: overrides[code].theory_per_week,
                lab_per_week: overrides[code].lab_per_week,
                total_per_week: overrides[code].total_per_week
            }));
            
            await api.saveSubjectOverrides(selectedDept, selectedSem, payload);
            alert("Temporary subject overrides saved successfully! The timetable generator will now use these values.");
        } catch (err) {
            setError('Failed to save overrides.');
            console.error(err);
        } finally {
            setSaving(false);
        }
    };
    
    const countGeneratedClasses = (courseCode) => {
        if (!timetableEntries || timetableEntries.length === 0) return 0;
        return timetableEntries.filter(e => e.course_code === courseCode).length;
    };

    if (!selectedDept || !selectedSem) return null;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6 mt-6">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                        <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 text-lg">Dashboard Subject Allocation Override</h3>
                        <p className="text-sm text-gray-500 font-medium">Temporary weekly class limits for generation (does not modify master data)</p>
                    </div>
                </div>
                {courses.length > 0 && (
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleRestoreAll} 
                            disabled={saving}
                            className="flex items-center gap-2 bg-white border-2 border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50 px-4 py-2 rounded-xl font-bold transition-all text-sm"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Restore All to Original
                        </button>
                        <button 
                            onClick={handleSave} 
                            disabled={saving}
                            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold transition-all text-sm shadow-sm"
                        >
                            <Save className="w-4 h-4" />
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                )}
            </div>
            
            {loading ? (
                <div className="p-8 text-center text-gray-400 font-medium">Loading courses...</div>
            ) : error ? (
                <div className="p-4 bg-red-50 text-red-600 text-sm font-bold border-t border-red-100">{error}</div>
            ) : courses.length === 0 ? (
                <div className="p-8 text-center text-gray-400 font-medium">No courses found for this department and semester.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[11px] tracking-wider">
                            <tr>
                                <th className="px-5 py-3">Subject</th>
                                <th className="px-4 py-3 text-center border-l border-gray-100">L</th>
                                <th className="px-4 py-3 text-center">T</th>
                                <th className="px-4 py-3 text-center">P</th>
                                <th className="px-4 py-3 text-center border-r border-gray-100">C</th>
                                <th className="px-5 py-3 text-center">Theory / Week</th>
                                <th className="px-5 py-3 text-center">Lab / Week</th>
                                <th className="px-5 py-3 text-center">Total / Week</th>
                                <th className="px-5 py-3 text-center bg-green-50/50 text-green-700 border-l border-green-100">Generated<br/>Classes</th>
                                <th className="px-3 py-3 text-center"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {courses.map(c => {
                                const generatedCount = countGeneratedClasses(c.course_code);
                                const totalPerWeek = overrides[c.course_code]?.total_per_week ?? 0;
                                const isMismatch = timetableEntries.length > 0 && generatedCount !== totalPerWeek;
                                
                                return (
                                <tr key={c.course_code} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-5 py-4">
                                        <div className="font-bold text-gray-800">{c.course_name}</div>
                                        <div className="text-xs text-gray-400 font-medium mt-0.5">{c.course_code}</div>
                                    </td>
                                    <td className="px-4 py-4 text-center font-bold text-gray-400 border-l border-gray-50">{c.lecture_hours || 0}</td>
                                    <td className="px-4 py-4 text-center font-bold text-gray-400">{c.tutorial_hours || 0}</td>
                                    <td className="px-4 py-4 text-center font-bold text-gray-400">{c.practical_hours || 0}</td>
                                    <td className="px-4 py-4 text-center font-bold text-gray-400 border-r border-gray-50">{c.credits || 0}</td>
                                    
                                    <td className="px-5 py-3 text-center">
                                        <input 
                                            type="number" 
                                            min="0"
                                            value={overrides[c.course_code]?.theory_per_week ?? 0} 
                                            onChange={(e) => handleInputChange(c.course_code, 'theory_per_week', e.target.value)}
                                            className="w-16 text-center border-2 border-gray-200 rounded-lg p-1.5 font-bold text-gray-700 focus:border-indigo-500 focus:ring-0 outline-none bg-white"
                                        />
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <input 
                                            type="number" 
                                            min="0"
                                            value={overrides[c.course_code]?.lab_per_week ?? 0} 
                                            onChange={(e) => handleInputChange(c.course_code, 'lab_per_week', e.target.value)}
                                            className="w-16 text-center border-2 border-gray-200 rounded-lg p-1.5 font-bold text-gray-700 focus:border-indigo-500 focus:ring-0 outline-none bg-white"
                                        />
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <input 
                                            type="number" 
                                            value={totalPerWeek} 
                                            readOnly
                                            className="w-16 text-center border-2 border-gray-100 rounded-lg p-1.5 font-bold text-gray-500 bg-gray-100 cursor-not-allowed outline-none"
                                        />
                                    </td>
                                    <td className={`px-5 py-3 text-center border-l border-gray-50 font-black text-lg ${isMismatch ? 'text-red-500' : (generatedCount > 0 ? 'text-green-600' : 'text-gray-300')}`}>
                                        {generatedCount > 0 ? generatedCount : '-'}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                        <button 
                                            onClick={() => handleRestoreOriginal(c.course_code)}
                                            title="Restore Original Subject Data"
                                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
