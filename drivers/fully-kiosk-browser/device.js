'use strict';

const { Device } = require('homey');
const fetch = require('node-fetch');
const AbortController = require('abort-controller');

let station = {};
let settings = {};
let refreshInterval;

class MyDevice extends Device {

  async onInit() {
    this.log('MyDevice onInit');
    this.setUnavailable(this.homey.__('app.initializing'))
    .catch(this.error);

    await this.getDeviceDetails();
    await this.setCapabilityListeners();
    await this.checkCapabilities();
    await this.setInterval();
    await this.setCurrentState()
    .then(() => {
      this.setAvailable().catch(this.error);
    })
    .catch(err => {
      this.log(err);
    });

    this.registerFlowListeners();
    this.getValues();

  }

  async onAdded() {
    this.log('MyDevice has been added');
  }

  async getDeviceDetails() {
    this.log('get device details');
    this.settings = this.getSettings();
    this.station = this.getStoreValue('station');
  }

  async onDeleted() {
    this.log('Device is deleted');
    this.clearInterval();
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('changedKeys:', changedKeys);

    if (changedKeys.includes('port')) {

      if (newSettings.port < 1 || newSettings.port > 65535) {

        this.log(newSettings.port + ' isn\'t a valid port');
        throw new Error(this.homey.__('settings.port_number_incorrect'));

      } else {
        this.settings.port = newSettings.port;
        this.log('Port ' + newSettings.port + ' is valid');
      }
    }

    if (changedKeys.includes('ip4')) {

      let isIpAddress = false;
      isIpAddress = await this.checkIpAddress(newSettings.ip4);

      if (!isIpAddress) {
        this.log(newSettings.ip4 + ' is not an valid ip address');
        throw new Error(this.homey.__('settings.ip_address_incorrect'));
      } else {
        this.settings.ip4 = newSettings.ip4;
        this.log(newSettings.ip4 + ' is a ip address');
      }
    }

    if (changedKeys.includes('update_interval')){
      this.settings.update_interval = newSettings.update_interval;
      this.clearInterval();
      this.setInterval();
    }

    if (changedKeys.includes('password')){
      this.log('Changing password');
      this.settings.password = newSettings.password;
    }
  }

  async setCapabilityListeners() {

    this.registerCapabilityListener("screenOn", async (data) => {
      await this.setValue(
        undefined,
        { action: (data ? "?cmd=screenOn&type=json" : "?cmd=screenOff&type=json"), value : false },
        true
      );
      await this.getValues();
    });

    this.registerCapabilityListener("screenBrightness", async (data) => {
      // Screen brightness of 0 won't change the brightness
      // use a brightness of 1 instead (range is 1 to 255)
      if (data == 0) data = 1;
      
      await this.setValue(
        undefined,
        { action: "?cmd=setStringSetting&type=json&key=screenBrightness&value", value: data * 2.5 },
        true
      );
      await this.getValues();
    });

  }

  async checkCapabilities() {
    this.log('check capabilities');

    if (this.station.sensorInfo !== undefined) {

      let sensor = {};

      for (var i = 0; i < this.station.sensorInfo.length; i++) { 
        sensor = this.station.sensorInfo[i];

        if (sensor.type === 6) {
          if (this.hasCapability('measure_pressure') === false) {
            await this.addCapability('measure_pressure');
          }
        }

        if (sensor.type === 5) {
          if (this.hasCapability('measure_luminance') === false) {
            await this.addCapability('measure_luminance');
          }
        }

      }

    } else {
      // This device does not report any sensors
      await this.removeCapability('measure_pressure').catch(this.error);
      await this.removeCapability('measure_luminance').catch(this.error);
    }

    /*
    if (this.hasCapability('kioskLocked') === false) {
      this.addCapability('kioskLocked');
    }
    */
    
  }

