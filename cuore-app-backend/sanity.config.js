import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'

// 1. IMPORT YOUR NEW SCHEMAS
import recipe from './schemaTypes/recipe'
import nourishPlanItem from './schemaTypes/nourishPlanItem'
import mealBuilderItem from './schemaTypes/mealBuilderItem'

export default defineConfig({
  name: 'default',
  title: 'Cuore App Backend',

  projectId: 'r1a9xgjr', // This is your correct ID
  dataset: 'production',

  plugins: [structureTool(), visionTool()],

  schema: {
    // 2. ADD YOUR SCHEMAS TO THIS ARRAY
    // This replaces the old `schemaTypes`
    types: [
      recipe, 
      nourishPlanItem, 
      mealBuilderItem
    ],
  },
})