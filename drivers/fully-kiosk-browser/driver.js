'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');
const AbortController = require('abort-controller');

class MyDriver extends Homey.Driver {

  async onInit() {
    this.log('MyDriver has been initialized');
  }

  async onPair(session) {
  
    let id;
    let ip4;
    let port;
    let name;
    let password;
    let station;

    session.setHandler('station-api', async function (data) {
    
      this.log('station-api');
      this.log('data:', data);

    });
  
  }

}

module.exports = MyDriver;