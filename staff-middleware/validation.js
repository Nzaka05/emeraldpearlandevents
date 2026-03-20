const validator = require('validator');

// Sanitize input strings - remove dangerous characters
const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
        .trim()
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
        .replace(/<[^>]*>?/gm, '') // Remove all HTML tags
        .replace(/[<>]/g, '') // Remove angle brackets
        .replace(/&/g, '&amp;') // Escape ampersands
        .replace(/"/g, '&quot;') // Escape quotes
        .replace(/'/g, '&#x27;') // Escape single quotes
        .replace(/\//g, '&#x2F;'); // Escape forward slashes
};

// Sanitize an entire object recursively
const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }
    
    const sanitizedObj = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            sanitizedObj[key] = key === 'password' ? value : sanitizeString(value);
        } else if (typeof value === 'object' && value !== null) {
            sanitizedObj[key] = sanitizeObject(value);
        } else {
            sanitizedObj[key] = value;
        }
    }
    return sanitizedObj;
};

// Middleware to sanitize request body
const sanitizeRequestBody = (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
    }
    next();
};

// Validate email format
const validateEmail = (email) => {
    if (!email) return false;
    return validator.isEmail(email.trim());
};

// Validate phone number format
const validatePhone = (phone) => {
    if (!phone) return true; // Phone is optional
    const phoneRegex = /^[\d\s\-\+\(\)]{10,15}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
};

// Validate name (no special characters except spaces, hyphens, apostrophes)
const validateName = (name) => {
    if (!name) return false;
    const nameRegex = /^[a-zA-Z\s\-'\.]+$/;
    return nameRegex.test(name.trim()) && name.trim().length >= 2;
};

// Validate password strength
const validatePassword = (password) => {
    if (!password) return false;
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
};

// Validate role
const validateRole = (role) => {
    const validRoles = ['Admin', 'Supervisor', 'Staff'];
    return validRoles.includes(role);
};

// Validate shift times (HH:MM format)
const validateShiftTime = (time) => {
    if (!time) return true; // Shift times are optional
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
};

// Validate date
const validateDate = (date) => {
    if (!date) return false;
    return !isNaN(Date.parse(date)) && new Date(date) > new Date();
};

// Validate numeric values
const validateNumber = (value, min = 0, max = Infinity) => {
    const num = Number(value);
    return !isNaN(num) && num >= min && num <= max;
};

// Validate array of strings
const validateStringArray = (arr) => {
    if (!Array.isArray(arr)) return false;
    return arr.every(item => typeof item === 'string' && item.trim().length > 0);
};

// Validation middleware for staff creation
const validateStaffCreation = (req, res, next) => {
    const errors = [];
    const { name, email, role, phone, department, shift_start, shift_end, skills } = req.body;

    // Required fields validation
    if (!validateName(name)) {
        errors.push('Valid name is required (2+ characters, letters only)');
    }

    if (!validateEmail(email)) {
        errors.push('Valid email is required');
    }

    if (!validateRole(role)) {
        errors.push('Valid role is required (Admin, Supervisor, or Staff)');
    }

    // Optional fields validation
    if (phone && !validatePhone(phone)) {
        errors.push('Invalid phone number format');
    }

    if (shift_start && !validateShiftTime(shift_start)) {
        errors.push('Invalid shift start time format (HH:MM)');
    }

    if (shift_end && !validateShiftTime(shift_end)) {
        errors.push('Invalid shift end time format (HH:MM)');
    }

    if (skills && !validateStringArray(skills)) {
        errors.push('Skills must be an array of non-empty strings');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors
        });
    }

    // Sanitize inputs
    req.body.name = sanitizeString(name);
    req.body.email = email.trim().toLowerCase();
    req.body.role = role;
    req.body.phone = phone ? phone.trim() : '';
    req.body.department = department ? sanitizeString(department) : '';
    req.body.shift_start = shift_start ? shift_start.trim() : '';
    req.body.shift_end = shift_end ? shift_end.trim() : '';
    
    if (skills && Array.isArray(skills)) {
        req.body.skills = skills.map(skill => sanitizeString(skill));
    }

    next();
};

