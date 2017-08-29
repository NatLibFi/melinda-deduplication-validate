
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('/tmp/parsed-training-data.json', 'utf8'));

const inputs = data.map(item => item.input);

inputs.forEach(input => {
//  console.log(input.join('\t'));
});

const featureVectors = data.map(item => item._featureVector);

console.log(Object.keys(featureVectors[0]).join('\t'));

const counts = {};

featureVectors.forEach(vector => {
  console.log(Object.values(vector).join('\t'));

  Object.keys(vector).forEach(key => {
    if (vector[key] !== null) {
      if (counts[key] === undefined) counts[key] = 0;
      counts[key]++;
    }
  });
});

console.error(counts);

