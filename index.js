var util = require('util')
  , IRC = require('irc-js');

var irc = new IRC({ server: 'irc.freenode.net', nick: 'LogService' })
  , channels = {};

function param( data, no_pad, pad_char ) {
  return ( no_pad ? '' : ( pad_char ? pad_char : ' ' ) ) + data.toString()
}
  
irc.notice = function(receiver, msg) {
  this.raw( 'NOTICE' + param( receiver ) + ' ' + param( msg || '', null, ':' ) );
}

util.log('connecting');
irc.connect();
irc.addListener('privmsg', function respond(message) {
  var from = message.person.nick;

  if (from === 'frigg') return;

  //console.log(message);

  var to = message.params[0]
    , msg = message.params[1]
    , cmd = msg.split(/\s+/);

  if (to === 'LogService') {
    switch (cmd[0].toLowerCase()) {
      case 'watch':
        var ch = cmd[1]
          , channel = channels[ch] = channels[ch] || {};
        util.log('watching [' + ch + '] ' + from);
        channel[from] = null;
        irc.join(ch);
        break;
      case 'unwatch':
        var ch = cmd[1]
          , channel = channels[ch] = channels[ch] || {};
        util.log('unwatching [' + ch + '] ' + from);
        delete channel[from];
        if (Object.keys(channel).length === 0) {
          util.log('unwatching [' + ch + ']');
          delete channels[ch];
          irc.part(ch);
        }
        break;
      case 'status':
        Object.keys(channels).forEach(function(ch) {
          if (from in channels[ch]) {
            if (channels[ch][from])
              irc.notice(from, 'recording ' + ch);
            else
              irc.notice(from, 'watching ' + ch);
          }
        });
        break;
      default:
        var help = [
          '/msg LogService WATCH [channel]',
          '/msg LogService UNWATCH [channel]',
          '/msg LogService STATUS'
        ];
        for (var i = 0; i < help.length; i++)
          irc.notice(from, help[i]);
    }
  } else {
    var ch = to
      , channel = channels[ch];
    Object.keys(channel).forEach(function(nick) {
      var messages = channel[nick];
      if (messages)
        messages.push('[' + ch + '] ' + from + ': ' + msg);
    });
  }
});

irc.addListener('part', listen);
irc.addListener('quit', listen);

function listen(message) {
  //console.log(message);

  var nick = message.person.nick
    , ch = message.params[0];
  if (channels[ch] && nick in channels[ch])
    channels[ch][nick] = [];
};

irc.addListener('join', function dump(message) {
  //console.log(message);

  var nick = message.person.nick
    , ch = message.params[0]
    , messages;
  if (channels[ch] && (messages = channels[ch][nick]) && messages.length) {
    for (var i = 0; i < messages.length; i++)
      irc.notice(nick, messages[i]);
    channels[ch][nick] = null;
  }
});
