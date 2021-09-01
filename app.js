'use strict';

if (process.env.DEBUG === "1") {
  require("inspector").open(9229, "0.0.0.0", false);
  // require("inspector").open(9229, "0.0.0.0", true);
}


const Homey = require('homey');

class FullyKioskBrowser extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('FullyKioskBrowser has been initialized');
  }

}

module.exports = FullyKioskBrowser;
