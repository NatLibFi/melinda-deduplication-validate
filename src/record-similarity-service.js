// @flow

import type { MarcRecord } from 'melinda-deduplication-common/types/marc-record.flow';


const fs = require('fs');
const path = require('path');
const RecordSimilarity = require('marc-record-similarity');
const strategy = require('./similarity-strategy');

const net = fs.readFileSync(path.resolve(__dirname, '../node_modules/marc-record-similarity/neural/networks/2014-11-27.json'), 'utf8');

const options = {
  network: JSON.parse(net),
  strategy: strategy
};

const similarity = new RecordSimilarity(options);

const DuplicateClass = {
  IS_DUPLICATE: 'IS_DUPLICATE',
  NOT_DUPLICATE: 'NOT_DUPLICATE',
  MAYBE_DUPLICATE: 'MAYBE_DUPLICATE'
};

function checkSimilarity(firstRecord: MarcRecord, secondRecord: MarcRecord) {

  const result = similarity.check(firstRecord, secondRecord);

  return {
    type: classifyResult(result),
    numeric: result
  };
}

function classifyResult(validationResult) {
  if (validationResult < 0.5) {
    return DuplicateClass.NOT_DUPLICATE;
  }
  if (validationResult > 0.95) {
    return DuplicateClass.IS_DUPLICATE;
  }
  return DuplicateClass.MAYBE_DUPLICATE;
}

module.exports = {
  checkSimilarity,
  DuplicateClass
};