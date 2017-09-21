// @flow
import type { MarcRecord } from 'melinda-deduplication-common/types/marc-record.flow';

const fs = require('fs');
const path = require('path');
const synaptic = require('synaptic');

const IS_DUPLICATE_THRESHOLD = 0.75;

const SimilarityUtils = require('melinda-deduplication-common/similarity/utils');
const DuplicateClass = SimilarityUtils.DuplicateClass;

const networkFile = path.resolve(__dirname, 'config', 'duplicate-detection-model.json');
const jsonNetwork = JSON.parse(fs.readFileSync(networkFile, 'utf8'));
const importedNetwork = synaptic.Network.fromJSON(jsonNetwork);

function checkSimilarity(firstRecord: MarcRecord, secondRecord: MarcRecord) {

  const recordPair = {record1: firstRecord, record2: secondRecord};
  const inputVector = SimilarityUtils.pairToInputVector(recordPair);
  const numericProbability = importedNetwork.activate(inputVector)[0];

  const hasNegativeFeatures = inputVector.some(val => val < 0);
  
  return {
    type: classifyResult(numericProbability),
    numeric: numericProbability,
    inputVector,
    hasNegativeFeatures
  };
}

function classifyResult(validationResult) {
  if (validationResult < 0.65) {
    return DuplicateClass.NOT_DUPLICATE;
  }
  if (validationResult > IS_DUPLICATE_THRESHOLD) {
    return DuplicateClass.IS_DUPLICATE;
  }
  return DuplicateClass.MAYBE_DUPLICATE;
}

module.exports = {
  checkSimilarity,
  DuplicateClass
};
