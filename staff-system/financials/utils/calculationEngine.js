/**
 * Emarald Pearl Events - Calculation Engine
 * 
 * Centralized, strict mathematical operations for all financial calculations.
 * Avoids native JS floating point precision errors rounding to nearest 2 decimals.
 */

const roundToTwo = (num) => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
};

const calculateEventProfit = (budget, expenses, payroll, emergencyUsed) => {
    const totalCosts = roundToTwo(expenses + payroll + emergencyUsed);
    return roundToTwo(budget - totalCosts);
};

const calculateTaxAmount = (subtotal, taxRate) => {
    return roundToTwo(subtotal * (taxRate / 100));
};

const calculateTotalWithTax = (subtotal, taxRate) => {
    return roundToTwo(subtotal + calculateTaxAmount(subtotal, taxRate));
};

const calculateStaffHours = (clockIn, clockOut) => {
    if (!clockIn || !clockOut) return 0;
    const diffMs = new Date(clockOut) - new Date(clockIn);
    return roundToTwo(diffMs / (1000 * 60 * 60));
};

const calculateProratedPay = (hoursWorked, basePayRate, standardShiftHours = 8) => {
    // If they worked roughly the shift or more, give full pay. Otherwise prorate.
    if (hoursWorked >= standardShiftHours - 1) return basePayRate;
    const hourlyRate = basePayRate / standardShiftHours;
    return roundToTwo(hoursWorked * hourlyRate);
};

module.exports = {
    roundToTwo,
    calculateEventProfit,
    calculateTaxAmount,
    calculateTotalWithTax,
    calculateStaffHours,
    calculateProratedPay
};
