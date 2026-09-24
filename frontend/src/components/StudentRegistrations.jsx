import React, { useState, useEffect } from 'react';
import { Search, Loader2, Trash2, Plus, Filter, Users, BookOpen, Layers } from 'lucide-react';
import { getStudents, getRegistrations, createStudent, deleteStudent, createRegistration, deleteRegistration, getCourses, getDepartments } from '../utils/api';

const StudentRegistrations = () => {
    const [activeTab, setActiveTab] = useState('students'); // 'students' or 'registrations'
    const [students, setStudents] = useState([]);
    const [registrations, setRegistrations] = useState([]);
    const [courses, setCourses] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(false);

    // Filters
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedCourse, setSelectedCourse] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [semesterFilter, setSemesterFilter] = useState('');

    // Modals
    const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
    const [isAddRegModalOpen, setIsAddRegModalOpen] = useState(false);
    const [newStudent, setNewStudent] = useState({ student_id: '', name: '', email: '', department_code: '' });
    const [newReg, setNewReg] = useState({ student_id: '', course_code: '', semester: 4 });

    useEffect(() => {
        fetchDepartments();
        fetchCourses();
    }, []);

    useEffect(() => {
        if (activeTab === 'students') {
            fetchStudents();
        } else {
            fetchRegistrations();
        }
    }, [activeTab, selectedDept, selectedCourse]);

    const fetchDepartments = async () => {
        try {
            const res = await getDepartments();
            setDepartments(res.data);
            // Auto-select first department so page isn't blank on entry
            if (res.data.length > 0) {
                setSelectedDept(res.data[0].department_code);
            }
        } catch (err) { }
    };

    const fetchCourses = async () => {
        try {
            const res = await getCourses();
            setCourses(res.data);
        } catch (err) { }
    };

    const fetchStudents = async () => {
        if (!selectedDept) {
            setStudents([]);
            return;
        }
        setLoading(true);
        try {
            const res = await getStudents(selectedDept);
            setStudents(res.data);
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    const fetchRegistrations = async () => {
        setLoading(true);
        try {
            const res = await getRegistrations(selectedCourse || '');
            setRegistrations(res.data);
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    const handleCreateStudent = async (e) => {
        e.preventDefault();
        try {
            await createStudent(newStudent);
            setIsAddStudentModalOpen(false);
            setNewStudent({ student_id: '', name: '', email: '', department_code: '' });
            fetchStudents();
        } catch (err) {
            alert("Failed to create student. ID might already exist.");
        }
    };

    const handleDeleteStudent = async (id) => {
        if (!window.confirm("Are you sure? This will delete all course registrations for this student!")) return;
        try {
            await deleteStudent(id);
            fetchStudents();
        } catch (err) { }
    };

    const handleCreateRegistration = async (e) => {
        e.preventDefault();
        try {
            await createRegistration(newReg);
            setIsAddRegModalOpen(false);
            setNewReg({ student_id: '', course_code: '', semester: 4 });
            fetchRegistrations();
        } catch (err) {
            alert("Failed to add registration. Student might already be in this course, or course doesn't exist.");
        }
    };

    const handleDeleteRegistration = async (id) => {
        if (!window.confirm("Are you sure you want to remove this registration?")) return;
        try {
            await deleteRegistration(id);
            fetchRegistrations();
        } catch (err) { }
    };

    const filteredStudents = students.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.student_id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredRegistrations = registrations.filter(r => {
        const matchesSearch = r.student_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.course_code.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSem = !semesterFilter || String(r.semester) === semesterFilter;
        return matchesSearch && matchesSem;
    });

    // Get unique semesters for filter
    const uniqueSemesters = [...new Set(registrations.map(r => r.semester))].sort((a, b) => a - b);

    // Filter courses (show all, don't restrict by dept so they can find Open Electives)
    const filteredCourses = courses;

    const currentCount = activeTab === 'students' ? filteredStudents.length : filteredRegistrations.length;
    const totalCount = activeTab === 'students' ? students.length : registrations.length;

    return (
        <div className="space-y-4">
            {/* Header + Tabs */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h2 className="text-xl font-bold text-gray-800">Students & Registrations</h2>
                    <p className="text-sm text-gray-500">Manage individuals and their course enrollments.</p>
                </div>
                <div className="flex bg-violet-50 p-1 rounded-xl border border-violet-100">
                    <button
                        onClick={() => { setActiveTab('students'); setSearchTerm(''); }}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all text-sm font-semibold ${activeTab === 'students' ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'text-violet-600 hover:bg-violet-100'}`}
                    >
                        <Users className="w-4 h-4" />
                        <span>Students</span>
                    </button>
                    <button
                        onClick={() => { setActiveTab('registrations'); setSearchTerm(''); }}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all text-sm font-semibold ${activeTab === 'registrations' ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'text-violet-600 hover:bg-violet-100'}`}
                    >
                        <BookOpen className="w-4 h-4" />
                        <span>Registrations</span>
                    </button>
                </div>
            </div>

            {/* Filter Bar — Consistent violet style */}
            <div className="flex flex-wrap gap-3 items-center bg-violet-50 p-4 rounded-2xl border border-violet-100 shadow-sm">
                <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-violet-500" />
                    <span className="text-sm font-semibold text-violet-700">Filter:</span>
                </div>

                {/* Department Dropdown — shown on both tabs */}
                <select
                    value={selectedDept}
                    onChange={(e) => { setSelectedDept(e.target.value); setSelectedCourse(''); }}
                    className="p-2.5 border border-violet-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400 focus:border-violet-400 focus:outline-none shadow-sm font-medium text-gray-700 cursor-pointer transition-all hover:border-violet-300"
                >
                    <option value="">All Departments</option>
                    {departments.map(d => (
                        <option key={d.department_code} value={d.department_code}>{d.department_code}</option>
                    ))}
                </select>

                {/* Course Dropdown — registrations tab only */}
                {activeTab === 'registrations' && (
                    <>
                        <select
                            value={selectedCourse}
                            onChange={(e) => setSelectedCourse(e.target.value)}
                            className="p-2.5 border border-violet-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400 focus:border-violet-400 focus:outline-none shadow-sm font-medium text-gray-700 cursor-pointer transition-all hover:border-violet-300 max-w-xs"
                        >
                            <option value="">All Courses</option>
                            {filteredCourses.map(c => (
                                <option key={c.course_code} value={c.course_code}>{c.course_code} - {c.course_name}</option>
                            ))}
                        </select>

                        {/* Semester Filter */}
                        {uniqueSemesters.length > 0 && (
                            <select
                                value={semesterFilter}
                                onChange={(e) => setSemesterFilter(e.target.value)}
                                className="p-2.5 border border-violet-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-400 focus:border-violet-400 focus:outline-none shadow-sm font-medium text-gray-700 cursor-pointer transition-all hover:border-violet-300"
                            >
                                <option value="">All Semesters</option>
                                {uniqueSemesters.map(s => (
                                    <option key={s} value={String(s)}>Semester {s}</option>
                                ))}
                            </select>
                        )}
                    </>
                )}

                {/* Search */}
                <div className="flex-1 min-w-[200px]">
                    <div className="relative group">
                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-violet-500 transition-colors" />
                        <input
                            type="text"
                            placeholder={`Search ${activeTab === 'students' ? 'by name, ID...' : 'by student ID, course...'}`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 p-2.5 border border-violet-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-100 focus:border-violet-400 focus:outline-none shadow-sm placeholder:text-gray-400 font-medium text-gray-700 transition-all hover:border-violet-300"
                        />
                    </div>
                </div>

                {/* Count + Add Button */}
                <div className="text-xs text-violet-600 font-semibold bg-white px-4 py-2.5 rounded-xl border border-violet-100 shadow-sm">
                    Showing {currentCount} of {totalCount}
                </div>
                <button
                    onClick={() => activeTab === 'students' ? setIsAddStudentModalOpen(true) : setIsAddRegModalOpen(true)}
                    className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-violet-200 hover:shadow-violet-300 transition-all whitespace-nowrap hover:-translate-y-0.5 active:scale-95"
                >
                    <Plus className="w-4 h-4" />
                    {activeTab === 'students' ? 'Add Student' : 'Add Registration'}
                </button>
            </div>

            {/* Data Display */}
            <div className="bg-white rounded-2xl border border-violet-100 shadow-lg shadow-violet-50/50 overflow-hidden">
                {loading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        {activeTab === 'students' ? (
                                            <>
                                                <th className="p-3.5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Student ID</th>
                                                <th className="p-3.5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Name</th>
                                                <th className="p-3.5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Email</th>
                                                <th className="p-3.5 text-center font-semibold text-gray-500 text-xs uppercase tracking-wider">Department</th>
                                                
                                            </>
                                        ) : (
                                            <>
                                                <th className="p-3.5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">ID</th>
                                                <th className="p-3.5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Student ID</th>
                                                <th className="p-3.5 text-left font-semibold text-gray-500 text-xs uppercase tracking-wider">Course Code</th>
                                                <th className="p-3.5 text-center font-semibold text-gray-500 text-xs uppercase tracking-wider">Semester</th>
                                                
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeTab === 'students' ? (
                                        filteredStudents.length > 0 ? (
                                            filteredStudents.map((s, i) => (
                                                <tr key={s.student_id} className={`border-b border-violet-50 hover:bg-violet-50/40 transition-colors duration-200 ${i % 2 === 0 ? 'bg-white' : 'bg-purple-50/20'}`}>
                                                    <td className="p-3.5 font-mono font-bold text-violet-800">{s.student_id}</td>
                                                    <td className="p-3.5 text-gray-800 font-medium">{s.name}</td>
                                                    <td className="p-3.5 text-gray-500">{s.email || '-'}</td>
                                                    <td className="p-3.5 text-center">
                                                        <span className="bg-violet-100 text-violet-800 px-2.5 py-1 rounded-full text-xs font-bold">
                                                            {s.department_code}
                                                        </span>
                                                    </td>
                                                    <td className="p-3.5 text-center">
                                                        <button onClick={() => handleDeleteStudent(s.student_id)} className="text-red-300 hover:text-red-600 transition-colors p-1 rounded-lg hover:bg-red-50" title="Delete">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr><td colSpan="5" className="py-12 text-center text-gray-400 text-sm">{selectedDept ? 'No students found.' : 'Select a department to view students.'}</td></tr>
                                        )
                                    ) : (
                                        filteredRegistrations.length > 0 ? (
                                            filteredRegistrations.map((r, i) => (
                                                <tr key={r.id} className={`border-b border-violet-50 hover:bg-violet-50/40 transition-colors duration-200 ${i % 2 === 0 ? 'bg-white' : 'bg-purple-50/20'}`}>
                                                    <td className="p-3.5 text-gray-400 text-sm font-mono">#{r.id}</td>
                                                    <td className="p-3.5 font-mono font-bold text-violet-800">{r.student_id}</td>
                                                    <td className="p-3.5 text-violet-600 font-bold">{r.course_code}</td>
                                                    <td className="p-3.5 text-center">
                                                        <span className="bg-violet-100 text-violet-800 px-2.5 py-1 rounded-full text-xs font-bold">{r.semester}</span>
                                                    </td>
                                                    <td className="p-3.5 text-center">
                                                        <button onClick={() => handleDeleteRegistration(r.id)} className="text-red-300 hover:text-red-600 transition-colors p-1 rounded-lg hover:bg-red-50" title="Delete">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr><td colSpan="5" className="py-12 text-center text-gray-400 text-sm">{selectedCourse ? 'No registrations found.' : 'Select a course to view registrations.'}</td></tr>
                                        )
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Stacked Cards View */}
                        <div className="md:hidden flex flex-col p-2 space-y-2 bg-slate-50">
                            {activeTab === 'students' ? (
                                filteredStudents.length > 0 ? (
                                    filteredStudents.map(s => (
                                        <div key={s.student_id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-3 relative">
                                            <div className="flex justify-between items-start pr-8">
                                                <div>
                                                    <h4 className="font-bold text-gray-800">{s.name}</h4>
                                                    <span className="font-mono text-sm text-violet-700 font-semibold">{s.student_id}</span>
                                                </div>
                                                <span className="bg-violet-100 text-violet-800 px-2 py-1 rounded-lg text-xs font-bold">{s.department_code}</span>
                                            </div>
                                            <div className="text-xs text-gray-500 break-all">
                                                {s.email || 'No email provided'}
                                            </div>
                                            <button 
                                                onClick={() => handleDeleteStudent(s.student_id)} 
                                                className="absolute top-4 right-4 p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-8 text-center text-gray-400 text-sm">{selectedDept ? 'No students found.' : 'Select a department to view students.'}</div>
                                )
                            ) : (
                                filteredRegistrations.length > 0 ? (
                                    filteredRegistrations.map(r => (
                                        <div key={r.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-2 relative">
                                            <div className="flex justify-between items-center pr-8 border-b border-gray-50 pb-2">
                                                <span className="font-mono font-bold text-violet-800">{r.student_id}</span>
                                                <span className="text-xs text-gray-400 font-mono">#{r.id}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-1">
                                                <span className="text-sm font-bold text-gray-700 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">{r.course_code}</span>
                                                <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg text-xs font-bold border border-indigo-100">Sem {r.semester}</span>
                                            </div>
                                            <button 
                                                onClick={() => handleDeleteRegistration(r.id)} 
                                                className="absolute top-3 right-3 p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-8 text-center text-gray-400 text-sm">{selectedCourse ? 'No registrations found.' : 'Select a course to view registrations.'}</div>
                                )
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Add Student Modal */}
            }

            {/* Add Registration Modal */}
            }
        </div>
    );
};

export default StudentRegistrations;
