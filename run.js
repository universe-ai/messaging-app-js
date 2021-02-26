#!/usr/bin/env node

/**
 * Usage:
 *  ./run.js user.json
 *
 * The user.json config file must conform to the ApplicationConfig specified in App.js.
 *
 */
const MessagingApp = require("./MessagingApp");

function run()
{
    const filePath = process.argv[2] || "./user1.json";
    const userConfig = {};

    // DEBUG: Set this to true to load config into memory already here.
    // This is to see that Config can work as in a browser environment.
    const testAsIfBrowser = false;

    let objectOrFilePath;

    if (testAsIfBrowser) {
        const fs = require("fs");
        objectOrFilePath = JSON.parse(fs.readFileSync(filePath));
        if (typeof objectOrFilePath.app.keyPair === "string") {
            objectOrFilePath.app.keyPair = JSON.parse(fs.readFileSync(objectOrFilePath.app.keyPair));
        }
    }
    else {
        objectOrFilePath = filePath;
    }

    const messagingApp = new MessagingApp(objectOrFilePath, userConfig);
    messagingApp.init();
}

run();
