const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, 'admin', 'dashboard.html');
const newBookingPath = path.join(__dirname, 'admin', 'new-booking.html');

let dashHtml = fs.readFileSync(dashboardPath, 'utf8');

const pageContentStart = dashHtml.indexOf('<div class="page-content">');
const topPartEnd = pageContentStart + '<div class="page-content">'.length;

const topPart = dashHtml.substring(0, topPartEnd);
const bottomPart = dashHtml.substring(dashHtml.indexOf('</main>'));

// Fix missing DOCTYPE
let prefix = '';
if (!topPart.trim().toLowerCase().startsWith('<!doctype')) {
    prefix = '<!DOCTYPE html>\n';
}

const customStyles = `
<style>
/* Admin New Booking Custom Styles */
.admin-booking-card {
    background: #ffffff;
    border-radius: 12px;
    padding: 30px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    margin-bottom: 20px;
}

.admin-section-header {
    color: #c9a84c;
    font-family: 'Cormorant Garamond', serif;
    font-size: 1.3rem;
    border-bottom: 2px solid #c9a84c;
    padding-bottom: 8px;
    margin-bottom: 20px;
    margin-top: 30px;
}
.admin-section-header:first-of-type {
    margin-top: 0;
}

.admin-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

.admin-form-group {
    margin-bottom: 0;
}

.admin-form-group.full-width {
    grid-column: 1 / -1;
}

.admin-label {
    font-weight: 600;
    color: #1a3c2e;
    margin-bottom: 6px;
    display: block;
    font-size: 13px;
}

.admin-input, .admin-select, .admin-textarea {
    width: 100%;
    padding: 12px 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
    font-family: inherit;
    outline: none;
    transition: border 0.2s, box-shadow 0.2s;
    background: #fff;
    color: #333;
}

.admin-textarea {
    resize: vertical;
    min-height: 100px;
}

.admin-input:focus, .admin-select:focus, .admin-textarea:focus {
    border-color: #c9a84c;
    box-shadow: 0 0 0 3px rgba(201,168,76,0.15);
}

.admin-radio-group {
    display: flex;
    gap: 20px;
    margin-top: 8px;
}

.admin-radio-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    cursor: pointer;
    font-weight: 500;
    color: #333;
}

.admin-radio-label input[type="radio"] {
    accent-color: #1a3c2e;
    width: 16px;
    height: 16px;
}

/* Button Layout */
.admin-form-actions {
    display: flex;
    gap: 15px;
    margin-top: 30px;
    border-top: 1px solid #eee;
    padding-top: 20px;
    flex-wrap: wrap;
}

.admin-btn {
    padding: 12px 28px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    font-size: 14px;
    font-family: inherit;
    transition: all 0.3s ease;
    text-align: center;
    border: none;
}

.btn-cancel {
    background: #ffffff;
    border: 1px solid #2d6a4f;
    color: #2d6a4f;
}
.btn-cancel:hover {
    background: #f0fdf4;
}

.btn-draft {
    background: #ffffff;
    border: 1px solid #c9a84c;
    color: #c9a84c;
}
.btn-draft:hover {
    background: #fffdf5;
}

.btn-submit {
    background: #1a3c2e;
    color: #ffffff;
    border: 1px solid #1a3c2e;
}
.btn-submit:hover {
    border-color: #c9a84c;
    color: #c9a84c;
}

.btn-submit:disabled {
    opacity: 0.7;
    cursor: not-allowed;
}

.page-header {
    margin-bottom: 25px;
}

.page-title {
    color: #1a3c2e;
    font-family: 'Cormorant Garamond', serif;
    font-size: 2rem;
    margin-bottom: 5px;
}

.breadcrumb {
    color: #6b6b6b;
    font-size: 13px;
}

.breadcrumb a {
    color: #1a3c2e;
    text-decoration: none;
}

html.dark-mode .admin-booking-card {
    background: #0d2b1f;
    border-color: #1a3d2e;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
}
html.dark-mode .admin-input, html.dark-mode .admin-select, html.dark-mode .admin-textarea {
    background: #091a13;
    border-color: #1a3d2e;
    color: #f5f0e8;
}
html.dark-mode .admin-label { color: #f5f0e8; }
html.dark-mode .page-title { color: #f5f0e8; }
html.dark-mode .breadcrumb a { color: #c9a84c; }

/* Mobile Optimizations */
@media (max-width: 768px) {
    .admin-form-grid {
        grid-template-columns: 1fr;
        gap: 16px;
    }
    
    .admin-input, .admin-select, .admin-textarea, .admin-btn {
        font-size: 16px; /* Prevent iOS zoom */
        min-height: 44px; /* Touch target */
    }
    
    .admin-form-group {
        margin-bottom: 16px;
    }
    
    .admin-booking-card {
        padding: 20px;
    }
    
    .admin-form-actions {
        flex-direction: column;
    }
    
    .admin-btn {
        width: 100%;
    }
}
</style>
`;

