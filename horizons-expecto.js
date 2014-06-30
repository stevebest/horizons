var expecto = require('expecto');
var Promise = require('expecto/node_modules/bluebird');

var debug = require('debug')('horizons-expecto');

var horizons = null;

function nop() {}

function expect(what) {
  return function () {
    horizons.timeout(5000).then(nop, nop);
    return horizons.expect(what);
  }
}

function send(what) {
  return function () {
    horizons.send(what + '\n');
  }
}

function expectPrompt() {
  debug('expecting prompt');
  horizons.timeout(5000).then(nop, nop);
  return horizons.expect(/Horizons>/);
}

function lookUp(what) {
  return Promise.resolve()
    .then(expectPrompt)
    .then(trace('looking up ' + what))
    .then(send(what))
    .then(expect(/Continue.*/))
    .then(trace('confirming search results'))
    .then(send('y'));
}

function trace(message) {
  return function () {
    debug(message);
    return arguments;
  }
}

function ephemerides(center, refPlane, startingCT, endingCT, interval) {
  return Promise.resolve()
    .then(trace('Selecting mode of operations'))
    .then(expect(/Select.*:.*/)).then(send('E'))
    .then(expect(/Observe, Elements, Vectors.*:.*/)).then(send('E'))
    .then(trace('Selecting coordinate system center'))
    .then(expect(/Coordinate system center.*:.*/)).then(send(center))
    .then(trace('Selecting reference plane'))
    .then(expect(/Reference plane.*:.*/)).then(send(refPlane))
    .then(trace('Setting times and interval'))
    .then(expect(/Starting CT.*:.*/)).then(send(startingCT))
    .then(expect(/Ending.*CT.*:.*/)).then(send(endingCT))
    .then(expect(/Output interval.*:.*/)).then(send(interval))
    .then(trace('Accepting values'))
    .then(expect(/Accept default.*:.*/)).then(send('y'));
}

function parse() {
  return Promise.resolve()
    .then(trace('Parsing ephemerides data'))
    .then(expect(/\$\$SOE/))
    .then(trace('Start of ephemerides data'))
    .then(parseBlocks)
    .then(trace('Continuing interaction'));
}

function parseBlocks() {
  return new Promise(function (fulfill, reject) {
    function loop() {
      horizons.timeout(3000).then(reject, nop);

      horizons.expect(/^(\d+\.\d+) = (.\..\. \d{4}-(?:.{3})-\d{2} \d{2}:\d{2}:\d{2}.\d{4}) \(..\)$/m)
        .then(parseBlock)
        .then(loop, trace('No more blocks'));  // repeat

      horizons.expect(/\$\$EOE/)
        .then(trace('End of ephemerides data'))
        .then(fulfill, nop);
    }

    loop();
  });
}

function parseBlock(match) {
  var data = {
    'JD': match.matches[1]
  };

  function parseValue(field) {
    return function (match) {
      data[field] = parseFloat(match.matches[1]);
    }
  }

  return Promise.resolve()
    .then(expect(/\bEC\s*=\s*([0-9\.E+-]*)\s/)).then(parseValue('EC'))
    .then(expect(/\bQR\s*=\s*([0-9\.E+-]*)\s/)).then(parseValue('QR'))
    .then(expect(/\bIN\s*=\s*([0-9\.E+-]*)\s/)).then(parseValue('IN'))
    .then(expect(/\bOM\s*=\s*([0-9\.E+-]*)\s/)).then(parseValue('OM'))
    .then(expect(/\bW\s*=\s*([0-9\.E+-]*)\s/)).then(parseValue('W'))
    .then(expect(/\bTp\s*=\s*([0-9\.E+-]*)\s/)).then(parseValue('Tp'))
    .then(expect(/\bN\s*=\s*([0-9\.E+-]*)\s/)).then(parseValue('N'))
    .then(expect(/\bMA\s*=\s*([0-9\.E+-]*)\s/)).then(parseValue('MA'))
    .then(expect(/\bTA\s*=\s*([0-9\.E+-]*)\s/)).then(parseValue('TA'))
    .then(expect(/\bA\s*=\s*([0-9\.E+-]*)\s/)).then(parseValue('A'))
    .then(expect(/\bAD\s*=\s*([0-9\.E+-]*)\s/)).then(parseValue('AD'))
    .then(expect(/\bPR\s*=\s*([0-9\.E+-]*)\s/)).then(parseValue('PR'))
    .then(function () {
      console.log('parseBlock: %j', data);
      return data;
    });
}

function setup() {
  debug('spawning telnet');
  horizons = expecto.spawn('telnet', ['ssd.jpl.nasa.gov', '6775']);

  return Promise.resolve()
    .then(expectPrompt)
    .then(trace('Turning off paging'))
    .then(send('P'))
}

function Horizons(body, startingCT, endingCT) {
  setup()
    .then(function () { return lookUp(body) })
    .then(function () { return ephemerides('@Sun', 'eclip', startingCT, endingCT, '1d') })
    .then(parse)
    .then(expect(/>>> Select.*:.*/)).then(trace('quit')).then(send('Q'));
}

module.exports = Horizons;
