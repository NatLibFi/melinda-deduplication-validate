// @flow

const logger = require('melinda-deduplication-common/utils/logger');
logger.log('info', 'Starting melinda-deduplication-validate');

const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const amqp = require('amqplib');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const debug = require('debug')('validate');

const utils = require('melinda-deduplication-common/utils/utils');
const SimilarityUtils = require('melinda-deduplication-common/similarity/utils');
const RecordUtils = require('melinda-deduplication-common/utils/record-utils');

const CandidateQueueConnector = require('melinda-deduplication-common/utils/candidate-queue-connector');
const DuplidateQueueConnector = require('melinda-deduplication-common/utils/duplicate-queue-connector');
const DataStoreConnector = require('melinda-deduplication-common/utils/datastore-connector');
const DuplicateDatabaseConnector = require('melinda-deduplication-common/utils/duplicate-database-connector');

const CANDIDATE_QUEUE_AMQP_URL = utils.readEnvironmentVariable('CANDIDATE_QUEUE_AMQP_URL');
const DUPLICATE_QUEUE_AMQP_URL = utils.readEnvironmentVariable('DUPLICATE_QUEUE_AMQP_URL');
const DATASTORE_API = utils.readEnvironmentVariable('DATASTORE_API', 'http://localhost:8080');
const NUMBER_OF_WORKERS = utils.readEnvironmentVariable('NUMBER_OF_WORKERS', numCPUs);
const dataStoreService = DataStoreConnector.createDataStoreConnector(DATASTORE_API);
const RecordSimilarityService = require('./record-similarity-service');

const DUPLICATE_DB_API = utils.readEnvironmentVariable('DUPLICATE_DB_API');
const DUPLICATE_DB_MESSAGE = utils.readEnvironmentVariable('DUPLICATE_DB_MESSAGE', 'Automatic Melinda deduplication');
const DUPLICATE_DB_PRIORITY = utils.readEnvironmentVariable('DUPLICATE_DB_PRIORITY', 1);

const duplicateDBConfiguration = {
  endpoint: DUPLICATE_DB_API,
  messageForDuplicateDatabase: DUPLICATE_DB_MESSAGE,
  priorityForDuplicateDatabase: DUPLICATE_DB_PRIORITY
};

const modelPath = path.resolve(__dirname, 'config', 'select-better-model.json');
const selectPreferredRecordModel = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
const PreferredRecordService = require('melinda-deduplication-common/utils/preferred-record-service');

process.on('unhandledRejection', error => {
  logger.log('error', 'unhandledRejection', error.message, error.stack);
  process.exit(1);
});

if (cluster.isMaster) {
  logger.log('info', `Master ${process.pid} is running.`);
  logger.log('info', `Starting ${NUMBER_OF_WORKERS} workers.`);

  for (let i = 0; i < NUMBER_OF_WORKERS; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    logger.log('info', `worker ${worker.process.pid} died`);
  });

} else {

  start(process, logger).catch(error => {
    logger.log('error', error.message, error);
  });
  
}

function wrapLoggerWithPid(pid, logger) {
  logger.filters.push((level, msg) => {
    return `${pid}] ${msg}`;
  });
  return logger;
}

async function start(process, workerLogger) {
  const pid = process.pid;
  const logger = wrapLoggerWithPid(pid, workerLogger.createLogger());
  logger.log('info', `Worker ${process.pid} started`);
  
  logger.log('info', 'Connecting to rabbitMQ');
  const candidateQueueConnection = await amqp.connect(CANDIDATE_QUEUE_AMQP_URL);
  const channel = await candidateQueueConnection.createChannel();
  logger.log('info', 'Connected to rabbitMQ');
  const candidateQueueConnector = CandidateQueueConnector.createCandidateQueueConnector(channel);

  const duplicateQueueConnection = await amqp.connect(DUPLICATE_QUEUE_AMQP_URL);
  const duplicateChannel = await duplicateQueueConnection.createChannel();
  const duplicateQueueConnector = DuplidateQueueConnector.createDuplicateQueueConnector(duplicateChannel);

  const preferredRecordService = PreferredRecordService.createPreferredRecordService(selectPreferredRecordModel);
  
  const duplicateDatabaseConnector = DuplicateDatabaseConnector.createDuplicateDatabaseConnector(duplicateDBConfiguration);

  candidateQueueConnector.listenForCandidates(async (candidate, done) => {

    const pairIdentifier = `(${candidate.first.base})${candidate.first.id} - (${candidate.second.base})${candidate.second.id}`;
    
    logger.log('info', `${pairIdentifier} Loading records from data store`);
    const startTime = process.hrtime();
    const ioStart = process.hrtime();
    const firstRecord = await dataStoreService.loadRecord(candidate.first.base, candidate.first.id);
    const secondRecord = await dataStoreService.loadRecord(candidate.second.base, candidate.second.id);
    const ioDuration = utils.hrtimeToMs(process.hrtime(ioStart));

    const { preferredRecord, otherRecord } = preferredRecordService.selectPreferredRecord(firstRecord, secondRecord);

    logger.log('info', `${pairIdentifier} Checking similarity`);
    const validateStart = process.hrtime();

    let validationResult;
    try {
      validationResult = RecordSimilarityService.checkSimilarity(preferredRecord, otherRecord);
    } catch(e) {
      logger.log('error', `${pairIdentifier} Failure in marc-record-similarity module, skipping this candidate`);
      logger.log('error', e);
      logger.log('error', candidate);
      logger.log('error', preferredRecord.toString());
      logger.log('error', otherRecord.toString());
      
      return done();
    }
    const validateDuration = utils.hrtimeToMs(process.hrtime(validateStart));

    const {IS_DUPLICATE, MAYBE_DUPLICATE} = SimilarityUtils.DuplicateClass;

    if (validationResult.type === MAYBE_DUPLICATE || validationResult.type === IS_DUPLICATE) {
      debug('First:');
      debug(firstRecord.toString());
      debug('Second:');
      debug(secondRecord.toString());
    }

    logger.log('info', `${pairIdentifier} is ${validationResult.type}. Negative features: ${validationResult.hasNegativeFeatures}`);

    if (validationResult.hasNegativeFeatures) {
      logger.log('info', `${pairIdentifier} has negative features. Skipping pair`);
    } else {
      switch(validationResult.type) {
        case IS_DUPLICATE: await sendToDuplicateQueue(candidate, validationResult); break;
        case MAYBE_DUPLICATE: await sendToDuplicateDatabase(candidate, validationResult); break;
      }
    }
  
    const duration = utils.hrtimeToMs(process.hrtime(startTime));
    logger.log('info', `${pairIdentifier} was handled in ${duration}ms - IO took ${ioDuration}ms - Validation took ${validateDuration}ms`);

    done();

    async function sendToDuplicateQueue(candidate, validationResult) {
      const duplicate = _.extend({}, candidate, { probability: validationResult.numeric});
      duplicateQueueConnector.pushDuplicate(duplicate);
    }

    async function sendToDuplicateDatabase(candidate, validationResult) {
      const probability = validationResult.numeric;
      const pairIdentifier = `(${candidate.first.base})${candidate.first.id} - (${candidate.second.base})${candidate.second.id}`;
      
      logger.log('warn', `Duplicate pair ${pairIdentifier} probability: ${probability}. Pair will be sent to duplicate database`);
      try {
        await duplicateDatabaseConnector.addDuplicatePair(candidate.first, candidate.second);
      } catch(error) {
        logger.log('warn', `Could not add ${pairIdentifier} to duplicate database: ${error.message}`);
      }

    }
  });
}
