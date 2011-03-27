var util = require('util')
  , mongo = require('mongodb')
  , IRC = require('irc-js')
  , _ = require('underscore')
  , me = 'LogService1';

var irc = new IRC({ server: 'irc.freenode.net', nick: me })
  , db = new mongo.Db('log-service', new mongo.Server('127.0.0.1', 27017, {}));

// TODO pull request to irc-js:
(function(irc) {
  irc.notice = function(receiver, msg) {
    this.raw( 'NOTICE' + param( receiver ) + ' ' + param( msg || '', null, ':' ) );
  }
  function param( data, no_pad, pad_char ) {
    return ( no_pad ? '' : ( pad_char ? pad_char : ' ' ) ) + data.toString();
  }
})(irc);

util.log('connecting');
irc.connect(function() {
  db.open(function(err) {
    util.log('mongodb ready');

    db.collection('nicks', function(err, collection) {
      db.nicks = collection;
      db.nicks.ensureIndex('channels._id', function() { });

      db.nicks.distinct('channels._id', function(err, chs) {
        for (var i = 0; i < chs.length; i++) if (chs[i]) irc.join(chs[i]);
      });
    });

    db.createCollection('messages', { capped: true, max: 2147483647 }, function(err, collection) {
      db.messages = collection;
      db.messages.ensureIndex([['channel', 1], ['created_at', 1]], function() { });
    });
  });
});

irc.addListener('privmsg', function respond(message) {
  var from = message.person.nick;

  if (from === 'frigg') return;

  //console.log(message);

  var to = message.params[0]
    , msg = message.params[1]
    , cmd = msg.split(/\s+/);

  if (to === me) {
    switch (cmd[0].toLowerCase()) {
      case 'watch':
        watch(cmd[1], from);
        break;
      case 'unwatch':
        unwatch(cmd[1], from);
        break;
      case 'status':
        status(from);
        break;
      default:
        var help = [
          '***** \002LogService\017 Help *****',
          '\002LogService\017 provides an offline messages system. When you leave',
          'or quit from a channel, LogService can keep track of messages and',
          'automatically send them to you when you re-join.',
          ' ',
          '\002/msg LogService <command>\017',
          ' ',
          'The following commands are available:',
          '\002WATCH [channel]\017      Starts monitoring a channel.',
          '\002UNWATCH [channel]\017    Stops monitoring a channel.',
          '\002STATUS\017               Lists what channels are currently being monitored.',
          ' ',
          '***** \002End of Help\017 ******'
        ];
        for (var i = 0; i < help.length; i++)
          irc.notice(from, help[i]);
    }
  } else {
    record(to, from, msg);
  }
});

irc.addListener('part', part);
irc.addListener('quit', part);
irc.addListener('join', join);

function watch(ch, n) {
  db.nicks.update({ _id: n, channels: null }, { _id: n, channels: [] },{ upsert: true }, function(err, nick) {
    db.nicks.update({ _id: n, 'channels._id': { '$ne': ch } }, { '$push': { channels: { _id: ch } } }, function(err, nick) {
      util.log('watch [' + ch + '] ' + n);
      irc.join(ch);
    });
  });
}

function unwatch(ch, n) {
  db.nicks.update({ _id: n }, { '$pull': { channels: { _id: ch } } }, function(err) {
    util.log('unwatch [' + ch + '] ' + n);
    db.nicks.count({ 'channels._id': ch }, function(err, count) {
      if (count === 0) {
        util.log('unwatch [' + ch + ']');
        irc.part(ch);
      }
    });
  });
}

function status(n) {
  db.nicks.findOne({ _id: n }, function(err, nick) {
    if (!nick) return;
    nick.channels.forEach(function(channel) {
      if (channel.part)
        irc.notice(n, 'listening ' + channel._id);
      else
        irc.notice(n, 'watching ' + channel._id);
    });
  });
}

function record(to, from, message) {
  db.messages.insert({ to: to, from: from, message: message, created_at: new Date() });
}

function part(message) {
  var n = message.person.nick
    , ch = message.params[0];
  util.log('listening [' + ch + '] ' + n);
  db.nicks.update({ _id: n, 'channels._id': ch }, { '$set': { 'channels.$.part': new Date() } });
}

function join(message) {
  var n = message.person.nick
    , ch = message.params[0];
  db.nicks.findOne({ _id: n, 'channels._id': ch, 'channels.part': { '$ne': null } }, function(err, nick) {
    if (!nick) return;
    var channel = _.detect(nick.channels, function(c) { return c._id === ch; });
    db.messages.find({ to: ch, created_at: { '$gt': channel.part }}, function(err, cursor) {
      cursor.each(function(err, message) {
        if (!message) return;
        var m = '[' + ch + '] ' + message.created_at.toString().replace(/ GMT.*/, '') + ' <' + message.from + '> ' + message.message;
        irc.notice(n, m);
      });
    });
  });

  db.nicks.update({ _id: n, 'channels._id': ch }, { '$unset': { 'channels.$.part': 1 } });
}
