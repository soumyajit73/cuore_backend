// utils/mathHelpers.js

/**
 * Rounds a number to the nearest specified multiple.
 * Example: MROUND(1.3, 0.25) => 1.25
 * Example: MROUND(1.4, 0.25) => 1.50
 * @param {number} number The number to round.
 * @param {number} multiple The multiple to round to.
 * @returns {number} The rounded number.
 */
function MROUND(number, multiple) {
  if (multiple === 0) {
    return 0;
  }
  // Calculate the nearest multiple
  const rounded = Math.round(number / multiple) * multiple;
  // Use parseFloat and toFixed(2) to handle potential floating point inaccuracies and keep 2 decimal places
  return parseFloat(rounded.toFixed(2));
}

/**
 * Parses a serving size string into its quantity and unit.
 * Handles formats like "1 cup", "0.5 Katori", "1/2 Slice", "Piece", etc.
 * @param {string} servingSizeString The serving size text.
 * @returns {{originalQuantity: number, unit: string}} Parsed quantity and unit.
 */
function parseServingSize(servingSizeString) {
    // Default values if parsing fails or input is invalid
    const defaults = { originalQuantity: 1, unit: 'unit(s)' };

    if (!servingSizeString || typeof servingSizeString !== 'string') {
      console.warn(`Invalid serving size input: ${servingSizeString}. Using defaults.`);
      return defaults;
    }

    const cleanedString = servingSizeString.trim();
    // Regex to capture optional quantity (number, decimal, fraction) and the rest as unit
    const match = cleanedString.match(/^([\d.\/]+)?\s*(.*)?$/);

    let quantity = 1; // Default quantity
    let unit = cleanedString; // Default unit is the whole string if no quantity found

    if (match && match[1]) { // If a numeric-like part was found at the beginning
        const quantityPart = match[1];
        unit = match[2] ? match[2].trim() : defaults.unit; // The rest is the unit, or default

        // Handle fractions like "1/2"
        if (quantityPart.includes('/')) {
            const fractionParts = quantityPart.split('/');
            if (fractionParts.length === 2) {
                const num = parseFloat(fractionParts[0]);
                const den = parseFloat(fractionParts[1]);
                if (!isNaN(num) && !isNaN(den) && den !== 0) {
                    quantity = num / den;
                } else {
                     quantity = defaults.originalQuantity; // Invalid fraction
                     console.warn(`Invalid fraction format in serving size: "${servingSizeString}". Using default quantity.`);
                }
            } else {
                 quantity = defaults.originalQuantity; // Invalid fraction format
                 console.warn(`Invalid fraction format in serving size: "${servingSizeString}". Using default quantity.`);
            }
        }
        // Handle decimals or whole numbers
        else {
            const parsedQty = parseFloat(quantityPart);
            if (!isNaN(parsedQty)) {
                quantity = parsedQty;
            } else {
                 quantity = defaults.originalQuantity; // Invalid number
                 console.warn(`Invalid quantity format in serving size: "${servingSizeString}". Using default quantity.`);
            }
        }
         // If unit was empty but quantity existed, use default unit
         if (!unit) unit = defaults.unit;

    } else {
         // If no numeric part found at the beginning, assume quantity is 1
         quantity = defaults.originalQuantity;
         unit = cleanedString || defaults.unit; // Use the whole string as unit or default
    }

    // Ensure unit is never empty if quantity is valid
    if (quantity !== defaults.originalQuantity && !unit) {
        unit = defaults.unit;
    }

    return { originalQuantity: quantity, unit: unit };
}


module.exports = { MROUND, parseServingSize };