const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, 'admin', 'dashboard.html');
const bookingPath = path.join(__dirname, 'booking.html');
const newBookingPath = path.join(__dirname, 'admin', 'new-booking.html');

// Read templates
let dashboardHtml = fs.readFileSync(dashboardPath, 'utf8');
let bookingHtml = fs.readFileSync(bookingPath, 'utf8');

// Extract booking styles
const styleStart = bookingHtml.indexOf('<style>');
const styleEnd = bookingHtml.indexOf('</style>') + 8;
const bookingStyles = bookingHtml.substring(styleStart, styleEnd);

// Extract booking form section
const sectionStart = bookingHtml.indexOf('<section class="booking-section"');
const sectionEnd = bookingHtml.indexOf('</section>', sectionStart) + 10;
let bookingSection = bookingHtml.substring(sectionStart, sectionEnd);

// Wrap booking section in cinematic bg
const formContent = `
    <!-- CINEMATIC BACKGROUND -->
    <div class="cinematic-bg">
        <div class="light-beam beam-1"></div>
        <div class="light-beam beam-2"></div>
        <div class="light-beam beam-3"></div>
        <!-- Particles -->
        <div class="particle" style="top: 20%; left: 30%;"></div>
        <div class="particle" style="top: 60%; left: 70%; animation-delay: 2s;"></div>
        <div class="particle" style="top: 80%; left: 20%; animation-delay: 5s;"></div>
        <div class="particle" style="top: 30%; left: 80%; animation-delay: 7s;"></div>
    </div>
    
    ${bookingSection}
`;

// Extract layout from dashboard (Header, Sidebar, Basic scripts)
// We look for <!-- MAIN CONTENT -->
const mainContentStart = dashboardHtml.indexOf('<!-- MAIN CONTENT -->');
const mainContentInnerStart = dashboardHtml.indexOf('<div class="header">', mainContentStart);

// We need to replace everything after <div class="header"> .... </div>
// up to the closing main content wrapper.
const headerEnd = dashboardHtml.indexOf('</div>', dashboardHtml.indexOf('</div>', dashboardHtml.indexOf('</div>', mainContentInnerStart) + 6) + 6) + 6; // approximate, let's just find "<!-- Quick Actions -->"
const quickActionsStart = dashboardHtml.indexOf('<!-- Quick Actions -->');

const firstPart = dashboardHtml.substring(0, quickActionsStart);
const lastPartTemp = dashboardHtml.substring(dashboardHtml.indexOf('</main>'));

