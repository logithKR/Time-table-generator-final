import React from 'react';
import { Monitor, RotateCw, AlertTriangle, X, Info, Edit2, FileSpreadsheet, Download } from 'lucide-react';

const Dashboard = ({
    departments,
    semesters,
    selectedDept,
    setSelectedDept,
    selectedSem,
    setSelectedSem,
    mentorDay,
    setMentorDay,
    mentorPeriod,
    setMentorPeriod,
    handleGenerate,
    loading,
    generationErrors,
    setGenerationErrors,
    renderTimetable,
    setEditorDept,
    setEditorSem,
    setActiveTab,
    handleDownloadExcel,
    handleDownloadPDF
}) => {
    return (
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
                        <select className="w-full p-2.5 border border-violet-200 rounded-xl focus:ring-2 focus:ring-violet-400 focus:border-violet-400 focus:outline-none shadow-sm bg-white font-medium text-gray-700 cursor-pointer transition-all hover:border-violet-300" value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
                            <option value="">Select Dept</option>
                            {departments.map(d => <option key={d.department_code} value={d.department_code}>{d.department_code}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Semester</label>
                        <select className="w-full p-2.5 border border-violet-200 rounded-xl focus:ring-2 focus:ring-violet-400 focus:border-violet-400 focus:outline-none shadow-sm bg-white font-medium text-gray-700 cursor-pointer transition-all hover:border-violet-300" value={selectedSem} onChange={(e) => setSelectedSem(e.target.value)}>
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
                    <button onClick={handleGenerate} disabled={loading} className={`w-full py-2.5 px-4 rounded-xl text-white font-bold flex items-center justify-center space-x-2 transition-all ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-200 hover:shadow-violet-300 hover:-translate-y-0.5 active:scale-95'}`}>
                        {loading ? <RotateCw className="w-5 h-5 animate-spin" /> : <Monitor className="w-5 h-5" />}
                        <span>{loading ? 'Processing...' : 'Generate'}</span>
                    </button>
                </div>
            </div>
            
            
            {selectedDept && selectedSem && (
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
                                        
                                        <div className="mt-3 flex items-start gap-2 text-sm text-gray-600 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                                            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                            <p><strong>Suggestion:</strong> {err.suggestion}</p>
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
        </div>
    );
};

export default Dashboard;
