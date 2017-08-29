const _ = require('lodash');
const fs = require('fs');
const data = fs.readFileSync('/tmp/thresholddata.txt', 'utf8').split('\n').filter(f => f.length > 2).map(line => line.split(' '));

const probabilities = data.map(item => item[1]);

const thresholdOptions = _.uniq(probabilities);

const results = thresholdOptions.map(threshold => {

  const correct = data.filter(item => {
    const label = item[0];
    
    const guessLabel = getLabel(item, threshold);
    return guessLabel === label;
  });

  const cls = data.reduce((stats, item) => {
    const label = item[0];
    const guessLabel = getLabel(item, threshold);
    if (guessLabel === 'positive') {
      if (label === 'positive') {
        stats.tp++;
      } else {
        stats.fp++;
      }
    }
    if (guessLabel === 'negative') {
      if (label === 'negative') {
        stats.tn++;
      } else {
        stats.fn++;
      }
    }
    return stats;
  }, {tn: 0, tp:0, fn: 0, fp: 0});


  return { threshold, correct: correct.length, cls };
});


results.forEach(res => {
  console.log(res.threshold, res.correct, res.cls.fp);
});

function getLabel(item, threshold) {
  const probability = item[1];

  if (probability > threshold) {
    return 'positive';
  } else {
    return 'negative';
  }

}