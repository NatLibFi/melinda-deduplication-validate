// @flow
import type { MarcRecord } from 'melinda-deduplication-common/types/marc-record.flow';

const fs = require('fs');
const path = require('path');
const synaptic = require('synaptic');

const networkFile = path.resolve(__dirname, './percepton.json');
const exported = JSON.parse(fs.readFileSync(networkFile, 'utf8'));
const importedNetwork = synaptic.Network.fromJSON(exported);

const DuplicateClass = {
  IS_DUPLICATE: 'IS_DUPLICATE',
  NOT_DUPLICATE: 'NOT_DUPLICATE',
  MAYBE_DUPLICATE: 'MAYBE_DUPLICATE'
};

function checkSimilarity(firstRecord: MarcRecord, secondRecord: MarcRecord) {

  const inputVector = Utils.pairToInputVector([firstRecord, secondRecord]);
  const numericProbability = importedNetwork.activate(inputVector)[0];

  return {
    type: classifyResult(numericProbability),
    numeric: numericProbability,
    inputVector
  };
}

function classifyResult(validationResult) {
  if (validationResult < 0.5) {
    return DuplicateClass.NOT_DUPLICATE;
  }
  if (validationResult > 0.75) {
    return DuplicateClass.IS_DUPLICATE;
  }
  return DuplicateClass.MAYBE_DUPLICATE;
}

module.exports = {
  checkSimilarity,
  DuplicateClass
};
