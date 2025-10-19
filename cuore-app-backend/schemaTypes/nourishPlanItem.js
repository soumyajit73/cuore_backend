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
      type: 'string',
      description: 'The serving size details (e.g., "1 1/2 Roti, 1/2 Katori Aloo Matar Sabzi")',
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
      description: 'The GROUP tag for randomization (e.g., V1, E2, L1, N3)',
    },
    {
      name: 'mealTime',
      title: 'Meal Time',
      type: 'string',
      options: { list: ['Breakfast', 'Lunch/Dinner'] },
    },
    // This is the link to the Word doc content
    {
      name: 'recipeLink',
      title: 'Link to Full Recipe',
      type: 'reference', // Creates a relationship
      to: [{type: 'recipe'}], // Links to your 'recipe' model
    },
  ],
};