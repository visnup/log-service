**LogService** provides an offline messages system. When you leave
or quit from a channel, LogService can keep track of messages and
automatically send them to you when you re-join.

**/msg LogService &lt;command&gt;**

The following commands are available:

  * **WATCH [channel]**      Starts monitoring a channel.
  * **UNWATCH [channel]**    Stops monitoring a channel.
  * **STATUS**               Lists what channels are currently being monitored.
