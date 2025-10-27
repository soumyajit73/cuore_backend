export default  {
  name: 'tobaccoEncouragement',
  title: 'Tobacco Encouragement',
  type: 'document',
  fields: [
    {
      name: 'category',
      title: 'Category',
      type: 'string',
      description: 'Which condition triggers this message?',
      options: {
        list: [
          { title: 'A: General (Smoker)', value: 'A' },
          { title: 'B: Reduced Intake', value: 'B' },
          { title: 'C: Increased Intake', value: 'C' },
          { title: 'D: Logged Smoke-Free Day (First)', value: 'D' },
          { title: 'E: Smoke-Free Streak (>2 days)', value: 'E' },
          { title: 'F: Relapse (Logged >0 after streak)', value: 'F' },
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'message',
      title: 'Message',
      type: 'text',
      description: 'The motivational message.',
      validation: (Rule) => Rule.required(),
    },
  ],
  orderings: [
    {
      title: 'By Category',
      name: 'categoryAsc',
      by: [{ field: 'category', direction: 'asc' }],
    },
  ],
};

