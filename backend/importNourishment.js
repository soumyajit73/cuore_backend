const { MongoClient } = require('mongodb');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// --- 1. CONFIGURE YOUR DETAILS ---
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'cuore';
const COLLECTION_NAME = 'nutrition_plan_items';

// An array of file objects to process
const FILES_TO_PROCESS = [
    { path: path.join(__dirname, 'data', 'Nourish Plan BF.xlsx'), meal_time: 'Breakfast' },
    { path: path.join(__dirname, 'data', 'Nourish PlanLD.xlsx'), meal_time: 'Lunch/Dinner' }
];

async function importData() {
    if (!MONGO_URI) {
        console.error("❌ MONGO_URI is not defined. Please check your .env file.");
        return;
    }

    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        console.log('✅ Connected to MongoDB. Clearing existing nutrition plan data...');
        await collection.deleteMany({});

        const allItems = [];
        const header = ['calories', 'name', 'component1', 'component2', 'component3', 'component4', 'group_tag', 'item_id'];
        let debugCounter = 0; // To limit debug messages

        for (const file of FILES_TO_PROCESS) {
            console.log(`\n📄 Reading file for: ${file.meal_time}...`);

            if (!fs.existsSync(file.path)) {
                console.warn(`⚠️ Warning: File not found, skipping. Path: ${file.path}`);
                continue;
            }

            const workbook = xlsx.readFile(file.path);

            for (const sheetName of workbook.SheetNames) {
                console.log(`   ⚙️ Processing sheet: ${sheetName}...`);

                const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
                    header: header,
                    range: 7
                });

                for (const row of sheetData) {
                    // --- START DEBUGGING BLOCK ---
                    // This will print the data for the first 5 rows of the Lunch/Dinner file
                    if (file.meal_time === 'Lunch/Dinner' && debugCounter < 5) {
                        console.log(`[DEBUG] Raw Row Data: Name='${row.name}', ItemID='${row.item_id}'`);
                        debugCounter++;
                    }
                    // --- END DEBUGGING BLOCK ---

                    if (!row.item_id || !row.name || typeof row.item_id !== 'string') {
                        continue; // Skip the row if a condition is not met
                    }
                    
                    // If the code reaches here, the row is considered valid.
                    const diet_tag = row.group_tag || row.item_id.split('.')[0];
                    const components = [row.component1, row.component2, row.component3, row.component4]
                        .filter(Boolean)
                        .map((desc, index) => ({
                            description: String(desc).trim(),
                            is_base: index === 0
                        }));

                    allItems.push({
                        _id: `${row.item_id}_${sheetName.replace(/\s/g, '')}_${file.meal_time}`,
                        item_id: row.item_id,
                        name: String(row.name).trim(),
                        diet_tag: diet_tag,
                        calories: parseInt(row.calories, 10) || 0,
                        calorie_range: sheetName,
                        meal_time: file.meal_time,
                        components: components
                    });
                }
            }
        }

        if (allItems.length > 0) {
            await collection.insertMany(allItems);
            console.log(`\n👍 Successfully imported a total of ${allItems.length} items from all files.`);
        } else {
            console.log('\n⚠️ No valid items found to import.');
        }

    } catch (err) {
        console.error("❌ An error occurred:", err);
    } finally {
        await client.close();
        console.log("✔️ Import complete. MongoDB connection closed.");
    }
}

importData();