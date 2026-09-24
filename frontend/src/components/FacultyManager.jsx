import React, { useState, useEffect } from 'react';
import { getFaculties, createFaculty, getSubjects } from '../utils/api';
import { Plus, Users, Mail, BookOpen } from 'lucide-react';

const FacultyManager = () => {
    const [faculties, setFaculties] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [isAdding, setIsAdding] = useState(false);
    const [newFaculty, setNewFaculty] = useState({
        name: '', email: '', department: '', max_load: 18, availability: { "Monday": [0, 1, 2, 3, 4, 5, 6, 7] }, subject_ids: []
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [facRes, subRes] = await Promise.all([getFaculties(), getSubjects()]);
            setFaculties(facRes.data);
            setSubjects(subRes.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchFaculties = async () => {
        try {
            const res = await getFaculties();
            setFaculties(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const toggleSubject = (id) => {
        if (newFaculty.subject_ids.includes(id)) {
            setNewFaculty({ ...newFaculty, subject_ids: newFaculty.subject_ids.filter(sid => sid !== id) });
        } else {
            setNewFaculty({ ...newFaculty, subject_ids: [...newFaculty.subject_ids, id] });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await createFaculty(newFaculty);
            setIsAdding(false);
            fetchFaculties();
            alert("Faculty member saved successfully!");
        } catch (err) {
            console.error(err);
            alert("Error saving member: " + (api.getErrorMessage(err)));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Faculty</h3>
                
            </div>

            {faculties.length === 0 ? (
                <div className="text-center py-20 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                    <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-600 mb-1">No Faculty Members</h3>
                    <p className="text-slate-500 mb-6 max-w-xs mx-auto">Add faculty to assign subjects and generate timetables.</p>
                    
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {faculties.map(f => (
                        <div key={f.id} className="glass-card p-6">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                                    {f.name[0]}
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-800">{f.name}</h4>
                                    <p className="text-xs text-slate-500 uppercase tracking-wider">{f.department}</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                    <Mail size={14} />
                                    <span>{f.email}</span>
                                </div>
                                <div className="text-xs font-semibold text-primary-600 bg-primary-50 px-2 py-1 rounded inline-block">
                                    Max Load: {f.max_load} hrs/week
                                </div>
                                {f.subjects && f.subjects.length > 0 && (
                                    <div className="mt-2 text-xs text-slate-500">
                                        <p className="font-semibold mb-1">Teaches:</p>
                                        <div className="flex flex-wrap gap-1">
                                            {f.subjects.map(s => (
                                                <span key={s.id} className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{s.name}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isAdding && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                        <h4 className="text-xl font-bold mb-6">Add Faculty Member</h4>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <input
                                placeholder="Full Name"
                                className="input-field"
                                value={newFaculty.name}
                                onChange={e => setNewFaculty({ ...newFaculty, name: e.target.value })}
                                required
                            />
                            <input
                                type="email"
                                placeholder="Email Address"
                                className="input-field"
                                value={newFaculty.email}
                                onChange={e => setNewFaculty({ ...newFaculty, email: e.target.value })}
                                required
                            />
                            <input
                                placeholder="Department"
                                className="input-field"
                                value={newFaculty.department}
                                onChange={e => setNewFaculty({ ...newFaculty, department: e.target.value })}
                                required
                            />
                            <input
                                type="number"
                                placeholder="Max Load (hrs/week)"
                                className="input-field"
                                value={newFaculty.max_load}
                                onChange={e => setNewFaculty({ ...newFaculty, max_load: parseInt(e.target.value) })}
                                required
                            />

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Assign Subjects</label>
                                <div className="border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                                    {subjects.map(sub => (
                                        <div key={sub.id} className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id={`sub-${sub.id}`}
                                                checked={newFaculty.subject_ids.includes(sub.id)}
                                                onChange={() => toggleSubject(sub.id)}
                                                className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                                            />
                                            <label htmlFor={`sub-${sub.id}`} className="text-sm text-slate-700 cursor-pointer select-none">
                                                {sub.name} <span className="text-slate-400 text-xs">({sub.code})</span>
                                            </label>
                                        </div>
                                    ))}
                                    {subjects.length === 0 && <p className="text-xs text-slate-400 italic">No subjects available.</p>}
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setIsAdding(false)} className="flex-1 py-3 text-slate-500 font-medium">Cancel</button>
                                <button type="submit" className="flex-1 btn-primary">Save Member</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FacultyManager;
