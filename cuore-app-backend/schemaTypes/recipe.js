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
    },
    {
      name: 'fullRecipe',
      title: 'Full Recipe Instructions',
      type: 'array',
      of: [{type: 'block'}],
    },
    {
      name: 'cuisine',
      title: 'Cuisine',
      type: 'string',
      options: { list: ['Indian', 'Global'] },
    },
    {
      name: 'mealTime', // ✅ --- THIS FIELD WAS MISSING ---
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
};