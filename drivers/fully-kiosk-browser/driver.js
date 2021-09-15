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

    session.setHandler('validate_device', async (data) => {
    
      this.log('validate_device');
      this.log('data:', data);

            //?cmd=deviceInfo&type=json&password=[password]
            const url = `http://${data.host}:${data.port}/?cmd=deviceInfo&type=json&password=${data.passwd}`;
  
            this.log('url:', url);
        
            const controller = new AbortController();
            const timeout = setTimeout(() => {
              controller.abort();
            }, 25000);
        
            try {
              const response = await fetch(url, {
                method: 'GET',
                headers: {
                  Accept: 'application/json',
                },
                signal: controller.signal,
              }).then(res => {
                return res.json();
              }).then(json => {
                return json;
              }).catch(error => {
                this.log('Validate device error:', error);
                this.log('Validate device error type:', error.type);
        
                let message = '';
                if (error.type !== undefined && error.type === 'aborted') message = this.homey.__('pair.api.connection_timeout');
                else if (error.type === 'system' && error.code === 'ECONNREFUSED') message = this.homey.__('pair.api.connection_refused');
                else message = error.message;

                this.log('emitting message: ', message);
                session.emit('device-validate-error', message);
              });
        
              this.log('validate_device response:', response);
        
              if (response !== undefined && response.deviceName !== undefined) {
        
                this.log('Device validated: emitting device-validate-ok');
                session.emit('device-validate-ok', {id: response.deviceID, name: response.deviceModel, ip4: response.ip4, port: data.port, password: data.passwd, station: response})
                .then(this.log('Success emit device-validate-ok'))
                .catch(error => {
                  this.log('Error emitting device-validate-ok:');
                });
        
              } else if (response !== undefined) {
        
                this.log('response not ok');
                this.log('response error:', response.error);

                let message = '';

                if (response.error !== undefined) message = response.error;
                else if (response.status === 'Error') {
                  if (response.statustext === 'Please login') message = this.homey.__('pair.api.connection_invalid_credentials')
                  else message = response.statustext;
                }

                session.emit('device-validate-error', this.homey.__('pair.api.connection_failed') + message);
              }
              //return true;
        
            } catch (error) {
              session.emit('device-validate-error', error.message).then(this.log);
            } finally {
              this.log('Clearing timeout');
              clearTimeout(timeout);
            }
    });

    session.setHandler('save-data', async (data) => {
      this.log(data);
      this.log('Saving data in driver.js');

      id = data.id;
      ip4 = data.ip4;
      port = data.port;
      name = data.name;
      password = data.password;
      station = data.station;

      return true;
    });

    session.setHandler('list_devices', async data => {
      this.log('list_devices');

      this.log('id:', id);
      this.log('ip4:', ip4);
      this.log('port:', port);
      this.log('name:', name);
      this.log('station:', station);

      let nameConstructed = '';
      if (station.serial !== 'unknown') nameConstructed = `${name} (${station.serial})`; 
      else nameConstructed = `${name} (${station.deviceManufacturer})`;

      const devices = [{
        name: nameConstructed,
        data: {
          id: id
        },
        settings: {
          ip4: ip4,
          port: port,
          password: password
        },
        store: {
          id,
          host: ip4,
          port: Number(port),
          password: password,
          station: station,
          version: this.homey.manifest.version,
        },
      }];

      this.log('Returning devices', devices);
      return devices;
    });
  
  }

}

module.exports = MyDriver;