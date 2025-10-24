// schemas/fitnessPlan.js
export default {
  name: 'fitnessPlan',
  title: 'Fitness Plan',
  type: 'document',
  fields: [
    {
      name: 'planIdentifier',
      title: 'Plan Identifier',
      type: 'slug', // e.g., ya-15, ma-30
      description: 'Unique identifier based on Age Group and Duration (e.g., ya-15). Use lowercase.',
      validation: Rule => Rule.required(),
    },
    {
      name: 'ageGroup',
      title: 'Age Group',
      type: 'string',
      options: {
        list: [
          { title: 'Young Adult (<40)', value: 'YA' },
          { title: 'Middle-aged Adult (40-59)', value: 'MA' },
          { title: 'Senior Adult (60-69)', value: 'SA' },
          { title: 'Older Adult (>=70)', value: 'OA' },
        ],
      },
      validation: Rule => Rule.required(),
    },
    {
      name: 'durationMinutes',
      title: 'Duration (Minutes)',
      type: 'number',
      options: {
        list: [15, 30, 45],
      },
      validation: Rule => Rule.required(),
    },
    {
      name: 'weeklySchedule',
      title: 'Weekly Schedule',
      type: 'object',
      fields: [
        // Assuming Monday is always Rest based on sheets
        { name: 'tuesdayPlan', title: 'Tuesday Plan', type: 'array', of: [{ type: 'reference', to: { type: 'exercise' } }] },
        { name: 'wednesdayPlan', title: 'Wednesday Plan', type: 'array', of: [{ type: 'reference', to: { type: 'exercise' } }] },
        { name: 'thursdayPlan', title: 'Thursday Plan', type: 'array', of: [{ type: 'reference', to: { type: 'exercise' } }] },
        { name: 'fridayPlan', title: 'Friday Plan', type: 'array', of: [{ type: 'reference', to: { type: 'exercise' } }] },
        { name: 'saturdayPlan', title: 'Saturday Plan', type: 'array', of: [{ type: 'reference', to: { type: 'exercise' } }] },
        { name: 'sundayPlan', title: 'Sunday Plan', type: 'array', of: [{ type: 'reference', to: { type: 'exercise' } }] },
      ],
      description: 'Exercises assigned for each day (references). Assumes Monday is Rest.',
    }
  ],
  preview: {
    select: {
      title: 'planIdentifier.current'
    }
  }
};
