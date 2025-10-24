import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'

// 1. IMPORT YOUR SCHEMAS
import recipe from './schemaTypes/recipe'
import nourishPlanItem from './schemaTypes/nourishPlanItem'
import mealBuilderItem from './schemaTypes/mealBuilderItem'

// 👇 Import your new ones
import fitnessPlan from './schemaTypes/fitnessPlan'
import exercise from './schemaTypes/exercise'

export default defineConfig({
  name: 'default',
  title: 'Cuore App Backend',

  projectId: 'r1a9xgjr', // keep this as is
  dataset: 'production',

  plugins: [structureTool(), visionTool()],

  schema: {
    // 2. ADD THEM HERE TOO
    types: [
      recipe,
      nourishPlanItem,
      mealBuilderItem,
      fitnessPlan,
      exercise, // 👈 new schemas added
    ],
  },
})
