// schemas/exercise.js
export default {
  name: 'exercise',
  title: 'Exercise',
  type: 'document',
  fields: [
    {
      name: 'name',
      title: 'Exercise Name',
      type: 'string',
      validation: Rule => Rule.required(),
    },
    {
      name: 'code',
      title: 'Exercise Code',
      type: 'slug', // Use slug for unique, queryable code (e.g., E1, C1, S1)
      options: {
        source: (doc) => doc.name, // Auto-generate from name
        slugify: (input) => input.toUpperCase().replace(/[^A-Z0-9]/g, ''), // Force uppercase
        maxLength: 10,
      },
      description: 'Unique code (e.g., E1, C1, S1, F1, Y1) linking to plans. Stored in uppercase.',
      validation: Rule => Rule.required(),
    },
    {
      name: 'exerciseType',
      title: 'Exercise Type',
      type: 'string',
      options: {
        list: [
          { title: 'Lung Expansion', value: 'Lung Expansion' },
          { title: 'Cardio', value: 'Cardio' },
          { title: 'Strength', value: 'Strength' },
          { title: 'Flexibility', value: 'Flexibility' },
          { title: 'Yoga', value: 'Yoga' },
          { title: 'Balance', value: 'Balance' },
        ],
      },
      validation: Rule => Rule.required(),
    },
    {
      name: 'repsDuration',
      title: 'Reps / Duration',
      type: 'string',
      description: 'E.g., "6-8 Reps", "20-25 Min"',
      validation: Rule => Rule.required(),
    },
    {
      name: 'sets',
      title: 'Sets',
      type: 'number',
      validation: Rule => Rule.required().integer().positive(),
    },
    {
  name: "video",
  title: "Video",
  type: "file",
  options: {
    accept: "video/mp4"
  }
},

    {
  name: 'instructions',
  title: 'Instructions',
  type: 'string', // change from "text" to "string"
  description: 'HTML instructions for the exercise (from Word files).',
},

    {
      name: 'ageGroup',
      title: 'Age Group',
      type: 'string',
      description: 'Age group + duration of the plan (e.g., YA 15, MA 30)',
      options: {
        list: [
          { title: 'YA 15', value: 'YA-15' },
          { title: 'YA 30', value: 'YA-30' },
          { title: 'YA 45', value: 'YA-45' },
          { title: 'MA 15', value: 'MA-15' },
          { title: 'MA 30', value: 'MA-30' },
          { title: 'MA 45', value: 'MA-45' },
          { title: 'SA 15', value: 'SA-15' },
          { title: 'SA 30', value: 'SA-30' },
          { title: 'SA 45', value: 'SA-45' },
          { title: 'OA 15', value: 'OA-15' },
          { title: 'OA 30', value: 'OA-30' },
          { title: 'OA 45', value: 'OA-45' },
        ],
      },
      validation: Rule => Rule.required(),
    },
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'code.current',
      ageGroup: 'ageGroup',
    },
    prepare(selection) {
      const { title, subtitle, ageGroup } = selection;
      return {
        title,
        subtitle: `${subtitle} | ${ageGroup}`, // Shows code in uppercase + age group
      };
    },
  },
};