// We want to add Toast logic and custom form JS handling
const customJs = `
<script>
    // Include toast library if not present
</script>
<script src="https://cdn.jsdelivr.net/npm/toastify-js"></script>
<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css">

<script>
    // Cancel button logic
    document.addEventListener('DOMContentLoaded', () => {
        // Find button container and add cancel
        const btnContainer = document.querySelector('.button-container');
        if (btnContainer) {
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn-cancel';
            cancelBtn.style.cssText = 'background: transparent; border: 2px solid #ff6b6b; color: #ff6b6b; margin-right: 15px;';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.onclick = function() {
                if(confirm('Are you sure you want to discard this booking?')) {
                    window.location.href = '/admin/bookings';
                }
            };
            btnContainer.insertBefore(cancelBtn, btnContainer.firstChild);
        }
    });

    // Handle form submit
    const form = document.getElementById('bookingForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');

    if (form) {
        // Similar setup to original
        const eventTypeSelect = document.getElementById('eventType');
        const otherEventDescriptionGroup = document.getElementById('otherEventDescriptionGroup');
        const otherEventDescription = document.getElementById('otherEventDescription');

        if (eventTypeSelect) {
            eventTypeSelect.addEventListener('change', function () {
                if (this.value === 'Other') {
                    otherEventDescriptionGroup.style.display = 'block';
                    otherEventDescriptionGroup.style.maxHeight = '100px';
                    otherEventDescription.required = true;
                } else {
                    otherEventDescriptionGroup.style.display = 'none';
                    otherEventDescriptionGroup.style.maxHeight = '0';
                    otherEventDescription.required = false;
                    otherEventDescription.value = '';
                }
            });
        }

        const needUshersRadios = document.querySelectorAll('input[name="needUshers"]');
        const usherCountGroup = document.getElementById('usherCountGroup');
        const usherCountInput = document.getElementById('usherCount');

        needUshersRadios.forEach(radio => {
            radio.addEventListener('change', function () {
                if (this.value === 'Yes') {
                    usherCountGroup.style.display = 'block';
                    setTimeout(() => {
                        usherCountGroup.style.maxHeight = '100px';
                        usherCountGroup.style.opacity = '1';
                    }, 10);
                    usherCountInput.required = true;
                } else {
                    usherCountGroup.style.maxHeight = '0';
                    usherCountGroup.style.opacity = '0';
                    setTimeout(() => {
                        usherCountGroup.style.display = 'none';
                    }, 400);
                    usherCountInput.required = false;
                    usherCountInput.value = '';
                }
            });
        });

        const durationUnitSelect = document.getElementById('durationUnit');
        const durationValueSelect = document.getElementById('durationValue');
        const hoursPickerWrap = document.getElementById('hoursPickerWrap');

        if (durationUnitSelect) {
            durationUnitSelect.addEventListener('change', function () {
                const unit = this.value;
                durationValueSelect.innerHTML = '<option value="">Select value...</option>';
                
                if (unit === 'hours') {
                    durationValueSelect.style.display = 'none';
                    hoursPickerWrap.style.display = 'flex';
                    document.getElementById('durationHours').required = true;
                    durationValueSelect.required = false;
                } else {
                    hoursPickerWrap.style.display = 'none';
                    durationValueSelect.style.display = 'block';
                    document.getElementById('durationHours').required = false;
                    document.getElementById('durationHours').value = '';
                    durationValueSelect.required = true;

                    let max = unit === 'days' ? 14 : 4;
                    for (let i = 1; i <= max; i++) {
                        const option = document.createElement('option');
                        option.value = i + " " + (i === 1 ? unit.slice(0, -1) : unit);
                        option.textContent = i + " " + (i === 1 ? unit.slice(0, -1) : unit);
                        durationValueSelect.appendChild(option);
                    }
                }
            });
        }

        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            
            // Prevent double submission
            if (submitBtn.disabled) return;
            
            submitBtn.disabled = true;
            btnText.innerHTML = '<div class="spinner"></div> Booking...';

            try {
                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());

                const durationUnit = data.durationUnit;
                let finalDuration = '';

                if (durationUnit === 'hours') {
                    finalDuration = data.durationHours;
                } else {
                    finalDuration = data.durationValue;
                }

                data.duration = finalDuration;
                if (data.eventType === 'Other') {
                    data.eventType = "Other: " + data.otherEventDescription;
                }

                if (data.needUshers === 'Yes') {
                    data.usherDetails = data.usherCount + " ushers requested";
                }

                const response = await fetch('/api/v1/book-event', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (result.success) {
                    Toastify({
                        text: "Booking created successfully!",
                        duration: 3000,
                        gravity: "top",
                        position: "right",
                        style: { background: "#2d8a5e" }
                    }).showToast();
                    
                    setTimeout(() => {
                        window.location.href = '/admin/bookings';
                    }, 1500);
                } else {
                    throw new Error(result.message || 'Validation failed');
                }
            } catch (err) {
                console.error(err);
                Toastify({
                    text: err.message || "Something went wrong",
                    duration: 3000,
                    gravity: "top",
                    position: "right",
                    style: { background: "#ff6b6b" }
                }).showToast();
                submitBtn.disabled = false;
                btnText.textContent = 'Book Your Event';
            }
        });
    }
</script>
`;

let finalHtml = firstPart + formContent + lastPartTemp;
finalHtml = finalHtml.replace('</head>', bookingStyles + '\n<style> .main-content { padding-top: 80px; } .booking-section { min-height: calc(100vh - 80px); } body.sidebar-open { overflow: hidden; } </style>\n</head>');
finalHtml = finalHtml.replace('</body>', customJs + '\n</body>');

// Title update
finalHtml = finalHtml.replace('<title>Admin Dashboard - Emerald Pearland Events</title>', '<title>New Booking - Admin</title>');

// Clean up any remaining .cinematic-bg positioning to fall inside main-content properly
finalHtml = finalHtml.replace('.cinematic-bg {', '.cinematic-bg {\n            position: absolute;\n            top: 0;\n            left: 0;\n            width: 100%;\n            height: 100%;\n            z-index: -1;');

fs.writeFileSync(newBookingPath, finalHtml, 'utf8');
console.log('Created admin/new-booking.html successfully!');
