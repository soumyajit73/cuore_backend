export default {
  name: 'knowledgeCard',
  title: 'Cuore Knowledge Card',
  type: 'document',
  fields: [
    {
      name: 'title',
      title: 'Title',
      type: 'string',
    },
    {
      name: 'subtitle',
      title: 'One-liner',
      type: 'string',
    },
    {
      name: 'conditionType',
      title: 'Condition Type',
      type: 'string',
      options: {
        list: [
          { title: 'Diabetes', value: 'diabetes' },
          { title: 'Hypertension', value: 'hypertension' },
          { title: 'Diabetes + Hypertension', value: 'diabetes_hypertension' },
          { title: 'Smoking', value: 'smoking' },
          { title: 'General', value: 'general' },
        ],
      },
    },
    {
      name: 'details',
      title: 'Detailed Description',
      type: 'array',
      of: [{ type: 'block' }],
    },
    {
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [{ type: 'image' }],
    },
  ],
};
