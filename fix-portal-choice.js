const fs = require('fs');
let content = fs.readFileSync('staff-system/views/auth/portal-choice.ejs', 'utf8');

// Replace welcome and logo section
content = content.replace(
    `        <div class="choice-logo">Emerald Pearland Events</div>
        <div class="choice-welcome">Welcome, <%= user && user.name ? user.name.split(' ')[0] : 'Admin' %>!</div>
        <div class="choice-sub">How would you like to log in today?</div>`,
    `        <img src="/logo2.png" style="height:48px;width:auto;object-fit:contain;margin-bottom:12px;" alt="Emerald">
        <div class="choice-logo">Emerald Pearland Events</div>
        <div class="choice-welcome">
            Welcome back, 
            <% const _title = user && user.title ? user.title : (user && user.role === 'Admin' ? 'Admin' : 'Staff'); %>
            <% const _firstName = user && user.name ? user.name.split(' ')[0] : 'Admin'; %>
            <%= _firstName %>!
        </div>
        <div style="font-size:0.78rem;color:var(--gold);font-weight:600;margin-bottom:4px;letter-spacing:0.05em;"><%= _title %></div>
        <div class="choice-sub">How would you like to access the system today?</div>`
);

fs.writeFileSync('staff-system/views/auth/portal-choice.ejs', content);
console.log('Done');