// Validation middleware for staff update
const validateStaffUpdate = (req, res, next) => {
    const errors = [];
    const { name, email, role, phone, department, shift_start, shift_end, skills } = req.body;

    // Validate provided fields
    if (name !== undefined && !validateName(name)) {
        errors.push('Valid name is required (2+ characters, letters only)');
    }

    if (email !== undefined && !validateEmail(email)) {
        errors.push('Valid email is required');
    }

    if (role !== undefined && !validateRole(role)) {
        errors.push('Valid role is required (Admin, Supervisor, or Staff)');
    }

    if (phone !== undefined && phone && !validatePhone(phone)) {
        errors.push('Invalid phone number format');
    }

    if (shift_start !== undefined && shift_start && !validateShiftTime(shift_start)) {
        errors.push('Invalid shift start time format (HH:MM)');
    }

    if (shift_end !== undefined && shift_end && !validateShiftTime(shift_end)) {
        errors.push('Invalid shift end time format (HH:MM)');
    }

    if (skills !== undefined && skills && !validateStringArray(skills)) {
        errors.push('Skills must be an array of non-empty strings');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors
        });
    }

    // Sanitize inputs
    if (name !== undefined) req.body.name = sanitizeString(name);
    if (email !== undefined) req.body.email = email.trim().toLowerCase();
    if (phone !== undefined) req.body.phone = phone ? phone.trim() : '';
    if (department !== undefined) req.body.department = department ? sanitizeString(department) : '';
    if (shift_start !== undefined) req.body.shift_start = shift_start ? shift_start.trim() : '';
    if (shift_end !== undefined) req.body.shift_end = shift_end ? shift_end.trim() : '';
    if (skills !== undefined && Array.isArray(skills)) {
        req.body.skills = skills.map(skill => sanitizeString(skill));
    }

    next();
};

// Validation middleware for assignment creation
const validateAssignmentCreation = (req, res, next) => {
    const errors = [];
    const { 
        title, description, location, date, start_time, end_time, 
        pay_rate, vip_flag, special_instructions, dress_code 
    } = req.body;

    // Required fields
    if (!title || title.trim().length < 3) {
        errors.push('Title is required (3+ characters)');
    }

    if (!description || description.trim().length < 10) {
        errors.push('Description is required (10+ characters)');
    }

    if (!location || location.trim().length < 3) {
        errors.push('Location is required (3+ characters)');
    }

    if (!validateDate(date)) {
        errors.push('Valid future date is required');
    }

    if (!validateShiftTime(start_time)) {
        errors.push('Valid start time is required (HH:MM format)');
    }

    if (!validateShiftTime(end_time)) {
        errors.push('Valid end time is required (HH:MM format)');
    }

    if (!validateNumber(pay_rate, 0)) {
        errors.push('Valid pay rate is required (positive number)');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors
        });
    }

    // Sanitize inputs
    req.body.title = sanitizeString(title);
    req.body.description = sanitizeString(description);
    req.body.location = sanitizeString(location);
    req.body.special_instructions = special_instructions ? sanitizeString(special_instructions) : '';
    req.body.dress_code = dress_code ? sanitizeString(dress_code) : '';

    next();
};

// Validation middleware for login
const validateLogin = (req, res, next) => {
    const errors = [];
    const { email, password } = req.body;

    if (!email || !email.trim()) {
        errors.push('Email is required');
    } else if (!validateEmail(email)) {
        errors.push('Valid email is required');
    }

    if (!password || password.trim().length < 1) {
        errors.push('Password is required');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors
        });
    }

    req.body.email = email.trim().toLowerCase();
    req.body.password = password.trim();

    next();
};

// Validation middleware for password change
const validatePasswordChange = (req, res, next) => {
    const errors = [];
    const { current_password, new_password, confirm_new_password } = req.body;

    if (!current_password || current_password.trim().length < 1) {
        errors.push('Current password is required');
    }

    if (!new_password) {
        errors.push('New password is required');
    } else if (!validatePassword(new_password)) {
        errors.push('Password must be at least 8 characters with uppercase, lowercase, and number');
    }

    if (!confirm_new_password) {
        errors.push('Password confirmation is required');
    } else if (new_password !== confirm_new_password) {
        errors.push('Passwords do not match');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors
        });
    }

    req.body.current_password = current_password.trim();
    req.body.new_password = new_password.trim();
    req.body.confirm_new_password = confirm_new_password.trim();

    next();
};

module.exports = {
    sanitizeString,
    sanitizeObject,
    sanitizeRequestBody,
    validateEmail,
    validatePhone,
    validateName,
    validatePassword,
    validateRole,
    validateShiftTime,
    validateDate,
    validateNumber,
    validateStringArray,
    validateStaffCreation,
    validateStaffUpdate,
    validateAssignmentCreation,
    validateLogin,
    validatePasswordChange
};
