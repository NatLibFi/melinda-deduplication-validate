/* eslint-disable no-console */

const _ = require('lodash');

const AVAILABLE_COMMANDS = ['remove', 'count'];

try {
  const { command, pair } = readArguments(process.argv);

  run(command, pair).catch(error => {
    console.error(error);
  });
  
} catch(error) {
  console.error(error.message);
  process.exit(1);
}

async function run(command, pair) {

  const recordSetData = await readStdin();

  const recordSet = JSON.parse(recordSetData);

  const transformedSet = transformSet(recordSet, command, pair);
  
  console.log(JSON.stringify(transformedSet));

}

function transformSet(recordSet, command, pair) {
  if (command === 'remove') {
    return recordSet.filter(item => {
      const id1 = getRecordId(item.pair.record1);
      const id2 = getRecordId(item.pair.record2);
      
      const pairAsNumbers = pair.map(i => parseInt(i));
      const idsAsNumbers = [id1, id2].map(i => parseInt(i));

      return !(isSame(pairAsNumbers, idsAsNumbers));
    });
  }
  if (command === 'count') {
    console.log(recordSet.length);
    process.exit(0);
  }
  throw new Error(`Command ${command} not implemented.`);
}

function isSame(pair1, pair2) {
  if (pair1[0] === pair2[0] && pair1[1] === pair2[1]) {
    return true;
  }
  if (pair1[0] === pair2[1] && pair1[1] === pair2[0]) {
    return true;
  }
  return false;
}

function getRecordId(record) {
  const f001 = _.head(record.fields.filter(field => field.tag === '001'));
  return _.get(f001, 'value');
}

function readArguments(argv) {

  const command = argv[2];
  const pair = [argv[3], argv[4]];
  
  if (!AVAILABLE_COMMANDS.includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  if (isNaN(pair[0]) || isNaN(pair[1])) {
    throw new Error(`Record ids must be numbers: ${pair[0]} ${pair[1]}`);
  }
  return { command, pair };
}

async function readStdin() {
  return new Promise(resolve => {

    let data = '';

    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
      const chunk = process.stdin.read();
      if (chunk !== null) {
        data = data + chunk;
      }
    });

    process.stdin.on('end', () => {
      resolve(data);
    });
  });
}