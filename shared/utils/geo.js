/**
 * Haversine formula — returns distance in meters between two GPS points
 * @param {{ lat: number, lng: number }} pointA
 * @param {{ lat: number, lng: number }} pointB
 * @returns {number} distance in meters
 */
function calculateDistanceMeters(pointA, pointB) {
    const R = 6371000; // Earth radius in meters
    const φ1 = (pointA.lat * Math.PI) / 180;
    const φ2 = (pointB.lat * Math.PI) / 180;
    const Δφ = ((pointB.lat - pointA.lat) * Math.PI) / 180;
    const Δλ = ((pointB.lng - pointA.lng) * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Basic GPS spoof detection — rejects coordinates with poor accuracy
 * @param {number} [accuracy] - GPS accuracy radius in meters (lower = better)
 * @returns {boolean} true if coordinates should be rejected
 */
function rejectPoorAccuracy(accuracy) {
    if (accuracy == null) return false; // No accuracy provided — cannot reject
    if (typeof accuracy !== 'number') return true;
    return accuracy > 100; // Reject if accuracy worse than 100 meters
}

module.exports = {
    calculateDistanceMeters,
    rejectPoorAccuracy
};
