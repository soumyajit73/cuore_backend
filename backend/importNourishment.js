const { MongoClient } = require('mongodb');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

// --- 1. CONFIGURE YOUR DETAILS ---
// For security, it's best to use environment variables for your connection string.
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'cuore';
const COLLECTION_NAME = 'nutrition_plan_items';
// Assumes the Excel file is in the same directory as the script.
const EXCEL_FILE_PATH = path.join(__dirname,'data', 'Nourish Plan BF.xlsx');

async function importData() {
    const client = new MongoClient(MONGO_URI);
    try {
        if (!fs.existsSync(EXCEL_FILE_PATH)) {
            throw new Error(`Excel file not found at path: ${EXCEL_FILE_PATH}`);
        }

        await client.connect();
        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        console.log('✅ Connected to MongoDB. Clearing existing nutrition plan data...');
        // Clear the collection before importing new data to prevent old entries from remaining.
        await collection.deleteMany({});

        const workbook = xlsx.readFile(EXCEL_FILE_PATH);
        const allItems = [];

        for (const sheetName of workbook.SheetNames) {
            console.log(`⚙️ Processing sheet: ${sheetName}...`);

            // --- 2. PARSE THE SHEET DATA CORRECTLY ---
            const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
                // CHANGED: Header now correctly maps to all 8 columns of your data.
                header: ['calories', 'name', 'component1', 'component2', 'component3', 'component4', 'group_tag', 'item_id'],
                // CHANGED: Skips the first 7 rows to start reading from the actual data on row 8.
                range: 7
            });

            for (const row of sheetData) {
                // Skip any row that is empty or doesn't have a unique item ID.
                if (!row.item_id || !row.name || typeof row.item_id !== 'string') {
                    continue;
                }

                // --- 3. STRUCTURE THE DOCUMENT FOR MONGODB ---
                const diet_tag = row.group_tag || row.item_id.split('.')[0];

                const components = [row.component1, row.component2, row.component3, row.component4]
                    .filter(Boolean) // This removes any null or undefined components.
                    .map((desc, index) => ({
                        description: String(desc).trim(), // Ensure description is a string and trim whitespace
                        is_base: index === 0
                    }));

                allItems.push({
                    // CHANGED: The _id is now guaranteed to be unique by combining the unique item_id and the sheetName.
                    _id: `${row.item_id}_${sheetName.replace(/\s/g, '')}`,
                    item_id: row.item_id,
                    name: String(row.name).trim(),
                    diet_tag: diet_tag,
                    calories: parseInt(row.calories, 10) || 0,
                    calorie_range: sheetName,
                    components: components
                });
            }
        }

        if (allItems.length > 0) {
            // This will insert all collected items from all sheets in a single, efficient operation.
            await collection.insertMany(allItems);
            console.log(`👍 Successfully imported a total of ${allItems.length} items from all sheets.`);
        } else {
            console.log('⚠️ No valid items found to import.');
        }

    } catch (err) {
        console.error("❌ An error occurred:", err);
    } finally {
        await client.close();
        console.log("✔️ Import complete. MongoDB connection closed.");
    }
}

importData();