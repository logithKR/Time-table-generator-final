const fs = require('fs');
const apiPath = 'E:/time-table/Time-table-generator - Copy/frontend/src/utils/api.js';
let api = fs.readFileSync(apiPath, 'utf8');

const overrideApis = `
export const fetchSubjectOverrides = (dept, sem) => api.get(\`/legacy/subject-overrides?department_code=\${dept}&semester=\${sem}\`);
export const saveSubjectOverrides = (dept, sem, overrides) => api.post('/legacy/subject-overrides', { department_code: dept, semester: sem, overrides });

export const getErrorMessage =`;

const regex = /export const getErrorMessage =/;

if (api.match(regex)) {
    api = api.replace(regex, overrideApis);
    fs.writeFileSync(apiPath, api, 'utf8');
    console.log("SUCCESS: Patched api.js with override APIs");
} else {
    console.log("FAIL: Could not find getErrorMessage in api.js");
}
