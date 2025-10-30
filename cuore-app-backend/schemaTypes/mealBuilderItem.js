// schemas/mealBuilderItem.js
export default {
  name: 'mealBuilderItem',
  title: 'Meal Builder Item',
  type: 'document',
  fields: [
    {
      name: 'name',
      title: 'Item Name',
      type: 'string',
    },
    {
      name: 'calories',
      title: 'Calories (kcal)',
      type: 'number',
    },
    {
      name: 'servingSize',
      title: 'Serving Size',
      type: 'string',
    },
    { // ✅ --- RE-ADDED THIS FIELD ---
      name: 'section',
      title: 'Section', // e.g., "Breads, Toast & Sandwiches"
      type: 'string',
    },
    // ---------------------------
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
      name: 'recipeLink',
      title: 'Link to Full Recipe',
      type: 'reference',
      to: [{type: 'recipe'}],
    },
     
     {
      name: 'healthColor',
      title: 'Health Color',
      type: 'string',
      description: 'The health category (green, yellow, or red) from the "Health" column',
      options: {
        list: [
          {title: 'Green (Everyday)', value: 'green'},
          {title: 'Yellow (Once/week)', value: 'yellow'},
          {title: 'Red (Once/month)', value: 'red'}
        ],
        layout: 'radio'
      }
    },
    {
  name: 'adjustmentWeight',
  title: '% Recommended Calorie (Weight)', // Or a clearer title
  type: 'number',
  description: 'Value from Excel Col I, used for portion adjustment formula',
},
  
  ],
    preview: {
    select: {
      title: 'name', // Use the 'name' field as the title in the list
      subtitle: 'section' // Show the 'section' as a subtitle
    }
  }
};