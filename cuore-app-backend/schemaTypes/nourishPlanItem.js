// schemas/nourishPlanItem.js
export default {
  name: 'nourishPlanItem',
  title: 'Nourish Plan Item',
  type: 'document',
  fields: [
    {
      name: 'name',
      title: 'Plan Item Name',
      type: 'string',
      description: 'The name of the item as shown in the plan (e.g., "Overnight oats", "Roti with aloo matar sabzi")',
    },
    {
      name: 'components',
      title: 'Components',
      type: 'array', // ✅ Changed to array
      of: [{type: 'string'}], // ✅ Array of strings
      description: 'The serving size details from Excel (Cols C, D, E) as separate items (e.g., ["1 1/2 Roti", "1/2 Katori Aloo Matar Sabzi"])',
    },
    {
      name: 'calories',
      title: 'Calories',
      type: 'number',
    },
    {
      name: 'calorieRange',
      title: 'Calorie Range',
      type: 'string',
      options: {
        list: ['<1300', '1300-1499', '1500-1699', '1700-1899', '1900-2099', '>2099'],
      },
    },
    {
      name: 'dietTag',
      title: 'Diet Tag',
      type: 'string',
      description: 'The GROUP tag for randomization (e.g., V1, E2, L1, N3 derived from Excel Col H)',
    },
    {
      name: 'mealTime',
      title: 'Meal Time',
      type: 'string',
      options: { list: ['Breakfast', 'Lunch/Dinner'] },
    },
    {
      name: 'recipeLink',
      title: 'Link to Full Recipe',
      type: 'reference',
      to: [{type: 'recipe'}],
    },
  ],
   preview: {
    select: {
      title: 'name',
      subtitle: 'dietTag', // Show the dietTag in the list view
      media: 'recipeLink.image' // Optionally show linked recipe image
    }
  }
};