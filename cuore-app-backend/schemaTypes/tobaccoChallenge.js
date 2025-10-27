export default {
  name: 'tobaccoChallenge',
  title: 'Tobacco Challenge',
  type: 'document',
  fields: [
    {
      name: 'level',
      title: 'Level',
      type: 'number',
      description: 'The level number (0-9)',
      validation: (Rule) => Rule.required().min(0),
    },
    {
      name: 'tfdRequired',
      title: 'Tobacco-Free Days Required',
      type: 'number',
      description: 'e.g., Level 3 requires 3 TFD',
    },
    {
      name: 'challengeText',
      title: 'Challenge Text (Line 1)',
      type: 'string',
    },
    {
      name: 'challengeText2',
      title: 'Challenge Text (Line 2)',
      type: 'string',
    },
    {
      name: 'challengeText3',
      title: 'Challenge Text (Line 3)',
      type: 'string',
    },
    {
      name: 'algorithmLogic',
      title: 'Algorithm Logic (for reference)',
      type: 'string',
    },
  ],
  orderings: [
    {
      title: 'By Level',
      name: 'levelAsc',
      by: [{ field: 'level', direction: 'asc' }],
    },
  ],
};
