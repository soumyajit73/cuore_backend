// schemas/recipe.js
export default {
  name: 'recipe',
  title: 'Recipe',
  type: 'document',
  fields: [
    {
      name: 'name',
      title: 'Recipe Name',
      type: 'string',
    },
    {
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {
        hotspot: true, // Enables image cropping hotspot
      },
    },
    {
      name: 'prepTime',
      title: 'Prep Time',
      type: 'string', // e.g., "10 min"
    },
    {
      name: 'cookTime',
      title: 'Cook Time',
      type: 'string', // e.g., "15 min"
    },
    {
      name: 'ingredients',
      title: 'Ingredients',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'quantity', title: 'Quantity', type: 'string' }, // e.g., "1", "¼", "½"
            { name: 'unit', title: 'Unit', type: 'string' }, // e.g., "cup", "tsp", "tbsp", "piece"
            { name: 'name', title: 'Ingredient Name', type: 'string' },
            { name: 'notes', title: 'Notes', type: 'string' }, // e.g., "adjust to taste", "finely chopped"
          ],
          // Define how each ingredient object looks in the list
          preview: {
            select: {
              qty: 'quantity',
              unit: 'unit',
              name: 'name',
              notes: 'notes',
            },
            prepare({ qty, unit, name, notes }) {
              const qtyUnit = [qty, unit].filter(Boolean).join(' ');
              const note = notes ? `(${notes})` : '';
              return {
                title: `${qtyUnit} ${name} ${note}`.trim(),
              };
            },
          },
        },
      ],
    },
    {
      name: 'instructions',
      title: 'Instructions',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'heading', title: 'Section Heading', type: 'string' }, // e.g., "Prepare the Batter"
            {
              name: 'steps',
              title: 'Steps',
              type: 'array',
              of: [{ type: 'text', rows: 3 }], // Array of multi-line text steps
            },
          ],
        },
      ],
    },
    {
      name: 'cuisine',
      title: 'Cuisine',
      type: 'string',
      options: { list: ['Indian', 'Global'] },
    },
    {
      name: 'mealTime',
      title: 'Meal Time',
      type: 'string',
      options: { list: ['Breakfast', 'Lunch/Dinner'] },
    },
    {
      name: 'dietPreference',
      title: 'Diet Preference',
      type: 'string',
      options: { list: ['Veg', 'Eggetarian', 'Non-Veg'] },
    },
  ],
  preview: {
    select: {
      title: 'name',
      media: 'image',
    },
  },
};