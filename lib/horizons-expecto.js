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

function ephemeris(options) {

  return Promise.resolve()
    .then(trace('Selecting mode of operations'))
    .then(expect(/Select.*:.*/)).then(send('E'))
    .then(expect(/Observe, Elements, Vectors.*:.*/)).then(send('E'))
    .then(trace('Selecting coordinate system center'))
    .then(expect(/Coordinate system center.*:.*/)).then(send(options['center']))
    .then(trace('Selecting reference plane'))
    .then(expect(/Reference plane.*:.*/)).then(send(options['ref-plane']))
    .then(trace('Setting times and interval'))
    .then(expect(/Starting CT.*:.*/)).then(send(options['start']))
    .then(expect(/Ending.*CT.*:.*/)).then(send(options['end']))
    .then(expect(/Output interval.*:.*/)).then(send(options['interval']))
    .then(trace('Accepting values'))
    .then(expect(/Accept default.*:.*/)).then(send('y'));
}

function parse() {
  return new Promise(function (fulfill, reject) {
    Promise.resolve()
      .then(trace('Parsing ephemeris data'))
      .then(expect(/\$\$SOE/))
      .then(trace('Start of ephemeris data'))
      .then(parseBlocks)
      .then(fulfill, reject)
      .then(trace('Continuing interaction'));
  });
}

function parseBlocks() {
  return new Promise(function (fulfill, reject) {
    function loop(blocks) {
      horizons.timeout(3000).then(reject, nop);

      horizons.expect(/^(\d+\.\d+) = (.\..\. \d{4}-(?:.{3})-\d{2} \d{2}:\d{2}:\d{2}.\d{4}) \(..\)$/m)
        .then(parseBlock)
        .then(function (block) {
          blocks.push(block);
          return blocks;
        })
        .then(loop, trace('No more blocks'));  // repeat

      horizons.expect(/\$\$EOE/)
        .then(trace('End of ephemeris data'))
        .then(function () {
          fulfill(blocks);
        }, nop);
    }

    loop([]);
  });
}

function parseBlock(match) {
  var data = {
    'JD': parseFloat(match.matches[1])
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

function ephemerisElements(options) {
  return new Promise(function (fulfill, reject) {
    setup()
      .then(function () { return lookUp(options['designation']); })
      .then(function () { return ephemeris(options); })
      .then(parse)
      .then(fulfill, reject)
      .then(expect(/>>> Select.*:.*/))
      .then(trace('quit'))
      .then(send('Q'))
      .catch(function (err) {
        console.error(err);
        process.exit(1);
      });
  });
}

function notImplemented() {
  throw new Error('not implemented');
}

exports.search = notImplemented;
exports.approach = notImplemented;

exports.ephemeris = {
  observe: notImplemented,
  elements: ephemerisElements,
  vector: notImplemented
};