const formHtml = `
            <div class="page-header">
                <h1 class="page-title">New Booking</h1>
                <div class="breadcrumb">
                    <a href="/admin/dashboard">Home</a> / 
                    <a href="/admin/bookings">Bookings</a> / 
                    New Booking
                </div>
            </div>

            <form id="adminBookingForm">
                <div class="admin-booking-card">
                    <h2 class="admin-section-header">Client Information</h2>
                    <div class="admin-form-grid">
                        <div class="admin-form-group full-width">
                            <label class="admin-label" for="fullName">Full Name *</label>
                            <input type="text" id="fullName" name="fullName" class="admin-input" autocomplete="name" required placeholder="Client's full name">
                        </div>
                        
                        <div class="admin-form-group">
                            <label class="admin-label" for="email">Email Address *</label>
                            <input type="email" id="email" name="email" class="admin-input" autocomplete="email" required placeholder="client@example.com">
                        </div>
                        
                        <div class="admin-form-group">
                            <label class="admin-label" for="phone">Phone Number *</label>
                            <input type="tel" id="phone" name="phone" class="admin-input" autocomplete="tel" required placeholder="+254 700 000 000">
                        </div>
                    </div>

                    <h2 class="admin-section-header">Event Details</h2>
                    <div class="admin-form-grid">
                        <div class="admin-form-group">
                            <label class="admin-label" for="eventType">Event Type *</label>
                            <select id="eventType" name="eventType" class="admin-select" required autocomplete="off">
                                <option value="">Select event type...</option>
                                <option value="Wedding">Wedding</option>
                                <option value="Anniversary">Anniversary</option>
                                <option value="Birthday Party">Birthday Party</option>
                                <option value="Family & House Party">Family & House Party</option>
                                <option value="Corporate Event">Corporate Event</option>
                                <option value="Product Launch">Product Launch</option>
                                <option value="Luxury Decor & Styling">Luxury Décor & Styling</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        
                        <div class="admin-form-group">
                            <label class="admin-label" for="eventDate">Event Date *</label>
                            <input type="date" id="eventDate" name="eventDate" class="admin-input" required autocomplete="off">
                        </div>

                        <div class="admin-form-group full-width" id="otherEventDescriptionGroup" style="display: none;">
                            <label class="admin-label" for="otherEventDescription">Specify Event Type *</label>
                            <input type="text" id="otherEventDescription" name="otherEventDescription" class="admin-input" placeholder="Type custom event name" autocomplete="off">
                        </div>
                        
                        <div class="admin-form-group full-width">
                            <label class="admin-label" for="location">Event Location *</label>
                            <input type="text" id="location" name="location" class="admin-input" required placeholder="e.g. Safari Park Hotel, Nairobi" autocomplete="off">
                        </div>

                        <div class="admin-form-group">
                            <label class="admin-label" for="guestCount">Estimated Guests *</label>
                            <input type="number" id="guestCount" name="guestCount" class="admin-input" min="1" required placeholder="e.g. 150" autocomplete="off">
                        </div>

                        <div class="admin-form-group">
                            <label class="admin-label" for="budgetRange">Estimated Investment *</label>
                            <select id="budgetRange" name="budgetRange" class="admin-select" required autocomplete="off">
                                <option value="">Select range...</option>
                                <option value="Under KES 50,000">Under KES 50,000</option>
                                <option value="KES 50,000 \u2013 100,000">KES 50,000 \u2013 100,000</option>
                                <option value="KES 100,000 \u2013 250,000">KES 100,000 \u2013 250,000</option>
                                <option value="KES 250,000 \u2013 500,000">KES 250,000 \u2013 500,000</option>
                                <option value="KES 500,000+">KES 500,000+</option>
                                <option value="Not Sure Yet">Not Sure Yet</option>
                            </select>
                        </div>

                        <!-- Duration combining logic into simple inputs for admin -->
                        <div class="admin-form-group">
                            <label class="admin-label" for="durationValue">Duration length *</label>
                            <input type="number" id="durationValue" name="durationValue" class="admin-input" min="1" required placeholder="e.g. 6" autocomplete="off">
                        </div>
                        <div class="admin-form-group">
                            <label class="admin-label" for="durationUnit">Duration Unit *</label>
                            <select id="durationUnit" name="durationUnit" class="admin-select" required autocomplete="off">
                                <option value="Hours">Hours</option>
                                <option value="Days">Days</option>
                            </select>
                        </div>

                        <div class="admin-form-group full-width">
                            <label class="admin-label">Need Ushers? *</label>
                            <div class="admin-radio-group">
                                <label class="admin-radio-label" for="ushersYes">
                                    <input type="radio" id="ushersYes" name="needUshers" value="Yes" required autocomplete="off"> Yes
                                </label>
                                <label class="admin-radio-label" for="ushersNo">
                                    <input type="radio" id="ushersNo" name="needUshers" value="No" required autocomplete="off"> No
                                </label>
                            </div>
                        </div>

                        <div class="admin-form-group full-width" id="usherCountGroup" style="display: none;">
                            <label class="admin-label" for="usherCount">Number of Ushers</label>
                            <input type="number" id="usherCount" name="usherCount" class="admin-input" min="1" placeholder="e.g. 4" autocomplete="off">
                        </div>

                        <div class="admin-form-group full-width">
                            <label class="admin-label" for="specialRequests">Special Notes / Requests</label>
                            <textarea id="specialRequests" name="specialRequests" class="admin-textarea" placeholder="Internal notes or client requests..." autocomplete="off"></textarea>
                        </div>
                    </div>

                    <div class="admin-form-actions">
                        <button type="button" class="admin-btn btn-cancel" id="btnCancelBooking">Cancel</button>
                        <button type="button" class="admin-btn btn-draft" id="btnSaveDraft">Save Draft</button>
                        <button type="submit" class="admin-btn btn-submit" id="btnCreateBooking">
                            <span id="btnSubmitText">Create Booking</span>
                        </button>
                    </div>
                </div>
            </form>

            <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/toastify-js/1.12.0/toastify.min.css">
            <script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/toastify-js/1.12.0/toastify.min.js"></script>

            <script>
                document.addEventListener('DOMContentLoaded', () => {
                    // "Other" event type
                    const eventTypeSelect = document.getElementById('eventType');
                    const otherEventGroup = document.getElementById('otherEventDescriptionGroup');
                    const otherEventInput = document.getElementById('otherEventDescription');

                    eventTypeSelect.addEventListener('change', function() {
                        if(this.value === 'Other') {
                            otherEventGroup.style.display = 'block';
                            otherEventInput.required = true;
                        } else {
                            otherEventGroup.style.display = 'none';
                            otherEventInput.required = false;
                            otherEventInput.value = '';
                        }
                    });

                    // Ushers logic
                    const ushersRadios = document.querySelectorAll('input[name="needUshers"]');
                    const usherCountGroup = document.getElementById('usherCountGroup');
                    const usherCountInput = document.getElementById('usherCount');

                    ushersRadios.forEach(radio => {
                        radio.addEventListener('change', function() {
                            if(this.value === 'Yes') {
                                usherCountGroup.style.display = 'block';
                                usherCountInput.required = true;
                            } else {
                                usherCountGroup.style.display = 'none';
                                usherCountInput.required = false;
                                usherCountInput.value = '';
                            }
                        });
                    });

                    // Cancel logic
                    document.getElementById('btnCancelBooking').addEventListener('click', () => {
                        if(confirm('Are you sure you want to discard this booking? Any unsaved changes will be lost.')) {
                            window.location.href = '/admin/bookings';
                        }
                    });

                    // Draft logic
                    document.getElementById('btnSaveDraft').addEventListener('click', () => {
                        Toastify({
                            text: "Draft saved successfully. (Not submitted to DB)",
                            duration: 3000,
                            gravity: "top",
                            position: "right",
                            style: { background: "#c9a84c", color: "#fff" }
                        }).showToast();
                    });

                    // Form Submit
                    const form = document.getElementById('adminBookingForm');
                    const submitBtn = document.getElementById('btnCreateBooking');
                    const btnText = document.getElementById('btnSubmitText');

                    form.addEventListener('submit', async function(e) {
                        e.preventDefault();
                        if(submitBtn.disabled) return;
                        
                        submitBtn.disabled = true;
                        btnText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

                        try {
                            const formData = new FormData(form);
                            const data = Object.fromEntries(formData.entries());

                            // Map form fields to expected API fields securely
                            const apiPayload = {
                                fullName: data.fullName,
                                email: data.email,
                                phone: data.phone,
                                eventType: data.eventType === 'Other' ? "Other: " + data.otherEventDescription : data.eventType,
                                eventDate: data.eventDate,
                                eventDuration: data.durationValue + " " + data.durationUnit,
                                guestCount: data.guestCount,
                                location: data.location,
                                budgetRange: data.budgetRange,
                                specialRequests: data.specialRequests,
                                status: 'pending' // Default for new incoming format unless admin
                            };

                            if (data.needUshers === 'Yes') {
                                apiPayload.usherDetails = data.usherCount + " ushers requested";
                            }

                            const apiURL = window.location.origin.includes('localhost') ? 'http://localhost:3000/api/book-event' : '/api/book-event';

                            const res = await fetch(apiURL, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(apiPayload)
                            });

                            const jsonRes = await res.json();
                            if(jsonRes.success) {
                                Toastify({
                                    text: "Booking created successfully!",
                                    duration: 3000,
                                    gravity: "top",
                                    position: "right",
                                    style: { background: "#1a3c2e" }
                                }).showToast();
                                setTimeout(() => window.location.href = '/admin/bookings', 1500);
                            } else {
                                throw new Error(jsonRes.message || 'Validation Failed');
                            }
                        } catch(err) {
                            Toastify({
                                text: err.message || "An error occurred creating booking",
                                duration: 3000,
                                gravity: "top",
                                position: "right",
                                style: { background: "#B5332A" }
                            }).showToast();
                            submitBtn.disabled = false;
                            btnText.textContent = 'Create Booking';
                        }
                    });
                });
            </script>
`;

// Insert the custom styles into the head
let finalTopPart = prefix + topPart.replace('</head>', customStyles + '\n</head>');
// Title change
finalTopPart = finalTopPart.replace('<title>Admin Dashboard - Emerald Pearland Events</title>', '<title>New Booking - Admin</title>');

let finalHtml = finalTopPart + formHtml + bottomPart;

// Set body background color as requested specifically for the whole page if dashboard has a different var
finalHtml = finalHtml.replace('body {', 'body { background-color: #f5f0e8 !important;');

fs.writeFileSync(newBookingPath, finalHtml, 'utf8');
console.log('Created admin/new-booking.html successfully with redesigned UI!');
