const _ = require('lodash');
const fs = require('fs');
const items = JSON.parse(fs.readFileSync('./falsePositives.json'));
const MarcRecord = require('marc-record-js');
const execSync = require('child_process').execSync;

items.forEach(item => {
  const pair = item.pair;

  const record1 = MarcRecord.clone(pair.record1);
  const record2 = MarcRecord.clone(pair.record2);

  fs.writeFileSync('/tmp/rec1', record1.toString());
  fs.writeFileSync('/tmp/rec2', record2.toString());

  console.log(readableMeta(item));
  code = execSync('/usr/bin/meld /tmp/rec1 /tmp/rec2');
});

function readableMeta(item) {
  const humanLabel = item.label === 'negative' ? 'NOT_DUPLICATE' : 'IS_DUPLICATE';
  const mlpLabel = item.synapticLabel;
  const features = item.probability.result.featureVector;
  const featureList = Object.keys(features).map(key => `${key}: ${features[key]}`).map(str => '    ' + str).join('\n');
  
  return `
  humanLabel: ${humanLabel}
  computerLabel: ${mlpLabel}
  numericProbability: ${item.probability.numeric}
  features: 
${featureList}
  `;
}
