// schemas/cuoreMindMeditation.js

export default {
  name: 'cuoreMindMeditation',
  title: 'Cuore Mind Meditation',
  type: 'document',
  fields: [
    {
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'e.g., "Body Scan" or "4-7-8 Breathing"',
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'subtitle',
      title: 'Subtitle',
      type: 'string',
      description: 'e.g., "Relax & ground yourself"',
    },
    {
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          {title: 'Morning Harmony', value: 'morning'},
          {title: 'Quiet Mind, Restful Night', value: 'night'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'orderRank',
      title: 'Order Rank',
      type: 'number',
      description: 'The order it appears (1, 2, 3...). 1 will be the first one shown.',
      validation: (Rule) => Rule.required().min(1),
    },
   // ...
    {
      name: 'instructions',
      title: 'Instructions',
      type: 'text', // <-- NEW
      description: 'The step-by-step text for the meditation (Cuore Mind1 screen).',
    },
// ...
    {
      name: 'audioFile',
      title: 'Audio File',
      type: 'file',
      options: {
        accept: 'audio/*',
      },
    },
  ],
  // Optional: Make the list in Sanity Studio easier to read
  preview: {
    select: {
      title: 'title',
      subtitle: 'category',
      order: 'orderRank',
    },
    prepare({title, subtitle, order}) {
      let categoryLabel = 'Unknown';
      if (subtitle === 'morning') categoryLabel = 'Morning Harmony';
      if (subtitle === 'night') categoryLabel = 'Quiet Mind';
      
      return {
        title: `(${order || '?'}) ${title}`,
        subtitle: categoryLabel,
      };
    },
  },
  // Default ordering in the Sanity Studio
  orderings: [
    {
      title: 'By Category & Rank',
      name: 'categoryRankAsc',
      by: [
        {field: 'category', direction: 'asc'},
        {field: 'orderRank', direction: 'asc'},
      ],
    },
  ],
};