  async setCurrentState() {
    this.log('set currrent state');
    
    // set capability
    this.setCapabilityValue('measure_battery', this.station.batteryLevel)
    .catch(this.error);

    this.setCapabilityValue('alarm_battery', this.station.batteryWarning <= 10 ? true : false)
    .catch(this.error);

    this.setCapabilityValue('batteryTemperature', this.station.batteryTemperature)
    .catch(this.error);

    this.setCapabilityValue('hasLicense', this.station.isLicensed)
    .catch(this.error);

    this.setCapabilityValue('isInScreensaver', stringToBoolean(this.station.isInScreensaver))
    .catch(this.error);

    this.setCapabilityValue('screenOn', stringToBoolean(this.station.screenOn))
    .catch(this.error);

    this.setCapabilityValue('kioskLocked', stringToBoolean(this.station.kioskLocked))
    .catch(this.error);

    this.setCapabilityValue('isMobileDataEnabled', stringToBoolean(this.station.isMobileDataEnabled))
    .catch(this.error);

    let screenBrightness = convertBrightnessToHomeyValues(this.station.screenBrightness);
    screenBrightness = screenBrightness > 100 ? 100 : screenBrightness;
    screenBrightness = screenBrightness < 0 ? 0 : screenBrightness;
    this.setCapabilityValue('screenBrightness', screenBrightness)
    .catch(this.error);

    this.setCapabilityValue('isPlugged', stringToBoolean(this.station.isPlugged))
    .catch(this.error);

    if (this.station.sensorInfo !== undefined) {
      
      // Iterate through available sensors
      
      let sensor = {};
      for (var i = 0; i < this.station.sensorInfo.length; i++) { 
        //console.log(this.station.sensorInfo[i]);
        sensor = this.station.sensorInfo[i];
  
        if (sensor.type === 6) {
          if (this.hasCapability('measure_pressure') === true) {
            if (sensor.values !== undefined)
            await this.setCapabilityValue('measure_pressure', sensor.values[0])
            .catch(this.error);
          } else {
            this.log('Adding capability measure_pressure');
            await this.addCapability('measure_pressure').then( 
              this.setCapabilityValue('measure_pressure', sensor.values[0])
            )
          }
        } 
        
        if (sensor.type === 5) {
          if (this.hasCapability('measure_luminance') === true) {
            if (sensor.values !== undefined)
            await this.setCapabilityValue('measure_luminance', sensor.values[0])
            .catch(this.error);
          } else {
            this.log('Adding capability measure_luminance');
            await this.addCapability('measure_luminance').then( 
              this.setCapabilityValue('measure_luminance', sensor.values[0])
            )
          }
        }

      }
    } else {
      this.log('This devices doesn\'t have any sensors');
    }
  }

