const fs = require('fs');
const filepath = 'E:/time-table/Time-table-generator - Copy/frontend/src/components/DepartmentsManager.jsx';
let content = fs.readFileSync(filepath, 'utf8');

const target = `<button onClick={() => startEditCapacity(dept.department_code)} className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-100" title="Edit Capacity">
                        <Pencil className="w-4 h-4" />
                    </button>`;

const replacement = `{/* <button onClick={() => startEditCapacity(dept.department_code)} className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-100" title="Edit Capacity">
                        <Pencil className="w-4 h-4" />
                    </button> */}`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filepath, content, 'utf8');
    console.log("SUCCESS: Button commented out.");
} else {
    console.log("Target not found.");
}
