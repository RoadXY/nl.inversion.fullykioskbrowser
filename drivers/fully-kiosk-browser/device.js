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
      this.setAvailable()
        .catch(this.error);
    })
    .catch(err => {
      this.log(err);
    });

    this.registerFlowListeners();
    //this.getValues();

  }

  async onAdded() {
    this.log('MyDevice has been added');
  }

  async getDeviceDetails() {
    this.log('get device details');
    this.settings = this.getSettings();
    this.station = this.getStoreValue('station');

    this.log('Stored values:');
    this.log('Settings', this.settings);
    this.log('station', this.station);
  }

  async donDeleted() {
    this.log('Device is deleted');
    this.homey.clearInterval(this.refreshInterval);

  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('oldSettings:', oldSettings);
    this.log('newSettings:', newSettings);
    this.log('changedKeys:', changedKeys);

    if (changedKeys.includes('port') && (newSettings.port < 1 || newSettings.port > 65535)) {
      this.log(newSettings.port + ' isn\'t a valid port');
      throw new Error(this.homey.__('settings.port_number_incorrect'));
    } else {
      this.log('Port ' + newSettings.port + ' is valid');
    }

    if (changedKeys.includes('ip4')) {

      let isIpAddress = false;
      isIpAddress = await this.checkIpAddress(newSettings.ip4);

      if (!isIpAddress) {
        this.log(newSettings.ip4 + ' is not an valid ip address');
        throw new Error(this.homey.__('settings.ip_address_incorrect'));
      } else {
        this.log(newSettings.ip4 + ' is ip address');
      }
    }

    if (changedKeys.includes('update_interval')){
      this.homey.clearInterval(this.refreshInterval);
      this.setInterval();
    }

    this.log('getting settings');
    this.settings = this.getSettings();

  }

  async setCapabilityListeners() {

    this.registerCapabilityListener("screenOn", async (data) => {
      await this.setValue(
        { action: (data ? "?cmd=screenOn&type=json" : "?cmd=screenOff&type=json"), value : false },
        true
      );
    });

    this.registerCapabilityListener("screenBrightness", async (data) => {
      await this.setValue(
        { action: "?cmd=setStringSetting&type=json&key=screenBrightness&value", value: data * 25 },
        true
      );
    });

  }

  async checkCapabilities() {
    this.log('check capabilities');

    // Todo should fetch device info and update below capabilities

    if (this.station.sensorInfo !== undefined) {

      let sensor = {};

      for (var i = 0; i < this.station.sensorInfo.length; i++) { 
        console.log(this.station.sensorInfo[i]);
        sensor = this.station.sensorInfo[i];

        if (sensor.type === 6) {
          if (this.hasCapability('measure_pressure') === false) {
            await this.addCapability('measure_pressure');
          }
        }

      }

    } else {
      // This device does not report any sensors
      await this.removeCapability('measure_pressure').catch(this.error);
      await this.removeCapability('measure_luminance').catch(this.error);
    }

    if (this.hasCapability('kioskLocked') === false) {
      this.addCapability('kioskLocked');
    }
    
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

    let license = stringToBoolean(this.station.isLicensed);
    this.setCapabilityValue('hasLicense', license)
    .catch(this.error);

    this.setCapabilityValue('isInScreensaver', stringToBoolean(this.station.isInScreensaver))
    .catch(this.error);

    this.setCapabilityValue('screenOn', stringToBoolean(this.station.screenOn))
    .catch(this.error);

    this.setCapabilityValue('kioskLocked', stringToBoolean(this.station.kioskLocked))
    .catch(this.error);

    let screenBrightness = Math.round(this.station.screenBrightness/25.5);
    screenBrightness = screenBrightness > 10 ? 10 : screenBrightness;
    screenBrightness = screenBrightness < 0 ? 0 : screenBrightness;
    this.setCapabilityValue('screenBrightness', screenBrightness)
    .catch(this.error);

    this.setCapabilityValue('isPlugged', stringToBoolean(this.station.isPlugged))
    .catch(this.error);

    if (this.station.sensorInfo !== undefined) {
      
      // Iterate through available sensors
      
      let sensor = {};
      for (var i = 0; i < this.station.sensorInfo.length; i++) { 
        console.log(this.station.sensorInfo[i]);
        sensor = this.station.sensorInfo[i];
  
        if (sensor.type === 6) {
          if (this.hasCapability('measure_pressure') === true) {
            await this.setCapabilityValue('measure_pressure', sensor.values[0])
            .catch(this.error);
          }
        }
      }
    } else {
      this.log('This devices doesn\'t have any sensors');
    }

  }

  async setValue(data, fromInterface) {

    this.log('action:', data.action);
    this.log('setValue:', data.value);

    let url = '';
    if (data.value || data.value === 0) {
      this.log('has value');
      url = `http://${this.settings.ip4}:${this.settings.port}/${data.action}=${data.value}&password=${this.settings.password}`;
    } else {
      this.log('no value');
      url = `http://${this.settings.ip4}:${this.settings.port}/${data.action}&password=${this.settings.password}`;
    }

    this.log (url);

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

      this.log('response:', response);

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
    this.log (url);

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
        this.log('Error while getting values:', error);
        this.handleConnectionError(error, false);
      });

      this.log('response:', response);

      if (response !== undefined && response.deviceName !== undefined) {
        // result ok
        this.station = response;
        this.setCurrentState();
        this.setStoreValue('station', response);
        
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
      if (fromInterface) {
        throw new Error(this.homey__('app.error.connection_failed') + error.message);
      }
    }
  }
  
  async setInterval() {
    this.refreshInterval = this.homey.setInterval(this.getValues.bind(this), this.settings.update_interval * 1000 * 60);
  }

  async registerFlowListeners() {

    this.homey.flow.getActionCard('set-screen-state').registerRunListener(async args => {
      //  { onOff: 'on' }
      await this.setValue(
        { action: (args.onOff === "on" ? "?cmd=screenOn&type=json" : "?cmd=screenOff&type=json"), value : false }, 
        true
      );
      return true;
    });

    this.homey.flow.getActionCard('set-screen-brightness').registerRunListener(async args => {
      //  { brightness: 250 } p.s. range 0 - 250
      await this.setValue(
        { action: "?cmd=setStringSetting&type=json&key=screenBrightness&value", value: args.brightness },
        true
      );
      return true;
    });

    this.homey.flow.getActionCard('set-kiosk-lock').registerRunListener(async args => {
      this.log(args);
      //  { mode: 'unlock' }
      await this.setValue(
        { action: (args.mode === "lock" ? "?cmd=lockKiosk&type=json" : "?cmd=unlockKiosk&type=json"), value : false },
        true
      );
      return true;
    });

    this.homey.flow.getActionCard('set-maintenance-lock').registerRunListener(async args => {
      this.log(args);
      //  { mode: 'unlock' }
      await this.setValue(
        { action: (args.mode === "lock" ? "?cmd=enableLockedMode&type=json" : "?cmd=disableLockedMode&type=json"), value : false },
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

module.exports = MyDevice;