const fs = require('fs');
let content = fs.readFileSync('admin/staff.html', 'utf8');

// Fix 1: Fix dropdown values to match DB exactly
content = content.replace(
    `<select id="staffCategory" class="form-select">
                                <option value="Waiters">Waiters</option>
                                <option value="Ushers">Ushers</option>
                                <option value="Protocol">Protocol</option>
                                <option value="Chauffeurs">Chauffeurs</option>
                                <option value="Security">Security</option>
                                <option value="Setup">Setup</option>
                                <option value="Coordination">Coordination</option>
                                <option value="Director">Director</option>
                                <option value="IT Head">IT Head</option>
                                <option value="Other">Other</option>
                            </select>`,
    `<select id="staffCategory" class="form-select" onchange="handleCategoryChange(this.value)">
                                <option value="">-- Select Role --</option>
                                <option value="Usher">Usher</option>
                                <option value="Waiter">Waiter</option>
                                <option value="Protocol">Protocol</option>
                                <option value="Chauffeur">Chauffeur</option>
                                <option value="Security">Security</option>
                                <option value="Setup">Setup</option>
                                <option value="Coordination">Coordination</option>
                                <option value="Director">Director</option>
                                <option value="IT Head">IT Head</option>
                                <option value="CEO">CEO</option>
                                <option value="Supervisor">Supervisor</option>
                                <option value="Other">Other</option>
                            </select>`
);

// Fix 2: Fix filter dropdown to match
content = content.replace(
    `<option value="">All Categories</option>
                                    <option value="Waiters">Waiters</option>
                                    <option value="Ushers">Ushers</option>
                                    <option value="Protocol">Protocol</option>
                                    <option value="Chauffeurs">Chauffeurs</option>
                                    <option value="Security">Security</option>
                                    <option value="Setup">Setup</option>
                                    <option value="Coordination">Coordination</option>
                                    <option value="Director">Director</option>
                                    <option value="IT Head">IT Head</option>
                                    <option value="Other">Other</option>`,
    `<option value="">All Categories</option>
                                    <option value="Usher">Ushers</option>
                                    <option value="Waiter">Waiters</option>
                                    <option value="Protocol">Protocol</option>
                                    <option value="Chauffeur">Chauffeurs</option>
                                    <option value="Security">Security</option>
                                    <option value="Setup">Setup</option>
                                    <option value="Coordination">Coordination</option>
                                    <option value="Director">Director</option>
                                    <option value="IT Head">IT Head</option>
                                    <option value="CEO">CEO</option>
                                    <option value="Supervisor">Supervisor</option>
                                    <option value="Other">Other</option>`
);

// Fix 3: Add handleCategoryChange function
content = content.replace(
    "function filterStaff() {",
    `function handleCategoryChange(val) {
    const customGroup = document.getElementById('customRoleGroup');
    if (customGroup) customGroup.style.display = val === 'Other' ? 'block' : 'none';
}
function filterStaff() {`
);

// Fix 4: Fix filter to use exact match
content = content.replace(
    "const catMatch = !category || (staff.category || '').toLowerCase().includes(category.toLowerCase()) || category.toLowerCase().includes((staff.category || '').toLowerCase());",
    "const catMatch = !category || (staff.category || '').toLowerCase() === category.toLowerCase();"
);

fs.writeFileSync('admin/staff.html', content);
console.log('Done');
