// utils/sanityClient.js
const { createClient } = require('@sanity/client');
require('dotenv').config();

const client = createClient({
  projectId: 'r1a9xgjr', // Your project ID
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: process.env.NODE_ENV === 'production',
  token: process.env.SANITY_READ_TOKEN, // Optional: Add to .env if needed
});

module.exports = client;



    