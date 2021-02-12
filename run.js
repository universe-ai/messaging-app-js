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

    const messagingApp = new MessagingApp(filePath, userConfig);
    messagingApp.init();
}

run();