  async setValue(device, data, fromInterface) {

    let ip4, port, password;


    if (device !== undefined) {
      let deviceSettings = device.getSettings();
      this.log('deviceSettings', deviceSettings);

      ip4 = deviceSettings.ip4;
      port = deviceSettings.port;
      password = deviceSettings.password;
    } else {
      ip4 = this.settings.ip4;
      port = this.settings.port;
      password = this.settings.password;
    }

    let url = '';
    if (data.value || data.value === 0) url = `http://${ip4}:${port}/${data.action}=${data.value}&password=${password}`;
    else url = `http://${ip4}:${port}/${data.action}&password=${password}`;

    this.log(removePasswordFromUrl(url));

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 25000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      }).then(res => {
        return res.json();
      }).then(json => {
        return json;
      }).catch(error => {
        this.log(error);
        this.handleConnectionError(error, fromInterface);
        return;
      });

      if (response == undefined) {

        
      } else if (response !== undefined && response.status == "error") {
        // result not ok

        this.log('response not ok');
        this.log('response error', response.statustext);
        throw new Error(response.statustext);
      }

    } catch (error) {

      // result not ok
      this.log('Try/catch error:', error);
      throw new Error(error);
    
    } finally {
      clearTimeout(timeout);
    }
  }

  async getValues() {

    const url = `http://${this.settings.ip4}:${this.settings.port}/?cmd=deviceInfo&type=json&password=${this.settings.password}`;
    this.log(removePasswordFromUrl(url));

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
      }).then(json => {``
        return json;
      }).catch(error => {
        this.handleConnectionError(error, false);
      });

      if (response !== undefined && response.deviceName !== undefined) {
        // result ok
        this.station = response;

        this.setAvailable().catch(this.error);
        this.setStoreValue('station', response);
        this.setCurrentState();
        
      } else if (response !== undefined) {
        // result not ok

        this.log('response not ok');
        this.log('response error', response.error);
      }

    } catch (error) {

      // result not ok
      this.log('Try/catch error:', error);
    
    } finally {
      clearTimeout(timeout);
    }
  }

  async handleConnectionError(error, fromInterface) {
    if (error.code === 'ECONNREFUSED') {
      this.log('Connection refused');
      this.setUnavailable().catch(this.error);
    } else if (error.code === 'EHOSTUNREACH') {
      this.log('Host unreachable');
      this.setUnavailable().catch(this.error);
    } else {
      this.log('Error while getting values:', error);
    }

    if (fromInterface) {
      this.log('Sende error message to interface');
      throw new Error(this.homey.__('app.error.connection_failed') + error.message);
    }
  }
  
  async setInterval() {
    this.log('Set interval to ' + this.settings.update_interval + ' minutes');
    this.refreshInterval = this.homey.setInterval(this.getValues.bind(this), this.settings.update_interval * 1000 * 60);
  }

  async clearInterval() {
    this.log('Clearing interval');
    this.homey.clearInterval(this.refreshInterval);
  }

  async registerFlowListeners() {

    this.homey.flow.getConditionCard('isInScreensaver').registerRunListener(async (args, state) => {
      this.log('condition card \'isInScreensaver\' args:', args);
      this.log('condition card \'isInScreensaver\' state:', state);
      return stringToBoolean(this.station.isInScreensaver);
    });

    this.homey.flow.getActionCard('set-screen-state').registerRunListener(async args => {
      await this.setValue(
        args.device,
        { action: (args.onOff === "on" ? "?cmd=screenOn&type=json" : "?cmd=screenOff&type=json"), value : false }, 
        true
      );
      return true;
    });

    this.homey.flow.getActionCard('set-screen-brightness').registerRunListener(async args => {
      // { brightness: 250 } 
      // Range 0 - 250
      await this.setValue(
        args.device,
        { action: "?cmd=setStringSetting&type=json&key=screenBrightness&value", value: args.brightness },
        true
      );
      return true;
    });

    this.homey.flow.getActionCard('set-kiosk-lock').registerRunListener(async args => {
      //  { mode: 'unlock' }
      await this.setValue(
        args.device,
        { action: (args.mode === "lock" ? "?cmd=lockKiosk&type=json" : "?cmd=unlockKiosk&type=json"), value : false },
        true
      );
      return true;
    });

    this.homey.flow.getActionCard('set-maintenance-lock').registerRunListener(async args => {
      await this.setValue(
        args.device,
        { action: (args.mode === "lock" ? "?cmd=enableLockedMode&type=json" : "?cmd=disableLockedMode&type=json"), value : false },
        true
      );
      return true;
    });

    this.homey.flow.getActionCard('restart-app').registerRunListener(async args => {
      this.log(args);
      //  { mode: 'unlock' }
      await this.setValue(
        args.device,
        { action: '?cmd=restartApp&type=json', value : false },
        true
      );
      return true;
    });

    this.homey.flow.getActionCard('force-sleep').registerRunListener(async args => {
      this.log(args);
      //  { mode: 'unlock' }
      await this.setValue(
        args.device,
        { action: '?cmd=forceSleep&type=json', value : false },
        true
      );
      return true;
    });

  }

  async checkIpAddress(ipaddress) {
    this.log('Check ip address:', ipaddress);
    var ipformat = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    if (ipaddress.match(ipformat)) return true;
    else return false;
  }

}

function stringToBoolean(string) {
  if (string == "true" || string == 1 ) return true;
  if (string == "false" || string == 0 || string === undefined) return false;
}

function convertBrightnessToHomeyValues(value) {
  return Math.round(value / 25) * 10
}

function removePasswordFromUrl(url) {

  let chunks = url.split('&');
  let password = chunks[chunks.length -1 ];
  return url.replace(password, '') + 'password=[hidden]';

}

module.exports = MyDevice;