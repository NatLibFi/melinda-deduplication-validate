const fs = require('fs');
const Utils = require('../bin/utils');
const items = JSON.parse(fs.readFileSync('/tmp/guesses.json'));

const falsePositives = items.filter(item => item.type === Utils.Types.FALSE_POSITIVE);
console.log(falsePositives.length);

fs.writeFileSync('falsePositives.json', JSON.stringify(falsePositives));

