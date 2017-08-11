// @flow

const logger = require('melinda-deduplication-common/utils/logger');
logger.log('info', 'Starting melinda-deduplication-validate');

const _ = require('lodash');
const amqp = require('amqplib');

const utils = require('melinda-deduplication-common/utils/utils');
const CandidateQueueConnector = require('melinda-deduplication-common/utils/candidate-queue-connector');
const DuplidateQueueConnector = require('melinda-deduplication-common/utils/duplicate-queue-connector');
const DataStoreConnector = require('melinda-deduplication-common/utils/datastore-connector');

const CANDIDATE_QUEUE_AMQP_HOST = utils.readEnvironmentVariable('CANDIDATE_QUEUE_AMQP_HOST');
const DUPLICATE_QUEUE_AMQP_HOST = utils.readEnvironmentVariable('DUPLICATE_QUEUE_AMQP_HOST');
const DATASTORE_API = utils.readEnvironmentVariable('DATASTORE_API', 'http://localhost:8080');

const dataStoreService = DataStoreConnector.createDataStoreConnector(DATASTORE_API);
const RecordSimilarityService = require('./record-similarity-service');

start().catch(error => {
  logger.log('error', error.message, error);
});

async function start() {
  logger.log('info', 'Connecting to rabbitMQ');
  const candidateQueueConnection = await amqp.connect(CANDIDATE_QUEUE_AMQP_HOST);
  const channel = await candidateQueueConnection.createChannel();
  logger.log('info', 'Connected to rabbitMQ');
  const candidateQueueConnector = CandidateQueueConnector.createCandidateQueueConnector(channel);

  const duplicateQueueConnection = await amqp.connect(DUPLICATE_QUEUE_AMQP_HOST);
  const duplicateChannel = await duplicateQueueConnection.createChannel();
  const duplicateQueueConnector = DuplidateQueueConnector.createDuplicateQueueConnector(duplicateChannel);

  candidateQueueConnector.listenForCandidates(async (candidate, done) => {

    logger.log('info', 'Loading records from data store');
    const startTime = process.hrtime();
    const ioStart = process.hrtime();
    const firstRecord = await dataStoreService.loadRecord(candidate.first.base, candidate.first.id);
    const secondRecord = await dataStoreService.loadRecord(candidate.second.base, candidate.second.id);
    const ioDuration = utils.hrtimeToMs(process.hrtime(ioStart));

    logger.log('info', 'Checking record similarity');
    const validateStart = process.hrtime();

    let validationResult;
    try {
      validationResult = RecordSimilarityService.checkSimilarity(firstRecord, secondRecord);
    } catch(e) {
      logger.log('error', 'Failure in marc-record-similarity module, skipping this candidate');
      logger.log('error', candidate);
      return done();
    }
    const validateDuration = utils.hrtimeToMs(process.hrtime(validateStart));

    console.log(validationResult);

    const {IS_DUPLICATE, NOT_DUPLICATE, MAYBE_DUPLICATE} = RecordSimilarityService.DuplicateClass;

    if (validationResult.type === MAYBE_DUPLICATE || validationResult.type === IS_DUPLICATE) {
      console.log(firstRecord.toString());
      console.log(secondRecord.toString());
    }

    switch(validationResult.type) {
      case IS_DUPLICATE: await sendToDuplicateQueue(candidate, validationResult); break;
      case MAYBE_DUPLICATE: await sendToDuplicateDatabase(candidate); break;
    }

    const duration = utils.hrtimeToMs(process.hrtime(startTime));
    logger.log('info', `Candidate was handled in ${duration}ms - IO took ${ioDuration}ms - Validation took ${validateDuration}ms`);

    done();

    async function sendToDuplicateQueue(candidate, validationResult) {
      const duplicate = _.extend({}, candidate, { probability: validationResult.numeric});
      duplicateQueueConnector.pushDuplicate(duplicate);
    }

    async function sendToDuplicateDatabase(candidate) {
      logger.log('info', 'Sending MAYBE to duplicate queue for testing, this should go to duplicate db');
      await sendToDuplicateQueue(candidate, validationResult);
    }
  });

}
