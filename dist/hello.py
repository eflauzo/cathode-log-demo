###############################################################################
#
# Copyright (c) Crossbar.io Technologies GmbH and/or collaborators. All rights reserved.
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions are met:
#
# 1. Redistributions of source code must retain the above copyright notice,
# this list of conditions and the following disclaimer.
#
# 2. Redistributions in binary form must reproduce the above copyright notice,
# this list of conditions and the following disclaimer in the documentation
# and/or other materials provided with the distribution.
#
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
# AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
# IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
# ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
# LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
# CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
# SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
# INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
# CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
# ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
# POSSIBILITY OF SUCH DAMAGE.
#
###############################################################################

import sys
import math
import time

from twisted.internet.defer import inlineCallbacks
from twisted.logger import Logger

from autobahn.twisted.util import sleep
from autobahn.twisted.wamp import ApplicationSession
from autobahn.wamp.exception import ApplicationError

from twisted.logger import (
    eventsFromJSONLogFile, textFileLogObserver
)


output = textFileLogObserver(sys.stdout)

#import logging
#import logging.handlers
#logger = logging.getLogger("")
#logger.setLevel(logging.DEBUG)
#handler = logging.handlers.RotatingFileHandler(#
#     LOGFILE, maxBytes=(1048576*5), backupCount=7
# )
# formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
# handler.setFormatter(formatter)
# logger.addHandler(handler)

print "XXXX"
class AppSession(ApplicationSession):

    log = Logger(observer=output)

    @inlineCallbacks
    def onJoin(self, details):
        print "!!!!"
        # SUBSCRIBE to a topic and receive events
        #
        def onhello(msg):
            self.log.info("event for 'onhello' received: {msg}", msg=msg)

        yield self.subscribe(onhello, 'com.example.onhello')
        self.log.info("subscribed to topic 'onhello'")

        # REGISTER a procedure for remote calling
        #
        def add2(x, y):
            self.log.info("add2() called with {x} and {y}", x=x, y=y)
            return x + y

        yield self.register(add2, 'com.example.add2')
        self.log.info("procedure add2() registered")

        ## Registering get range
        #
        def get_range(channel):
            self.log.info("range for {ch}", ch=channel)
            return [150.0, 1200.0]

        reg = yield self.register(get_range, 'cathode.get_range')
        self.log.info("procedure get_range() registered")

        print "XXX"
        start = time.time()
        while True:
            #tm = time.time()
            x = time.time()
            #tm = x - start + 500.0
            tm = time.time()
            valueA = math.sin(tm / 10.0 * 3.14)
            valueB = math.sin(tm / 20.0 * 3.14)
            valueC = math.sin(tm / 25.0 * 3.14)

            #print "XXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            print "publishing ", tm
            yield self.publish('realtime.data_A', [tm, valueA])
            yield self.publish('realtime.data_B', [tm, valueB])
            yield self.publish('realtime.data_C', [tm, valueC])
            yield sleep(0.20)

        '''
        # PUBLISH and CALL every second .. forever
        #
        counter = 0
        while True:

            # PUBLISH an event
            #
            yield self.publish('com.example.oncounter', counter)
            self.log.info("published to 'oncounter' with counter {counter}",
                          counter=counter)
            counter += 1

            # CALL a remote procedure
            #
            try:
                res = yield self.call('com.example.mul2', counter, 3)
                self.log.info("mul2() called with result: {result}",
                              result=res)
            except ApplicationError as e:
                # ignore errors due to the frontend not yet having
                # registered the procedure we would like to call
                if e.error != 'wamp.error.no_such_procedure':
                    raise e

            yield sleep(1)
        '''
