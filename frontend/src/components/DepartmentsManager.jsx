import React, { useState, useEffect } from 'react';
import { getDepartments, createDepartment, updateDepartment, deleteDepartment, getDepartmentCapacities, upsertDepartmentCapacity } from '../utils/api';
import { Building2, Plus, Pencil, Check, X, Trash2, Users } from 'lucide-react';

const DepartmentsManager = () => {
    const [departments, setDepartments] = useState([]);
    const [capacities, setCapacities] = useState({}); // { dept_code: [ {semester, student_count} ] }
    const [isAdding, setIsAdding] = useState(false);

    // Edit state
    const [editingDept, setEditingDept] = useState(null);
    const [selectedSemester, setSelectedSemester] = useState(6);
    const [editCount, setEditCount] = useState('');

    useEffect(() => {
        fetchDepartments();
    }, []);

    const fetchDepartments = async () => {
        try {
            const res = await getDepartments();
            setDepartments(res.data);

            // Fetch capacities for all departments
            const caps = {};
            for (let d of res.data) {
                const cRes = await getDepartmentCapacities(d.department_code);
                caps[d.department_code] = cRes.data;
            }
            setCapacities(caps);

        } catch (err) {
            console.error("Failed to fetch departments", err);
        }
    };

    const handleAddSubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const code = fd.get('department_code').toUpperCase();

        try {
            await createDepartment({
                department_code: code,
                student_count: 0
            });
            await fetchDepartments();
            setIsAdding(false);
            e.target.reset();
        } catch (err) {
            alert(api.getErrorMessage(err));
        }
    };

    const handleSaveCapacity = async (code) => {
        try {
            await upsertDepartmentCapacity(code, selectedSemester, {
                student_count: parseInt(editCount) || 0
            });
            await fetchDepartments();
            setEditingDept(null);
            setEditCount('');
        } catch (err) {
            alert(api.getErrorMessage(err));
        }
    };

    const handleDelete = async (code) => {
        if (!window.confirm(`Are you sure you want to delete ${code}? This can only be done if no faculty or courses are linked.`)) return;
        try {
            await deleteDepartment(code);
            await fetchDepartments();
        } catch (err) {
            alert(api.getErrorMessage(err));
        }
    };



    const startEditCapacity = (deptCode) => {
        setEditingDept(deptCode);
        const currentCap = capacities[deptCode]?.find(c => c.semester === selectedSemester)?.student_count || 0;
        setEditCount(currentCap);
    };

    const cancelEdit = () => {
        setEditingDept(null);
        setEditCount('');
    };

    const handleSemesterChange = (deptCode, newSem) => {
        setSelectedSemester(newSem);
        if (editingDept === deptCode) {
            const currentCap = capacities[deptCode]?.find(c => c.semester === newSem)?.student_count || 0;
            setEditCount(currentCap);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Building2 className="w-6 h-6 text-indigo-600" /> Department Manager
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">Manage departments and semester-wise student capacities.</p>
                </div>

                
            </div>

            

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {departments.map(dept => {
                    const deptCaps = capacities[dept.department_code] || [];
                    const selectedCap = deptCaps.find(c => c.semester === selectedSemester)?.student_count || 0;

                    return (
                        <div key={dept.department_code} className="bg-white rounded-2xl border border-indigo-100 shadow-sm hover:shadow-md transition-shadow p-5 relative group overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>

                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="text-xl font-black text-slate-800 tracking-tight">
                                        {dept.department_code}
                                    </h4>
                                    <p className="text-xs text-slate-400 font-medium">Department Code</p>
                                </div>

                                    <div className="flex items-center gap-2">
                                        <button onClick={() => handleDelete(dept.department_code)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors sm:opacity-0 sm:group-hover:opacity-100" title="Delete Department">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center text-sm font-medium text-slate-600 mb-1">
                                        <Users className="w-4 h-4 mr-1.5" /> Semester Capacity
                                    </div>
                                    <select
                                        className="text-sm p-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none bg-white font-medium text-slate-700"
                                        value={selectedSemester}
                                        onChange={(e) => handleSemesterChange(dept.department_code, parseInt(e.target.value))}
                                    >
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                                            <option key={s} value={s}>Semester {s}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-center justify-end">
                                    {editingDept === dept.department_code ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                autoFocus
                                                value={editCount}
                                                onChange={(e) => setEditCount(e.target.value)}
                                                className="w-24 p-2 text-sm border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-0 focus:border-indigo-500"
                                                min="0"
                                            />
                                            
                                            <button onClick={cancelEdit} className="bg-slate-200 text-slate-600 hover:bg-slate-300 p-2 rounded-lg transition-colors" title="Cancel">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-baseline">
                                                <span className="text-3xl font-black text-indigo-700">
                                                    {selectedCap}
                                                </span>
                                                <span className="text-xs text-slate-500 ml-1 font-medium">students</span>
                                            </div>
                                            <button onClick={() => startEditCapacity(dept.department_code)} className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-100" title="Edit Capacity">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}

                {departments.length === 0 && !isAdding && (
                    <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-2xl border border-dashed border-slate-300">
                        No departments found. Click "Add Department" to start.
                    </div>
                )}
            </div>
        </div>
    );
};

export default DepartmentsManager;
